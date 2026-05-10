"""process_deezer.py

Validates Deezer track IDs referenced by ../static/lisztnup.json, verifies their
availability, and strictly compares the Deezer track title against the expected
composer and part name.

Pipeline Architecture
-------------------
Phase 0 (Retroactive):
    Scans previously processed tracks for newly added banned artists and re-bans them.
Phase 1 (Concurrent I/O): 
    Fetches JSON metadata and MP3 previews concurrently. Handles rate limits, 
    caching, checks for banned artists, and immediately excludes tracks with API errors.
Phase 2 (Scoring): 
    Calculates similarity scores for all successfully fetched tracks.
Phase 3 (Interactive): 
    Presents tracks scoring below SIMILARITY_THRESHOLD to the user sequentially, 
    ensuring terminal output is clean and progress metrics are clear.

Classical Title Matching
------------------------
1. Unicode Normalization: Accents are safely flattened (e.g., 'ö' -> 'o').
2. Normalization: Standardizes catalogs (KV -> K), converts Roman numerals.
3. Catalog Bonus: Perfectly matching catalogs (Op., BWV) grant +20 points.
4. Arrangement Penalty: Unrequested arrangements ("arr.") subtract 40 points.
"""

import json
import asyncio
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, List

import aiohttp
from rapidfuzz import fuzz
from tqdm.asyncio import tqdm

# --- Configuration & Tuning ---

# Similarity Check Tuning
SIMILARITY_THRESHOLD = 60.0
AUTO_REJECT_THRESHOLD = 30.0

# Toggle: Set to True to recheck previously excluded IDs
RECHECK_EXCLUDED = False

# Network tuning
CONCURRENCY = 10          # Max concurrent HTTP requests
API_THROTTLE_SECONDS = 1  # Sleep after each Deezer API call

# Optional: download Deezer JSON + preview MP3 to a flat folder
DOWNLOAD_TRACKS = True
DOWNLOAD_LOCATION = Path("downloads")

# Manually ban certain artists that play arrangements
BANNED_ARTISTS = [
    'Rosemary Standley',
    'Berdien Stenberg',
    'Aasmund Nordstoga'
]


# --- Data Structures ---

@dataclass
class TrackEvaluation:
    deezer_id: int
    expected_original: str
    deezer_original: str
    expected_clean: str
    deezer_clean: str
    base_score: float
    bonus: float
    penalty: float
    final_score: float


# --- Domain-Specific Text Normalization ---

def clean_classical_title(title: str) -> str:
    """Cleans and standardizes classical music metadata text."""
    s = str(title)
    
    # 1. Flatten unicode accents safely
    s = unicodedata.normalize('NFKD', s).encode('ASCII', 'ignore').decode('utf-8')
    s = s.lower().replace('’', "'")  # Normalize apostrophes
    
    # 2. Replace connecting punctuation with spaces
    for char in ['-', '.', ',', ':', '(', ')', '[', ']']:
        s = s.replace(char, ' ')
    s = s.replace('&', ' and ')
    
    # 3. Standardize common classical music catalog/abbreviation synonyms
    s = re.sub(r'\bkv\b', 'k', s)
    s = re.sub(r'\bopus\b', 'op', s)
    s = re.sub(r'\bnumber\b', 'no', s)
    s = re.sub(r'\bnr\b', 'no', s)
    s = re.sub(r'\bdur\b', 'major', s)
    s = re.sub(r'\bmoll\b', 'minor', s)
    
    # 4. Remove certain words
    stop_words = {'for', 'in', 'the', 'a', 'an', 'movement', 'mvmt', 'remastered'}
    
    roman_to_arabic = {
        'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5',
        'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10',
        'xi': '11', 'xii': '12', 'xiii': '13', 'xiv': '14', 'xv': '15', 'xvi': '16',
        'xvii': '17', 'xviii': '18', 'xix': '19', 'xx': '20',
        'xxi': '21', 'xxii': '22', 'xxiii': '23', 'xxiv': '24', 'xxv': '25',
        'xxvi': '26', 'xxvii': '27', 'xxviii': '28', 'xxix': '29', 'xxx': '30'
    }
    
    tokens = []
    for t in re.split(r'[^\w]+', s):
        if not t: continue
        
        # Strip ordinal suffixes (1st -> 1)
        t = re.sub(r'^(\d+)(st|nd|rd|th)$', r'\1', t)
        
        # Map roman numerals to arabic
        if t in roman_to_arabic:
            t = roman_to_arabic[t]
            
        if t not in stop_words:
            tokens.append(t)
            
    return " ".join(tokens)


def evaluate_track(deezer_id: int, expected_title: str, deezer_title: str) -> TrackEvaluation:
    """Calculates similarity score, catalog bonuses, and arrangement penalties."""
    clean_expected = clean_classical_title(expected_title)
    clean_deezer = clean_classical_title(deezer_title)
    
    base_score = fuzz.token_set_ratio(clean_expected, clean_deezer)
    
    # Extract identifiers (e.g., "op 102", "bwv 815", "no 1")
    cat_pattern = r'\b(?:op|bwv|rv|hwv|k|d|hob|s|l|woo|swv|buxwv|fbwv|js)\s*\d+[a-z]?\b'
    num_pattern = r'\bno\s*\d+\b'
    
    cat_exp = set(re.findall(cat_pattern, clean_expected))
    cat_dez = set(re.findall(cat_pattern, clean_deezer))
    num_exp = set(re.findall(num_pattern, clean_expected))
    num_dez = set(re.findall(num_pattern, clean_deezer))
    
    bonus = 0.0
    if cat_exp and (cat_exp & cat_dez):
        bonus += 20.0
    if num_exp and (num_exp & num_dez):
        bonus += 10.0
        
    # Arrangement Penalty
    arr_keywords = {"arr", "arranged", "arrangement", "transcription"}
    exp_tokens = set(clean_expected.split())
    dez_tokens = set(clean_deezer.split())
    
    penalty = 0.0
    if bool(dez_tokens & arr_keywords) and not bool(exp_tokens & arr_keywords):
        penalty = 75.0
        
    final_score = max(0.0, min(100.0, base_score + bonus) - penalty)
    
    return TrackEvaluation(
        deezer_id=deezer_id,
        expected_original=expected_title,
        deezer_original=deezer_title,
        expected_clean=clean_expected,
        deezer_clean=clean_deezer,
        base_score=base_score,
        bonus=bonus,
        penalty=penalty,
        final_score=final_score
    )


# --- File I/O & Validation Helpers ---

def load_id_set(filename: str) -> set[int]:
    path = Path(filename)
    if path.exists():
        return {int(line.strip()) for line in path.read_text().splitlines() if line.strip()}
    path.write_text("")
    return set()

def save_id_set(filename: str, ids: set[int]) -> None:
    Path(filename).write_text("\n".join(map(str, sorted(ids))) + "\n")

def _ensure_download_location() -> None:
    if DOWNLOAD_TRACKS:
        DOWNLOAD_LOCATION.mkdir(parents=True, exist_ok=True)

def check_banned_artists(track_data: dict) -> bool:
    """Checks if any contributor in the JSON response matches the BANNED_ARTISTS list."""
    if not BANNED_ARTISTS or not track_data:
        return False
        
    banned_lower = [artist.lower() for artist in BANNED_ARTISTS]
    contributors = track_data.get("contributors", [])
    
    for contributor in contributors:
        c_name = contributor.get("name", "").lower()
        if any(banned in c_name for banned in banned_lower):
            return True
            
    return False


# --- Phase 1: Async Fetching ---

async def fetch_and_prepare_track(
    deezer_id: int,
    expected_title: str,
    session: aiohttp.ClientSession,
    semaphore: asyncio.Semaphore
) -> Tuple[str, int, Optional[str], bool]:
    """
    Fetches JSON and MP3. 
    Returns: (status, deezer_id, actual_deezer_title, has_banned_artist)
    status is one of: "success", "excluded", "retry"
    """
    json_path = DOWNLOAD_LOCATION / f"{deezer_id}.json"
    res = None

    # 1. Check Local Cache
    if json_path.exists():
        try:
            res = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            pass 

    # 2. Fetch from Network if needed
    if not res:
        async with semaphore:
            try:
                async with session.get(f"https://api.deezer.com/track/{deezer_id}") as resp:
                    res = await resp.json()

                if res.get("error", {}).get("code") in [4, 700]:
                    await asyncio.sleep(5)

                if DOWNLOAD_TRACKS:
                    try:
                        json_path.write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    except Exception:
                        pass

                await asyncio.sleep(API_THROTTLE_SECONDS)
            except Exception as e:
                await asyncio.sleep(API_THROTTLE_SECONDS)
                return "retry", deezer_id, None, False

    # 3. Analyze Response
    error = res.get("error")
    if error:
        return "excluded" if error.get("type") == "DataException" else "retry", deezer_id, None, False

    preview_url = res.get("preview")
    if not preview_url:
        return "excluded", deezer_id, None, False

    # 4. Check for banned artists & capture title
    is_banned = check_banned_artists(res)
    deezer_title = res.get("title", "")

    # 5. Download MP3
    if DOWNLOAD_TRACKS:
        mp3_path = DOWNLOAD_LOCATION / f"{deezer_id}.mp3"
        if not (mp3_path.exists() and mp3_path.stat().st_size > 0):
            async with semaphore:
                try:
                    async with session.get(preview_url) as resp:
                        resp.raise_for_status()
                        mp3_path.write_bytes(await resp.read())
                except Exception:
                    pass  # MP3 failure is non-fatal

    return "success", deezer_id, deezer_title, is_banned


async def run_fetch_phase(
    ids_list: List[int], 
    expected_titles: dict[int, str]
) -> Tuple[List[Tuple[int, Optional[str], bool]], set[int], set[int]]:
    """Executes Phase 1 with retries. Returns (successful_tracks, excluded_ids, retry_ids)"""
    successful_tracks = []
    excluded = set()
    retry_ids = set()
    
    semaphore = asyncio.Semaphore(CONCURRENCY)
    
    async with aiohttp.ClientSession() as session:
        # Primary Pass
        tasks = [
            fetch_and_prepare_track(did, expected_titles.get(did, ""), session, semaphore)
            for did in ids_list
        ]
        
        for coro in tqdm(asyncio.as_completed(tasks), total=len(ids_list), desc="Downloading Data"):
            status, did, dez_title, is_banned = await coro
            if status == "success":
                successful_tracks.append((did, dez_title, is_banned))
            elif status == "excluded":
                excluded.add(did)
            elif status == "retry":
                retry_ids.add(did)

        # Retry Pass
        if retry_ids:
            print(f"\nRetrying {len(retry_ids)} failed requests...")
            retry_tasks = [
                fetch_and_prepare_track(did, expected_titles.get(did, ""), session, semaphore)
                for did in retry_ids
            ]
            for coro in tqdm(asyncio.as_completed(retry_tasks), total=len(retry_tasks), desc="Retrying"):
                status, did, dez_title, is_banned = await coro
                if status == "success":
                    successful_tracks.append((did, dez_title, is_banned))
                else:
                    # Anything failing twice is permanently excluded
                    excluded.add(did)
    
    return successful_tracks, excluded, retry_ids


# --- Main Orchestrator ---

def build_expected_titles(data: dict) -> dict[int, str]:
    """Parses lisztnup.json to map every Deezer ID to its expected comparison title."""
    composer_last_names = {
        c["gid"]: c["name"].split(",")[0].strip() 
        for c in data.get("composers", [])
    }

    expected_titles = {}
    for work in data.get("works", []):
        composer_name = composer_last_names.get(work.get("composer_gid"), "Unknown")
        for part in work.get("parts", []):
            target_title = f"{composer_name} {part.get('name', '')}"
            for deezer_id in part.get("deezer", []):
                expected_titles[deezer_id] = target_title

    return expected_titles


def main():
    print("--- Setting Up ---")
    _ensure_download_location()
    
    excluded = load_id_set("DEEZER_EXCLUDED_IDS")
    processed = load_id_set("DEEZER_PROCESSED_IDS")
    banned = load_id_set("DEEZER_BANNED_IDS")
    
    # Phase 0: Retroactive Banned Artist Sweep
    if BANNED_ARTISTS:
        retroactively_banned = set()
        for did in list(processed):
            json_path = DOWNLOAD_LOCATION / f"{did}.json"
            if json_path.exists():
                try:
                    track_data = json.loads(json_path.read_text(encoding="utf-8"))
                    if check_banned_artists(track_data):
                        title = track_data.get("title", "Unknown Title")
                        print(f" [RETRO-BAN] Track contains newly banned artist: '{title}' (ID: {did})")
                        retroactively_banned.add(did)
                except Exception:
                    pass
        
        if retroactively_banned:
            print(f"\n[!] Retroactively banned {len(retroactively_banned)} previously processed tracks.")
            processed.difference_update(retroactively_banned)
            banned.update(retroactively_banned)
            save_id_set("DEEZER_PROCESSED_IDS", processed)
            save_id_set("DEEZER_BANNED_IDS", banned)

    banned_count = len(banned)
    
    with Path("../static/lisztnup.json").open("r", encoding="utf-8") as f:
        data = json.load(f)

    expected_titles = build_expected_titles(data)
    
    if RECHECK_EXCLUDED:
        ids_to_check = list(excluded)
        print(f"Recheck mode: verifying {len(ids_to_check)} previously excluded IDs.")
    else:
        ids_to_check = list(set(expected_titles.keys()) - excluded - processed - banned)
        print(f"Normal mode: {len(ids_to_check)} IDs left to process.")

    if not ids_to_check:
        print("Everything is up to date! Exiting.")
        return

    # Phase 1: Concurrent Data Fetching
    print("\n--- Phase 1: Fetching Metadata & MP3s ---")
    successful_fetches, new_excluded, _ = asyncio.run(run_fetch_phase(ids_to_check, expected_titles))
    
    # Update state with newly excluded items
    excluded.update(new_excluded)
    if RECHECK_EXCLUDED:
        for did in [t[0] for t in successful_fetches]:
            excluded.discard(did)
    save_id_set("DEEZER_EXCLUDED_IDS", excluded)

    if not successful_fetches:
        print("No valid tracks retrieved. Exiting.")
        return

    # Phase 2: Similarity Evaluation & Banned Checks
    print("\n--- Phase 2: Scoring Metadata ---")
    auto_accepted = []
    needs_review = []

    for did, dez_title, is_banned in successful_fetches:
        if is_banned:
            print(f" [BANNED-ARTIST] Auto-Rejecting '{dez_title}' (ID: {did})")
            banned.add(did)
            continue

        exp_title = expected_titles.get(did, "")
        eval_data = evaluate_track(did, exp_title, dez_title)
        
        if eval_data.final_score >= SIMILARITY_THRESHOLD:
            auto_accepted.append(did)
        elif eval_data.final_score < AUTO_REJECT_THRESHOLD:
            print(f" [AUTO-REJECT] '{dez_title}' (ID: {did}) | Score: {eval_data.final_score:.1f} | Expected: '{exp_title}'")
            banned.add(did)
        else:
            needs_review.append(eval_data)
            
    # Sort reviews by the expected original title for deterministic review order
    needs_review.sort(key=lambda e: e.expected_original.lower())

    print(f"\nPhase 2 Complete:")
    print(f"  Auto-accepted : {len(auto_accepted)} tracks.")
    print(f"  Auto-rejected : {len(banned) - banned_count} tracks (includes Banned Artists).")
    print(f"  Needs review  : {len(needs_review)} tracks.")
    
    processed.update(auto_accepted)
    save_id_set("DEEZER_PROCESSED_IDS", processed)
    save_id_set("DEEZER_BANNED_IDS", banned)

    # Phase 3: Interactive Review (Sequential)
    if needs_review:
        print("\n--- Phase 3: Manual Review ---")
        
        for idx, eval_data in enumerate(needs_review, 1):
            print(f"\n=======================================================")
            print(f" [Reviewing {idx} of {len(needs_review)}] - Deezer ID: https://www.deezer.com/track/{eval_data.deezer_id}")
            print(f"=======================================================")
            print(f" Expected : {eval_data.expected_original}")
            print(f" Deezer   : {eval_data.deezer_original}")
            print(f" ---")
            print(f" Expected (Clean) : {eval_data.expected_clean}")
            print(f" Deezer   (Clean) : {eval_data.deezer_clean}")
            print(f" ---")
            print(f" Base Score : {eval_data.base_score:.1f}")
            if eval_data.bonus > 0:
                print(f" Catalog +  : +{eval_data.bonus:.1f}")
            if eval_data.penalty > 0:
                print(f" Arr. Penal : -{eval_data.penalty:.1f}")
            print(f" Final      : {eval_data.final_score:.1f} (Threshold: {SIMILARITY_THRESHOLD})")
            
            while True:
                ans = input("\n Accept this track? [y/n]: ").strip().lower()
                if ans in ['y', 'yes', '']:
                    print(f" [MANUAL-ACCEPT] Logged (ID: {eval_data.deezer_id})")
                    processed.add(eval_data.deezer_id)
                    break
                elif ans in ['n', 'no']:
                    print(f" [MANUAL-REJECT] Logged (ID: {eval_data.deezer_id})")
                    banned.add(eval_data.deezer_id)
                    break
                else:
                    print(" Please answer 'y' or 'n'.")
                    
            # Save incrementally in case user exits early
            save_id_set("DEEZER_PROCESSED_IDS", processed)
            save_id_set("DEEZER_BANNED_IDS", banned)

    print("\n--- Summary ---")
    print(f"Total Processed: {len(processed)}")
    print(f"Total Excluded : {len(excluded)}")
    print(f"Total Banned   : {len(banned)}")
    print("Done.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProcess interrupted by user. Saved state safely. Exiting...")
