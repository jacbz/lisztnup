"""
add_year_numbers.py

Task: 
Parses a list of missing MusicBrainz Work GIDs, fetches composition dates 
from Wikidata, IMSLP, and AllMusic, and maps the UUIDs to integer years 
or ranges in a YAML file.

Logic Pipeline:
1. Loads GIDs from "../missing_year_numbers.txt".
2. Queries the MusicBrainz API for associated URL relations.
3. Evaluates sources in order of preference: Wikidata > IMSLP > AllMusic.
4. Parsing Rules:
   - Single Year -> `1767`
   - Range -> `[1777, 1779]`
   - Composed Until -> `[null, 1742]`
5. Writes/appends successfully found dates to "WORK_YEAR_NUMBERS.yml".
6. Keeps a "checked_gids.txt" state file to resume gracefully without hitting APIs twice.

Note: Only composition dates are extracted. Publication dates are ignored.

Usage:
  Run script normally:   python add_year_numbers.py
  Run strict unit tests: python add_year_numbers.py --test
"""

import os
import sys
import re
import time
import yaml
import logging
import requests
import unittest
from tqdm import tqdm
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# ==========================================
# Config & Setup
# ==========================================
load_dotenv()

MB_USER_AGENT = os.getenv("MB_USER_AGENT", "LisztnUp/1.0.0 (mail@jacobzhang.de)")
WD_ACCESS_TOKEN = os.getenv("WD_ACCESS_TOKEN")
PROCESS_RATE_SECONDS = float(os.getenv("PROCESS_RATE_SECONDS", "1.0"))

INPUT_FILE = "../missing_year_numbers.txt"
OUTPUT_FILE = "WORK_YEAR_NUMBERS.yml"
CHECKED_GIDS_FILE = "checked_gids.txt"
LOG_FILE = "add_year_numbers.log"

SCRAPE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
}

# ==========================================
# Detailed Logging Configuration
# ==========================================
logger = logging.getLogger("lisztnup")
logger.setLevel(logging.DEBUG)

# Clear the log file at startup
if os.path.exists(LOG_FILE):
    os.remove(LOG_FILE)

# Write log details to a file to prevent tqdm console clutter
fh = logging.FileHandler(LOG_FILE, mode='a', encoding='utf-8')
fh.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
fh.setFormatter(formatter)
logger.addHandler(fh)
logger.propagate = False # Prevent double printing to console if root logger is active

# Silence noisy third-party loggers
logging.getLogger("urllib3").setLevel(logging.WARNING)


# ==========================================
# Helpers
# ==========================================
def parse_year_text(text):
    """
    Robust year parser handling human-written date formats from free-text sources.
    Only returns EXACT years or ranges - no imprecise decades/centuries.
    
    Returns:
        int: Single year (e.g., 1767)
        [int, int]: Year range (e.g., [1777, 1779])
        [None, int]: Composed until/before (e.g., [None, 1742])
        [int, None]: Composed after/from (e.g., [1800, None])
        None: Could not parse or too imprecise
    
    Supported formats:
        - "1767", "ca. 1767", "c. 1767", "circa 1767"
        - "1777-1779", "1777–1779", "1777 - 1779"
        - "1777-79", "1715-22" (year ranges)
        - "before 1742", "1707 or before", "by 1742"
        - "after 1800", "1800 or after", "from 1800"
        - "1715-22 ca.", "ca. 1715-22"
        - "1767?", "1767 (?)", "[1767]", "~1767"
        - "between 1750 and 1760"
        - ISO dates: "1788-06-22", "1821/09/15" (extracts year only)
        - Dates with locations: "1788/06/22 in Vienna" (extracts year only)
        - Month-year: "April 1824", "1824-04" (extracts year only)
    
    Rejected (too imprecise):
        - "1700s", "early 1700s", "mid-1700s", "late 1700s"
        - "18th century", "early 18th century", etc.
    """
    if not text:
        return None
        
    original_text = text
    text = text.replace('\n', ' ').strip()
    logger.debug(f"[Parser] Parsing year text: '{text}'")
    
    # Normalize common variations
    text = re.sub(r'\s+', ' ', text)  # Collapse whitespace
    text = text.replace('–', '-').replace('—', '-')  # Normalize dashes
    
    # ============================================================
    # REJECT IMPRECISE PATTERNS FIRST (before fallback patterns)
    # ============================================================
    
    # Reject decades: "1700s", "early 1700s", "mid-1700s", "late 1700s"
    if re.search(r'\b(?:early|mid(?:dle)?|late)?\s*\d{4}s\b', text, re.IGNORECASE):
        logger.debug(f"[Parser] Rejected imprecise decade pattern: '{original_text}'")
        return None
    
    # Reject centuries: "18th century", "early 18th century", etc.
    if re.search(r'\b(?:early|mid(?:dle)?|late)?\s*\d{1,2}(?:st|nd|rd|th)\s+century\b', text, re.IGNORECASE):
        logger.debug(f"[Parser] Rejected imprecise century pattern: '{original_text}'")
        return None
    
    # ============================================================
    # PATTERN 0: Month names with years (e.g., "April 1824", "1824 April")
    # ============================================================
    months = r'(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)'
    match = re.search(rf'{months}\s+(\d{{4}})', text, re.IGNORECASE)
    if match:
        year = int(match.group(1))
        logger.debug(f"[Parser] Matched month-year pattern, extracting year: {year}")
        return year
    
    match = re.search(rf'(\d{{4}})\s+{months}', text, re.IGNORECASE)
    if match:
        year = int(match.group(1))
        logger.debug(f"[Parser] Matched year-month pattern, extracting year: {year}")
        return year
    
    # ============================================================
    # PATTERN 1: ISO dates and full dates (MUST come before range patterns!)
    # Examples: "1788-06-22", "1788/06/22", "1821-09-15 in Paris"
    # These look like ranges but are actually single dates
    # ============================================================
    
    # ISO date: YYYY-MM-DD or YYYY/MM/DD (with optional location/text after)
    match = re.search(r'\b(\d{4})[-/](\d{2})[-/](\d{2})\b', text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3))
        # Validate it's a real date (month 1-12, day 1-31)
        if 1 <= month <= 12 and 1 <= day <= 31:
            logger.debug(f"[Parser] Matched ISO date pattern (YYYY-MM-DD), extracting year: {year}")
            return year
    
    # Partial date: YYYY-MM or YYYY/MM (year and month only)
    # Must have NO space around the separator to distinguish from ranges like "1799 - 02"
    match = re.search(r'\b(\d{4})[-/](\d{2})(?:\s|$|[,;.])', text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        # Validate it's a real month (1-12)
        if 1 <= month <= 12:
            logger.debug(f"[Parser] Matched YYYY-MM date pattern, extracting year: {year}")
            return year
    
    # ============================================================
    # PATTERN 2: "YYYY or before", "before YYYY", "by YYYY"
    # ============================================================
    match = re.search(r'(\d{4})\s+or\s+before', text, re.IGNORECASE)
    if match:
        result = [None, int(match.group(1))]
        logger.debug(f"[Parser] Matched 'YYYY or before' pattern: {result}")
        return result
    
    match = re.search(r'(?:before|by)\s+(\d{4})', text, re.IGNORECASE)
    if match:
        result = [None, int(match.group(1))]
        logger.debug(f"[Parser] Matched 'before/by YYYY' pattern: {result}")
        return result
    
    # ============================================================
    # PATTERN 3: "after YYYY", "YYYY or after", "from YYYY"
    # ============================================================
    match = re.search(r'(\d{4})\s+or\s+after', text, re.IGNORECASE)
    if match:
        result = [int(match.group(1)), None]
        logger.debug(f"[Parser] Matched 'YYYY or after' pattern: {result}")
        return result
    
    match = re.search(r'(?:after|from)\s+(\d{4})', text, re.IGNORECASE)
    if match:
        result = [int(match.group(1)), None]
        logger.debug(f"[Parser] Matched 'after/from YYYY' pattern: {result}")
        return result
    
    # ============================================================
    # PATTERN 4: Full range "YYYY-YYYY" (with optional ca./circa)
    # Examples: "1777-1779", "ca. 1777-1779", "1777-1779 ca."
    # Must ensure both parts are 4 digits to avoid matching dates
    # ============================================================
    match = re.search(r'(?:ca\.?|circa|c\.?)?\s*(\d{4})\s*-\s*(\d{4})(?:\s*(?:ca\.?|circa|c\.?))?', text, re.IGNORECASE)
    if match:
        y1, y2 = int(match.group(1)), int(match.group(2))
        # Sanity check: ensure it's a valid range (y2 > y1 and reasonable span)
        if y1 < y2 and (y2 - y1) <= 100:
            result = [y1, y2]
            logger.debug(f"[Parser] Matched full range 'YYYY-YYYY' pattern: {result}")
            return result
        else:
            logger.debug(f"[Parser] Rejected invalid range: {y1}-{y2}")
    
    # ============================================================
    # PATTERN 5: Short range "YYYY-YY" or "YYYY - YY" (with optional ca./circa)
    # Examples: "1777-79", "1715-22", "1799 - 02", "1715-22 ca.", "ca. 1715-22"
    # Smart heuristics to distinguish from dates:
    # - If YY > 12: definitely a year range (not a month)
    # - If YY <= 12 AND has spaces around dash: likely a year range
    # - If YY <= 12 AND no spaces: likely a date (reject)
    # ============================================================
    match = re.search(r'(?:ca\.?|circa|c\.?)?\s*(\d{4})\s*(-)\s*(\d{2})(?:\s*(?:ca\.?|circa|c\.?))?(?:\s|$|[,;.])', text, re.IGNORECASE)
    if match:
        y1, separator_context, y2_short = match.group(1), match.group(2), match.group(3)
        y2_int = int(y2_short)
        
        # Check if there's whitespace around the dash
        has_space_before = text[match.start(2)-1:match.start(2)].isspace() if match.start(2) > 0 else False
        has_space_after = text[match.end(2):match.end(2)+1].isspace() if match.end(2) < len(text) else False
        has_spaces = has_space_before or has_space_after
        
        # Decision logic:
        # 1. If y2 > 31: definitely a year (can't be day or month)
        # 2. If y2 > 12: definitely a year (can't be month)
        # 3. If y2 <= 12 AND has spaces around dash: likely year range
        # 4. If y2 <= 12 AND no spaces: likely date (reject)
        
        if y2_int > 31:
            # Definitely a year
            is_year_range = True
        elif y2_int > 12:
            # Can't be a month, must be a year
            is_year_range = True
        elif has_spaces:
            # Spaces suggest year range (e.g., "1799 - 02")
            is_year_range = True
        else:
            # No spaces and could be month: likely a date
            is_year_range = False
        
        if is_year_range:
            century = int(y1[:2])
            # Handle turn of the century edge case (e.g. 1799-01 -> 1801)
            if y2_int < int(y1[2:]):
                century += 1
            y2 = int(f"{century:02d}{y2_short}")
            result = [int(y1), y2]
            logger.debug(f"[Parser] Matched short range 'YYYY-YY' pattern: {result}")
            return result
        else:
            logger.debug(f"[Parser] Rejected YYYY-YY pattern (looks like date): {y1}-{y2_short}")
    
    # ============================================================
    # PATTERN 6: Between "between YYYY and YYYY"
    # ============================================================
    match = re.search(r'between\s+(\d{4})\s+and\s+(\d{4})', text, re.IGNORECASE)
    if match:
        result = [int(match.group(1)), int(match.group(2))]
        logger.debug(f"[Parser] Matched 'between YYYY and YYYY' pattern: {result}")
        return result
    
    # ============================================================
    # PATTERN 7: Single year with qualifiers
    # Examples: "1767", "ca. 1767", "c. 1767", "circa 1767", 
    #           "1767?", "1767 (?)", "[1767]", "~1767"
    # ============================================================
    match = re.search(r'(?:ca\.?|circa|c\.?|~)?\s*[\[\(]?\s*(\d{4})\s*[\]\)]?\s*\??', text, re.IGNORECASE)
    if match:
        result = int(match.group(1))
        logger.debug(f"[Parser] Matched single year pattern: {result}")
        return result
    
    # ============================================================
    # FALLBACK: Any 4-digit year (last resort)
    # ============================================================
    match = re.search(r'\b(\d{4})\b', text)
    if match:
        result = int(match.group(1))
        logger.debug(f"[Parser] Matched fallback single year: {result}")
        return result
    
    logger.warning(f"[Parser] ⚠️  No year pattern matched in text: '{original_text}'")
    return None

def extract_year_from_snak(snak):
    """Helper to pull the year integer from a Wikidata snak dictionary."""
    logger.debug(f"[Wikidata] Extracting year from snak: snaktype={snak.get('snaktype')}")
    
    if snak.get('snaktype') == 'value':
        datavalue = snak.get('datavalue', {})
        value = datavalue.get('value', {})
        time_str = value.get('time', '')
        
        logger.debug(f"[Wikidata] Time string from snak: {time_str}")
        
        match = re.search(r'[+-](\d{4})', time_str)
        if match:
            year = int(match.group(1))
            logger.debug(f"[Wikidata] Extracted year: {year}")
            return year
        else:
            logger.debug(f"[Wikidata] Could not match year pattern in time string: {time_str}")
    else:
        logger.debug(f"[Wikidata] Snak type is not 'value', cannot extract year")
    
    return None

# ==========================================
# Extraction Core
# ==========================================
def get_urls_from_mb(gid):
    url = f"https://musicbrainz.org/ws/2/work/{gid}?inc=url-rels&fmt=json"
    headers = {'User-Agent': MB_USER_AGENT}
    logger.debug(f"[{gid}] Fetching MusicBrainz data from: {url}")
    
    resp = requests.get(url, headers=headers)
    resp.raise_for_status()
    logger.debug(f"[{gid}] MusicBrainz API response status: {resp.status_code}")
    
    data = resp.json()
    urls = {'wikidata': None, 'imslp': None, 'allmusic': None}
    
    relations = data.get('relations', [])
    logger.debug(f"[{gid}] Found {len(relations)} relations in MusicBrainz data")
    
    for rel in relations:
        if rel.get('target-type') == 'url':
            target_url = rel.get('url', {}).get('resource', '')
            logger.debug(f"[{gid}] Examining URL relation: {target_url}")
            
            if 'wikidata.org' in target_url:
                urls['wikidata'] = target_url
                logger.info(f"[{gid}] Found Wikidata URL: {target_url}")
            elif 'imslp.org' in target_url:
                urls['imslp'] = target_url
                logger.info(f"[{gid}] Found IMSLP URL: {target_url}")
            elif 'allmusic.com' in target_url:
                urls['allmusic'] = target_url
                logger.info(f"[{gid}] Found AllMusic URL: {target_url}")
    
    logger.info(f"[{gid}] URL discovery complete - Wikidata: {bool(urls['wikidata'])}, IMSLP: {bool(urls['imslp'])}, AllMusic: {bool(urls['allmusic'])}")
    return urls

def get_year_from_wikidata(url):
    qid = url.rstrip('/').split('/')[-1].upper()
    logger.debug(f"[Wikidata] Extracted QID: {qid} from URL: {url}")
    
    api_url = f"https://www.wikidata.org/w/api.php?action=wbgetentities&ids={qid}&props=claims&format=json"
    logger.debug(f"[Wikidata] API URL: {api_url}")
    
    headers = {'User-Agent': MB_USER_AGENT}
    if WD_ACCESS_TOKEN:
        headers['Authorization'] = f"Bearer {WD_ACCESS_TOKEN}"
        logger.debug(f"[Wikidata] Using access token for authentication")
    else:
        logger.debug(f"[Wikidata] No access token configured, using anonymous access")
        
    resp = requests.get(api_url, headers=headers)
    resp.raise_for_status()
    logger.debug(f"[Wikidata] API response status: {resp.status_code}")
    
    response_json = resp.json()
    entities = response_json.get('entities', {})
    
    if not entities:
        logger.warning(f"[Wikidata] No entities found in response for QID: {qid}")
        logger.debug(f"[Wikidata] Full response: {response_json}")
        return None
    
    logger.debug(f"[Wikidata] Found {len(entities)} entities in response")
    
    # ALWAYS read the first dictionary value to avoid QID redirect bugs
    entity = list(entities.values())[0]
    actual_qid = entity.get('id', qid)
    
    if actual_qid != qid:
        logger.info(f"[Wikidata] QID redirect detected: {qid} -> {actual_qid}")
    
    claims = entity.get('claims', {})
    logger.debug(f"[Wikidata] Available properties in claims: {list(claims.keys())}")
    
    # Check ONLY Inception (P571) - composition date
    prop = 'P571'
    prop_name = 'Inception'
    
    if prop in claims:
        logger.debug(f"[Wikidata] Found property {prop} ({prop_name}) with {len(claims[prop])} claims")
        claim = claims[prop][0]
        qualifiers = claim.get('qualifiers', {})
        
        logger.debug(f"[Wikidata] Property {prop} qualifiers: {list(qualifiers.keys())}")
        
        # 1. Attempt to parse range via qualifiers: P580 (start) & P582 (end)
        start_year = extract_year_from_snak(qualifiers.get('P580', [{}])[0]) if 'P580' in qualifiers else None
        end_year = extract_year_from_snak(qualifiers.get('P582', [{}])[0]) if 'P582' in qualifiers else None
        
        if start_year:
            logger.debug(f"[Wikidata] Found start year (P580) in qualifiers: {start_year}")
        if end_year:
            logger.debug(f"[Wikidata] Found end year (P582) in qualifiers: {end_year}")
        
        if start_year and end_year:
            logger.info(f"[Wikidata] Extracted year range from {prop} ({prop_name}): [{start_year}, {end_year}]")
            return [start_year, end_year]
        
        # 2. Fall back to standard mainsnak value
        mainsnak = claim.get('mainsnak', {})
        logger.debug(f"[Wikidata] Mainsnak for {prop}: snaktype={mainsnak.get('snaktype')}, datatype={mainsnak.get('datatype')}")
        
        year = extract_year_from_snak(mainsnak)
        if year is not None:
            logger.info(f"[Wikidata] Extracted single year from {prop} ({prop_name}): {year}")
            return year
        else:
            logger.debug(f"[Wikidata] Could not extract year from {prop} mainsnak")
            if mainsnak.get('snaktype') == 'value':
                time_value = mainsnak.get('datavalue', {}).get('value', {})
                logger.debug(f"[Wikidata] Time value structure: {time_value}")
    else:
        logger.debug(f"[Wikidata] Property {prop} ({prop_name}) not found in claims")
    
    logger.warning(f"[Wikidata] No composition date (P571) found for QID: {actual_qid}")
    return None

def get_year_from_imslp(url):
    logger.debug(f"[IMSLP] Fetching page: {url}")
    resp = requests.get(url, headers=SCRAPE_HEADERS)
    resp.raise_for_status()
    logger.debug(f"[IMSLP] Response status: {resp.status_code}, content length: {len(resp.text)}")
    
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    # Only composition date labels - no publication dates
    labels = [
        "Year/Date of Composition",
        "Composition Year",
        "Year of Composition", 
        "Date of Composition",
        "Composed"
    ]
    
    for label in labels:
        logger.debug(f"[IMSLP] Searching for label: '{label}'")
        # Use regex to match the label flexibly (case-insensitive, partial match)
        th = soup.find('th', string=re.compile(re.escape(label), re.IGNORECASE))
        
        if th:
            logger.debug(f"[IMSLP] Found label '{label}' in table header")
            td = th.find_next_sibling('td')
            
            if td:
                text = td.get_text(separator=' ').strip()
                logger.debug(f"[IMSLP] Raw text from '{label}' field: {text}")
                
                parsed = parse_year_text(text)
                if parsed is not None:
                    logger.info(f"[IMSLP] Successfully parsed year from '{label}': {parsed}")
                    return parsed
                else:
                    # Print to console AND log when we found a field but couldn't parse it
                    error_msg = f"⚠️  IMSLP PARSE FAILURE - Found '{label}' field but could not parse year"
                    print(f"\n{error_msg}")
                    print(f"   URL: {url}")
                    print(f"   Raw text: '{text}'\n")
                    logger.warning(f"[IMSLP] {error_msg}: '{text}'")
            else:
                logger.debug(f"[IMSLP] Found label '{label}' but no adjacent <td> element")
        else:
            logger.debug(f"[IMSLP] Label '{label}' not found in page")
    
    logger.warning(f"[IMSLP] No composition date found on page: {url}")
    return None

def get_year_from_allmusic(url):
    logger.debug(f"[AllMusic] Fetching page: {url}")
    resp = requests.get(url, headers=SCRAPE_HEADERS)
    resp.raise_for_status()
    logger.debug(f"[AllMusic] Response status: {resp.status_code}, content length: {len(resp.text)}")
    
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    text = soup.get_text(separator=' ')
    logger.debug(f"[AllMusic] Searching for 'Comp Date' in page text (length: {len(text)})")
    
    # Locate the immediate Comp Date string chunk to prevent matching random footer dates
    match = re.search(r'Comp Date[^\d]{0,30}?(before\s+\d{4}|\d{4}\s*[-–]\s*\d{4}|\d{4}\s*[-–]\s*\d{2}|\b\d{4}\b)', text, re.IGNORECASE)
    
    if match:
        matched_text = match.group(1)
        logger.debug(f"[AllMusic] Found 'Comp Date' match: {matched_text}")
        
        parsed = parse_year_text(matched_text)
        if parsed is not None:
            logger.info(f"[AllMusic] Successfully parsed year: {parsed}")
            return parsed
        else:
            # Print to console AND log when we found Comp Date but couldn't parse it
            error_msg = f"⚠️  ALLMUSIC PARSE FAILURE - Found 'Comp Date' field but could not parse year"
            print(f"\n{error_msg}")
            print(f"   URL: {url}")
            print(f"   Raw text: '{matched_text}'\n")
            logger.warning(f"[AllMusic] {error_msg}: '{matched_text}'")
    else:
        logger.warning(f"[AllMusic] 'Comp Date' pattern not found on page: {url}")
    
    return None

def process_gid(gid):
    """
    Evaluates the sources and returns (year_result, source_name).
    """
    logger.info(f"[{gid}] ========== Starting processing ==========")
    
    try:
        urls = get_urls_from_mb(gid)
    except Exception as e:
        logger.error(f"[{gid}] Failed to fetch MusicBrainz data: {e}", exc_info=True)
        raise
    
    # Try Wikidata first
    if urls.get('wikidata'):
        logger.info(f"[{gid}] Attempting Wikidata extraction...")
        try:
            year = get_year_from_wikidata(urls['wikidata'])
            if year is not None:
                logger.info(f"[{gid}] ✓ Found in Wikidata: {year}")
                return year, 'wikidata'
            else:
                logger.warning(f"[{gid}] ✗ Wikidata URL exists but no year extracted")
        except Exception as e:
            logger.error(f"[{gid}] Wikidata extraction failed with error: {e}", exc_info=True)
    else:
        logger.info(f"[{gid}] No Wikidata URL available, skipping")
    
    # Try IMSLP second
    if urls.get('imslp'):
        logger.info(f"[{gid}] Attempting IMSLP extraction...")
        try:
            year = get_year_from_imslp(urls['imslp'])
            if year is not None:
                logger.info(f"[{gid}] ✓ Found in IMSLP: {year}")
                return year, 'imslp'
            else:
                logger.warning(f"[{gid}] ✗ IMSLP URL exists but no year extracted")
        except Exception as e:
            logger.error(f"[{gid}] IMSLP extraction failed with error: {e}", exc_info=True)
    else:
        logger.info(f"[{gid}] No IMSLP URL available, skipping")
    
    # Try AllMusic last
    if urls.get('allmusic'):
        logger.info(f"[{gid}] Attempting AllMusic extraction...")
        try:
            year = get_year_from_allmusic(urls['allmusic'])
            if year is not None:
                logger.info(f"[{gid}] ✓ Found in AllMusic: {year}")
                return year, 'allmusic'
            else:
                logger.warning(f"[{gid}] ✗ AllMusic URL exists but no year extracted")
        except Exception as e:
            logger.error(f"[{gid}] AllMusic extraction failed with error: {e}", exc_info=True)
    else:
        logger.info(f"[{gid}] No AllMusic URL available, skipping")
    
    logger.warning(f"[{gid}] ========== No year found across available sources ==========")
    return None, None

# ==========================================
# State Management
# ==========================================
def load_state():
    checked_gids = set()
    if os.path.exists(CHECKED_GIDS_FILE):
        with open(CHECKED_GIDS_FILE, 'r') as f:
            checked_gids = set(line.strip() for line in f if line.strip())
            
    output_data = {}
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, 'r') as f:
            output_data = yaml.safe_load(f) or {}
            
    return checked_gids, output_data

def save_state(gid, year, output_data):
    if year is not None:
        output_data[gid] = year
        with open(OUTPUT_FILE, 'w') as f:
            yaml.dump(output_data, f, default_flow_style=None, sort_keys=False)
            
    with open(CHECKED_GIDS_FILE, 'a') as f:
        f.write(f"{gid}\n")

# ==========================================
# Summary & Reporting
# ==========================================
def print_summary(stats: dict, total_years_in_file: int):
    """Prints a comprehensive summary of the processing run."""
    print("\n" + "=" * 80)
    print("PROCESSING SUMMARY")
    print("=" * 80)
    
    # Processing stats
    print(f"\n📊 Processing Statistics:")
    print(f"   Works processed this run:  {stats['processed']}")
    print(f"   Years added this run:      {stats['years_added']}")
    print(f"   Not found:                 {stats['not_found']}")
    
    # Success rate
    if stats['processed'] > 0:
        success_rate = (stats['years_added'] / stats['processed']) * 100
        print(f"   Success rate:              {success_rate:.1f}%")
    
    # Source breakdown
    if stats['years_added'] > 0:
        print(f"\n🔍 Sources (for years found this run):")
        print(f"   Wikidata:                  {stats['found_wikidata']} ({stats['found_wikidata']/stats['years_added']*100:.1f}%)")
        print(f"   IMSLP:                     {stats['found_imslp']} ({stats['found_imslp']/stats['years_added']*100:.1f}%)")
        print(f"   AllMusic:                  {stats['found_allmusic']} ({stats['found_allmusic']/stats['years_added']*100:.1f}%)")
    
    # Error breakdown
    total_errors = stats['network_errors'] + stats['other_errors']
    if total_errors > 0:
        print(f"\n⚠️  Errors:")
        print(f"   Network errors:            {stats['network_errors']}")
        print(f"   Other errors:              {stats['other_errors']}")
        print(f"   Total errors:              {total_errors}")
    
    # Overall totals
    print(f"\n📁 Output File Status:")
    print(f"   Total years in WORK_YEAR_NUMBERS.yml: {total_years_in_file}")
    
    print("\n" + "=" * 80)
    logger.info("Processing complete. Summary printed to console.")

# ==========================================
# Main & Test Loops
# ==========================================
def main():
    logger.info("--- Starting execution ---")
    if not os.path.exists(INPUT_FILE):
        logger.error(f"Input file '{INPUT_FILE}' not found.")
        print(f"Error: Could not find '{INPUT_FILE}'")
        return

    with open(INPUT_FILE, 'r') as f:
        gids = [line.strip() for line in f if line.strip()]

    checked_gids, output_data = load_state()
    
    # Combine both checked_gids AND output_data keys to skip already processed works
    already_processed = checked_gids | set(output_data.keys())
    
    # Filter only un-processed gids for the progress bar
    gids_to_process = [g for g in gids if g not in already_processed]
    
    if not gids_to_process:
        print("All works have been checked already!")
        return

    print(f"Loaded {len(already_processed)} already processed GIDs ({len(checked_gids)} checked, {len(output_data)} with results). {len(gids_to_process)} left to process.")
    
    # Statistics tracking
    stats = {
        'processed': 0,
        'years_added': 0,
        'found_wikidata': 0,
        'found_imslp': 0,
        'found_allmusic': 0,
        'not_found': 0,
        'network_errors': 0,
        'parse_errors': 0,
        'other_errors': 0
    }
    
    # Wrap with tqdm progress bar
    for gid in tqdm(gids_to_process, desc="Processing Works", unit="work"):
        stats['processed'] += 1
        try:
            year, source = process_gid(gid)
            save_state(gid, year, output_data)
            checked_gids.add(gid)
            
            if year is not None:
                stats['years_added'] += 1
                if source == 'wikidata':
                    stats['found_wikidata'] += 1
                elif source == 'imslp':
                    stats['found_imslp'] += 1
                elif source == 'allmusic':
                    stats['found_allmusic'] += 1
            else:
                stats['not_found'] += 1
                
        except requests.exceptions.RequestException as e:
            logger.error(f"[{gid}] Network error: {e}")
            stats['network_errors'] += 1
        except Exception as e:
            logger.error(f"[{gid}] Error processing: {e}", exc_info=True)
            stats['other_errors'] += 1
            
        time.sleep(PROCESS_RATE_SECONDS)
    
    # Print summary
    print_summary(stats, len(output_data))


class TestYearExtraction(unittest.TestCase):
    """
    Run strictly validated assertions: 
    python add_year_numbers.py --test
    """
    def test_wikidata_extraction(self):
        gid = '108abf05-3efb-313c-8fa8-3c3e5d8493e7'
        year, source = process_gid(gid)
        # Assert strict source provenance to avoid silent fallbacks!
        self.assertEqual(source, 'wikidata', f"Expected wikidata, but fell back to {source}")
        self.assertEqual(year, 1837)

    def test_imslp_extraction(self):
        gid = '326c9d28-dfce-4920-ab3a-afb83a20769f'
        year, source = process_gid(gid)
        self.assertEqual(source, 'imslp')
        self.assertEqual(year, 1817)

    def test_allmusic_extraction(self):
        gid = 'b66a52f2-1592-44b6-a51c-e0d5dd56b96f'
        year, source = process_gid(gid)
        self.assertEqual(source, 'allmusic')
        self.assertEqual(year, [None, 1742])
        
    def test_range_parser(self):
        """Test comprehensive year parsing patterns - EXACT years only"""
        # Basic patterns
        self.assertEqual(parse_year_text("1767"), 1767)
        self.assertEqual(parse_year_text("1777–1779"), [1777, 1779])
        self.assertEqual(parse_year_text("1777-79"), [1777, 1779])
        self.assertEqual(parse_year_text("1799 - 02"), [1799, 1802])  # Spaces = year range
        
        # Month names with years
        self.assertEqual(parse_year_text("April 1824"), 1824)
        self.assertEqual(parse_year_text("1824 April"), 1824)
        self.assertEqual(parse_year_text("December 1791"), 1791)
        self.assertEqual(parse_year_text("Jan 1800"), 1800)
        
        # ISO dates and full dates (should extract year only, not treat as range!)
        self.assertEqual(parse_year_text("1788/06/22"), 1788)
        self.assertEqual(parse_year_text("1788-06-22"), 1788)
        self.assertEqual(parse_year_text("1821-09-15"), 1821)  # Not 1909!
        self.assertEqual(parse_year_text("1788/06/22 in Vienna"), 1788)
        self.assertEqual(parse_year_text("1821-09-15 in Paris"), 1821)
        self.assertEqual(parse_year_text("1788-06"), 1788)  # Year-month only (no space)
        self.assertEqual(parse_year_text("1817-09"), 1817)  # Year-month (no space)
        
        # Before/after patterns
        self.assertEqual(parse_year_text("Comp Date....before 1742"), [None, 1742])
        self.assertEqual(parse_year_text("1707 or before"), [None, 1707])
        self.assertEqual(parse_year_text("by 1750"), [None, 1750])
        self.assertEqual(parse_year_text("after 1800"), [1800, None])
        self.assertEqual(parse_year_text("1800 or after"), [1800, None])
        self.assertEqual(parse_year_text("from 1820"), [1820, None])
        
        # Short range with ca.
        self.assertEqual(parse_year_text("1715-22 ca."), [1715, 1722])
        self.assertEqual(parse_year_text("ca. 1715-22"), [1715, 1722])
        self.assertEqual(parse_year_text("circa 1777-79"), [1777, 1779])
        
        # Single year with qualifiers
        self.assertEqual(parse_year_text("ca. 1767"), 1767)
        self.assertEqual(parse_year_text("c. 1767"), 1767)
        self.assertEqual(parse_year_text("circa 1767"), 1767)
        self.assertEqual(parse_year_text("1767?"), 1767)
        self.assertEqual(parse_year_text("1767 (?)"), 1767)
        self.assertEqual(parse_year_text("[1767]"), 1767)
        self.assertEqual(parse_year_text("~1767"), 1767)
        
        # Between pattern
        self.assertEqual(parse_year_text("between 1750 and 1760"), [1750, 1760])
        
        # Imprecise patterns should return None
        self.assertIsNone(parse_year_text("1770s"))
        self.assertIsNone(parse_year_text("early 1700s"))
        self.assertIsNone(parse_year_text("18th century"))
        self.assertIsNone(parse_year_text("late 18th century"))


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--test':
        sys.argv.pop(1)
        unittest.main()
    else:
        main()