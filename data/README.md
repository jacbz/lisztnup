# Dataset Generation Process

This document outlines the steps to generate the `lisztnup.json` dataset.

### Data Sources

You will need the following primary data dumps:

1.  **MusicBrainz PostgreSQL Data Dump**
    - **Source:** [metabrainz.org/datasets/postgres-dumps](https://metabrainz.org/datasets/postgres-dumps#musicbrainz)
    - **Setup:** A local PostgreSQL database instance loaded with this data is required.

2.  **Deezer Track ID Dump**
    - **Source:** [github.com/MusicMoveArr/Datasets](https://github.com/MusicMoveArr/Datasets)
    - **File Needed:** `deezer_track.sql` should be copied into this directory.

---

### Generation Steps

The process is executed by three Python scripts in the following order:

1.  **Link Deezer Data (`deezer.py`)**
    - **Action:** Run `python deezer.py`.
    - **Purpose:** This script connects to the PostgreSQL database and imports the Deezer track data. It creates a `musicbrainz.deezer` table, mapping ISRC codes to Deezer Track IDs.

2.  **Extract Raw Data (`musicbrainz.py`)**
    - **Action:** Run `python musicbrainz.py`.
    - **Purpose:** Queries the database to generate `musicbrainz.json`. This is a large, mostly unfiltered file containing the entire catalog of classical composers, their works, and recordings of those works, along with associated Deezer Track IDs where available. By default, only works with at least 2 recordings are included.

3.  **Filter and Finalize (`process_musicbrainz.py`)**
    - **Action:** Run `python process_musicbrainz.py`.
    - **Purpose:** Takes `musicbrainz.json` as input and applies several filtering metrics (e.g., composer relevance, work popularity) to produce the final, optimized `lisztnup.json` for the game.

---

### Data Flow Diagram

```
[MusicBrainz PG Dump] + [Deezer SQL Dump]
           |
           v
[PostgreSQL Database]
           |
           |--> (Run deezer.py to link data)
           |
           v
   (Run musicbrainz.py)
           |
           v
[musicbrainz.json (Unfiltered Raw Data)]
           |
           v
(Run process_musicbrainz.py)
           |
           v
[lisztnup.json (Final Game Data)]
```
