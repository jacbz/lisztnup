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
   - Properties: P571 (Inception), P577 (Publication Date)
   - Supports qualifiers for date ranges (P580/P582)

2. **IMSLP** (International Music Score Library Project)
   - Scrapes: "Composition Year", "Year/Date of Composition", "First Pub", etc.

3. **AllMusic** (fallback)
   - Scrapes: "Comp Date" field
