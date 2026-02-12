"""process_deezer.py

Checks Deezer track IDs referenced by ../static/lisztnup.json and maintains two
flat text files in the current working directory:

- excluded_deezer_ids
    Deezer IDs that should be ignored by the app/tools because they have no
    preview or are otherwise unusable.
- processed_deezer_ids
    Deezer IDs that have already been checked so subsequent runs can resume
    quickly.

The script queries Deezer's public API endpoint:

    https://api.deezer.com/track/<id>

For each ID, it decides whether to exclude it based on the API response:

- If the response contains an "error":
    - "DataException" is treated as a permanent failure => exclude.
    - Other errors are queued for a single retry pass.
- If there is no error but the track has no "preview" URL => exclude.

Modes
-----

Normal mode (RECHECK_EXCLUDED = False)
    Checks IDs found in lisztnup.json that are not in excluded/processed yet.

Recheck mode (RECHECK_EXCLUDED = True)
    Re-validates all IDs currently in excluded_deezer_ids and removes any that
    now have a preview available.

Optional downloads
------------------

If DOWNLOAD_TRACKS is enabled, the script additionally writes a flat cache of
API responses and preview MP3s into DOWNLOAD_LOCATION:

- <DOWNLOAD_LOCATION>/<id>.json   (full Deezer API response)
- <DOWNLOAD_LOCATION>/<id>.mp3    (preview audio, if available)

These downloads are best-effort: failures to write JSON or download MP3 will be
printed but will not change the exclude/processed decision.

Notes
-----

- Paths are relative to the process working directory. This script is typically
    run from the data/ folder so that ../static/lisztnup.json resolves correctly.
- CONCURRENCY controls in-flight requests; API_THROTTLE_SECONDS adds an
    additional delay per request to reduce rate-limit pressure.
"""

import json
import os
from pathlib import Path
import asyncio
import aiohttp
from tqdm.asyncio import tqdm



# Toggle: Set to True to recheck previously excluded IDs and remove them if they now have previews
RECHECK_EXCLUDED = False

# Network tuning
CONCURRENCY = 10          # Max concurrent HTTP requests
API_THROTTLE_SECONDS = 1  # Sleep after each Deezer API call

# Optional: download Deezer JSON + preview MP3 to a flat folder
DOWNLOAD_TRACKS = True
DOWNLOAD_LOCATION = Path("downloads")  # e.g. downloads/123213.json and downloads/123213.mp3


def _ensure_download_location() -> None:
    if DOWNLOAD_TRACKS:
        DOWNLOAD_LOCATION.mkdir(parents=True, exist_ok=True)


def _write_json_flat(deezer_id: int, payload: dict) -> None:
    """Write Deezer response JSON to <DOWNLOAD_LOCATION>/<id>.json (flat)."""
    out_path = DOWNLOAD_LOCATION / f"{deezer_id}.json"
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


async def _download_preview_mp3(session: aiohttp.ClientSession, deezer_id: int, preview_url: str) -> None:
    """Download preview MP3 to <DOWNLOAD_LOCATION>/<id>.mp3 (flat)."""
    out_path = DOWNLOAD_LOCATION / f"{deezer_id}.mp3"
    if out_path.exists() and out_path.stat().st_size > 0:
        return

    async with session.get(preview_url) as resp:
        resp.raise_for_status()
        out_path.write_bytes(await resp.read())


async def fetch_deezer(
    semaphore: asyncio.Semaphore,
    session: aiohttp.ClientSession,
    deezer_id: int,
) -> tuple[int, dict]:
    """
    Fetch Deezer track info asynchronously with concurrency limit.

    Returns (deezer_id, response_dict).
    """
    async with semaphore:
        try:
            async with session.get(f"https://api.deezer.com/track/{deezer_id}") as resp:
                res = await resp.json()

            # Check for quota or service busy
            error = res.get("error")
            if error and error.get("code") in [4, 700]:
                print(f"Rate limit hit for {deezer_id}, sleeping 5 seconds...")
                await asyncio.sleep(5)

            # Optional downloads
            if DOWNLOAD_TRACKS:
                try:
                    _write_json_flat(deezer_id, res)
                except Exception as e:
                    print(f"Failed to write JSON for {deezer_id}: {e}")

                preview_url = res.get("preview")
                if preview_url:
                    try:
                        await _download_preview_mp3(session, deezer_id, preview_url)
                    except Exception as e:
                        print(f"Failed to download MP3 for {deezer_id}: {e}")

            await asyncio.sleep(API_THROTTLE_SECONDS)  # Throttle after each API call
            return deezer_id, res
        except Exception as e:
            # Throttle even on exception
            await asyncio.sleep(API_THROTTLE_SECONDS)
            err_res = {"error": {"type": "Exception", "message": str(e), "code": 0}}
            if DOWNLOAD_TRACKS:
                try:
                    _write_json_flat(deezer_id, err_res)
                except Exception:
                    pass
            return deezer_id, err_res


def load_excluded() -> set[int]:
    """Load excluded Deezer IDs from file, create empty file if not exists."""
    path = Path("excluded_deezer_ids")
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    else:
        path.write_text("")
        return set()


def load_processed() -> set[int]:
    """Load processed Deezer IDs from file, create empty file if not exists."""
    path = Path("processed_deezer_ids")
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    else:
        path.write_text("")
        return set()


def save_processed(processed: set[int]) -> None:
    """Save processed Deezer IDs to file."""
    Path("processed_deezer_ids").write_text("\n".join(map(str, sorted(processed))) + "\n")


async def main() -> None:
    """
    Main function to check Deezer IDs for validity.
    """
    _ensure_download_location()
    
    # Load data
    excluded = load_excluded()
    processed = load_processed()
    print(f"Loaded {len(excluded)} excluded and {len(processed)} processed Deezer IDs.")

    # Load JSON data
    json_path = Path("../static/lisztnup.json")
    with json_path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    # Collect all Deezer IDs to check
    ids_to_check = set()
    
    if RECHECK_EXCLUDED:
        # Recheck mode: check all previously excluded IDs
        ids_to_check = excluded.copy()
        print(f"Recheck mode: will verify {len(ids_to_check)} previously excluded IDs.")
    else:
        # Normal mode: check IDs not excluded or processed
        for work in data["works"]:
            for part in work["parts"]:
                for deezer_id in part["deezer"]:
                    if deezer_id not in excluded and deezer_id not in processed:
                        ids_to_check.add(deezer_id)

    ids_list = list(ids_to_check)
    print(f"Found {len(ids_list)} Deezer IDs to check.")

    if not ids_list:
        print("No IDs to check. Exiting.")
        return

    semaphore = asyncio.Semaphore(CONCURRENCY)
    new_excluded = 0
    removed_from_excluded = 0  # Track IDs removed from excluded list in recheck mode
    retry_ids = set()

    async with aiohttp.ClientSession() as session:
        # Create tasks
        tasks = [fetch_deezer(semaphore, session, did) for did in ids_list]

        with tqdm(total=len(ids_list), desc="Checking IDs") as pbar:
            for coro in asyncio.as_completed(tasks):
                deezer_id, res = await coro
                processed.add(deezer_id)
                error = res.get("error")

                if RECHECK_EXCLUDED:
                    # Recheck mode: remove from excluded if preview is now available
                    if not error and res.get("preview"):
                        excluded.discard(deezer_id)
                        removed_from_excluded += 1
                        Path("excluded_deezer_ids").write_text("\n".join(map(str, sorted(excluded))) + "\n")
                        print(f"Removed {deezer_id} from excluded (preview now available)")
                    # If still no preview or error, keep it in excluded (do nothing)
                else:
                    # Normal mode: add to excluded if no preview or error
                    if error:
                        error_type = error.get("type")
                        error_code = error.get("code", 0)
                        if error_type == "DataException":
                            # Treat as failure
                            excluded.add(deezer_id)
                            with Path("excluded_deezer_ids").open("a", encoding="utf-8") as f:
                                f.write(f"{deezer_id}\n")
                            new_excluded += 1
                            print(f"Excluded {deezer_id} (DataException)")
                        else:
                            retry_ids.add(deezer_id)
                            print(f"Retrying later: {deezer_id} (code {error_code})")
                    elif not res.get("preview"):
                        # No preview, exclude
                        excluded.add(deezer_id)
                        with Path("excluded_deezer_ids").open("a", encoding="utf-8") as f:
                            f.write(f"{deezer_id}\n")
                        new_excluded += 1
                        print(f"Excluded {deezer_id} (no preview)")

                pbar.update(1)
                if len(processed) % 100 == 0:
                    save_processed(processed)

    # Save progress
    save_processed(processed)
    
    if RECHECK_EXCLUDED:
        print(f"Recheck complete. Removed {removed_from_excluded} IDs from excluded list. Total excluded: {len(excluded)}")
    else:
        # Normal mode
        print(f"Progress saved. Newly excluded: {new_excluded}, Total excluded: {len(excluded)}")

    # Handle retries
    if retry_ids:
        print(f"Retrying {len(retry_ids)} IDs...")
        # Add back to ids_list and process once more
        retry_list = list(retry_ids - processed)  # Avoid duplicates
        if retry_list:
            async with aiohttp.ClientSession() as session:
                retry_tasks = [fetch_deezer(semaphore, session, did) for did in retry_list]
                for coro in asyncio.as_completed(retry_tasks):
                    deezer_id, res = await coro
                    processed.add(deezer_id)
                    error = res.get("error")
                    if error:
                        error_type = error.get("type")
                        if error_type == "DataException":
                            excluded.add(deezer_id)
                            with Path("excluded_deezer_ids").open("a", encoding="utf-8") as f:
                                f.write(f"{deezer_id}\n")
                            new_excluded += 1
                            print(f"Excluded {deezer_id} (DataException on retry)")
                        else:
                            # Still error, exclude
                            excluded.add(deezer_id)
                            with Path("excluded_deezer_ids").open("a", encoding="utf-8") as f:
                                f.write(f"{deezer_id}\n")
                            new_excluded += 1
                            print(f"Excluded {deezer_id} (error on retry: {error_type})")
                    elif not res.get("preview"):
                        excluded.add(deezer_id)
                        with Path("excluded_deezer_ids").open("a", encoding="utf-8") as f:
                            f.write(f"{deezer_id}\n")
                        new_excluded += 1
                        print(f"Excluded {deezer_id} (no preview on retry)")

                if len(processed) % 100 == 0:
                    save_processed(processed)
                save_processed(processed)
                print(f"Retry complete. Total newly excluded: {new_excluded}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())