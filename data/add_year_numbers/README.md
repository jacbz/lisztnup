# Add Year Numbers

Automated tool for enriching MusicBrainz work records with composition/publication dates for the Liszt'n Up! game dataset.

## Purpose

Fetches composition dates from multiple authoritative sources (Wikidata, IMSLP, AllMusic) and maps MusicBrainz Work GIDs to years or year ranges. These dates are later integrated into the game's music database to enable Timeline mode gameplay.

## Data Flow

```
missing_year_numbers.txt → add_year_numbers.py → WORK_YEAR_NUMBERS.yml → game dataset
```

## Usage

### Normal Run

```bash
python add_year_numbers.py
```

### Run Tests

```bash
python add_year_numbers.py --test
```

## Configuration

Create a `.env` file with:

```env
MB_USER_AGENT=LisztnUp/1.0.0 (your@email.com)
WD_ACCESS_TOKEN=your_wikidata_token_optional
PROCESS_RATE_SECONDS=1.0
```

### Rate limiting

`PROCESS_RATE_SECONDS` is the courtesy pause between works; it is not what keeps the
run inside MusicBrainz's limit. MusicBrainz meters a **shared per-IP budget** reported
in `x-ratelimit-remaining` / `x-ratelimit-reset`, so two runs at once — or the test
suite alongside a run — will drain it even though each is individually polite. Once it
is empty every request 503s until the window rolls over.

`request_with_backoff` handles this: it pauses when fewer than `RATE_LIMIT_HEADROOM`
requests are left, and on a 429/503 waits for the interval the server names
(`Retry-After`, else `x-ratelimit-reset`) before retrying, up to `MAX_REQUEST_ATTEMPTS`.
Retrying without that wait only drains the following window. Still, prefer not to run
two things against the API at the same time.

## Files

| File                          | Purpose                                         |
| ----------------------------- | ----------------------------------------------- |
| `add_year_numbers.py`         | Main script with extraction logic               |
| `../missing_year_numbers.txt` | Input: List of MusicBrainz Work GIDs to process |
| `WORK_YEAR_NUMBERS.yml`       | Output: GID → year mappings                     |
| `checked_gids.txt`            | State: Tracks processed GIDs (resume support)   |
| `add_year_numbers.log`        | Detailed execution logs (cleared on each run)   |
| `.env`                        | Configuration (not committed)                   |

## Data Sources (Priority Order)

1. **Wikidata** (highest priority)
   - Property: P571 (Inception) - composition date only
   - Supports qualifiers for date ranges (P580/P582)
   - Claims coarser than `precision: 9` (year) are rejected. Wikidata stores imprecise
     dates as a midpoint — "19th century" is `+1850-00-00` at precision 7 — so reading the
     time string alone silently turns a whole century into the year 1850.

2. **IMSLP** (International Music Score Library Project)
   - Scrapes composition date fields only:
     - "Year/Date of Composition"
     - "Composition Year"
     - "Year of Composition"
     - "Date of Composition"
     - "Composed"

3. **AllMusic** (fallback)
   - Scrapes: "Comp Date" field (composition date)

4. **Wikidata premiere** (last resort)
   - Property: P1191 (Date of First Performance), earliest claim when several are recorded
   - A premiere is a proxy, not a composition date, so it runs only after every real
     source is exhausted. It mainly reaches stage works, whose Wikidata items carry a
     premiere instead of an inception — and it reads as "finished no later than this",
     which is how a bare year is already stored.
   - Rejected when it postdates the composer's death (P86 → P570): posthumous premieres
     and revivals say nothing about when the work was written.
