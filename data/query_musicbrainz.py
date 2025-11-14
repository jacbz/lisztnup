import psycopg2
import psycopg2.extras
import json
import re
from collections import defaultdict, Counter
import traceback

# --- Database Configuration ---
DB_CONFIG = {
    "host": "localhost",
    "database": "musicbrainz_db",
    "user": "musicbrainz",
    "password": "musicbrainz",
}

# --- Data Mappings ---
WORK_TYPES = {
    1: "Aria",
    2: "Ballet",
    3: "Cantata",
    4: "Concerto",
    5: "Sonata",
    6: "Suite",
    7: "Madrigal",
    8: "Mass",
    9: "Motet",
    10: "Opera",
    11: "Oratorio",
    12: "Overture",
    13: "Partita",
    14: "Quartet",
    15: "Song-cycle",
    16: "Symphony",
    17: "Song",
    18: "Symphonic poem",
    24: "Operetta",
    30: "Incidental music",
}

# Map selected MusicBrainz tags to higher-level work type categories.
TAG_TO_WORK_TYPE = {
    'ballet': 'Ballet',
    'cantata': 'Vocal',
    'chamber music': 'Chamber',
    'choir': 'Vocal',
    'choral': 'Vocal',
    'choral music': 'Vocal',
    'church cantata': 'Vocal',
    'concerto': 'Concerto',
    'concerto grosso': 'Concerto',
    'divertimento': 'Chamber',
    'french opera': 'Opera',
    'incidental music': 'Orchestral',
    'opera': 'Opera',
    'opéra comique': 'Opera',
    'operatta': 'Opera',
    'operetta': 'Opera',
    'orchestral': 'Orchestral',
    'piano': 'Piano',
    'piano 4 hands': 'Chamber',
    'piano concerto': 'Concerto',
    'piano solo': 'Piano',
    'piano sonata': 'Piano',
    'piano suite': 'Piano',
    'piano trio': 'Chamber',
    'piano variations': 'Piano',
    'requiem': 'Vocal',
    'singspiel': 'Opera',
    'song cycle': 'Vocal',
    'suite': 'Orchestral',
    'symphony': 'Orchestral',
    'two pianos': 'Piano',
    'violin concerto': 'Concerto',
    'vocal': 'Vocal',
    'vocal music': 'Vocal',
}


# --- Helper Function ---
def normalize_name(name):
    """Lowercase and remove all non-alphanumeric characters for merging."""
    if not name:
        return ""
    return re.sub(r"[^a-z0-9]", "", name.lower())


# --- SQL Queries ---
GET_TOP_LEVEL_WORKS_SQL = """
WITH classical_composers AS (
  SELECT id, gid, sort_name, begin_date_year, end_date_year
  FROM musicbrainz.artist
  WHERE begin_date_year IS NOT NULL AND begin_date_year <= 1949
),
work_composer_counts AS (
  -- Count distinct composers per work using only work-level filters
  -- This ensures multi-composer works are excluded even if some composers
  -- would be filtered out by composer-specific criteria later
  SELECT
    w.id AS work_id,
    COUNT(DISTINCT law.entity0) AS composer_count
  FROM
    musicbrainz.work AS w
    JOIN musicbrainz.l_artist_work AS law ON w.id = law.entity1
    JOIN musicbrainz.link AS l ON law.link = l.id
    JOIN classical_composers AS c ON law.entity0 = c.id
    LEFT JOIN musicbrainz.work_alias AS wa ON w.id = wa.work AND wa.locale = 'en' AND wa.type = 1
  WHERE
    l.link_type = 168 -- 'composer' relationship
    -- Work-level filters (apply uniformly, don't affect composer count)
    AND COALESCE(wa.name, w.name) ~* '^[A-Za-zÀ-ÿŒ0-9"“„‘'']'  -- Work name must start with letter, number, or quote
    AND COALESCE(w.type, 17) NOT IN(19, 20, 21, 22, 23, 25, 26, 28, 29) -- Exclude non-classical work types
    AND NOT EXISTS (
      -- Exclude works that are parts or arrangements of other works
      SELECT 1 FROM musicbrainz.l_work_work lww 
      JOIN musicbrainz.link lww_link ON lww.link = lww_link.id
      WHERE lww.entity1 = w.id 
        AND lww_link.link_type IN (
          281,  -- parts
          350   -- arrangement
        )
        AND lww.entity0 != 13641795  -- Exclude "Fantasia" as an exception, which erroneously has Beethoven 6 etc. as parts
    )
    AND NOT EXISTS (
      -- Exclude works that have an arranger relationship
      SELECT 1 FROM musicbrainz.l_artist_work law_arr
      JOIN musicbrainz.link l_arr ON law_arr.link = l_arr.id
      WHERE law_arr.entity1 = w.id
        AND l_arr.link_type = 293  -- 'arranger' relationship
        AND law_arr.entity0 NOT IN (SELECT id FROM classical_composers)
        AND law_arr.entity0 != 422300  -- Exception for Ralph Greaves (Fantasia on Greensleeves)
    )
    AND w.name NOT LIKE '[%'  -- Exclude works with names starting with '['
  GROUP BY w.id
  HAVING COUNT(DISTINCT law.entity0) = 1  -- Only works with exactly one composer
),
allowed_tags AS (
  SELECT id FROM musicbrainz.tag
  WHERE name IN (
    'ballet', 'baroque', 'baroque era', 'bbc proms', 'cantata', 'catalog:primary', 
    'chamber music', 'choir', 'choral', 'choral music', 'choral partitia', 
    'choral symphony', 'choralbearbeitung', 'chorale partita', 'chorale prelude', 
    'chorale variations', 'church cantata', 'classical', 'classical music', 
    'classical period', 'concerto', 'concerto grosso', 'divertimento', 'french opera', 
    'fugue', 'incidental music', 'keyboard', 'opera', 'opéra comique', 'operatta', 
    'operetta', 'orchestral', 'organ', 'piano', 'piano 4 hands', 'piano concerto', 
    'piano solo', 'piano sonata', 'piano suite', 'piano trio', 'piano variations', 
    'ragtime', 'renaissance', 'requiem', 'romantic', 'romantic classical', 'score', 'singspiel', 
    'sixth-tone', 'solo', 'solo collection', 'solo harpsichord', 'solo keyboard', 
    'solo organ', 'sonata', 'song cycle', 'suite', 'symphony', 'theme and variations', 
    'twelve-tone', 'two pianos', 'violin', 'violin concerto', 'vocal', 'vocal music', 
    'waltz', 'western classical', 'work', 'young classicism'
  )
)
SELECT
  c.id AS composer_id, 
  c.gid AS composer_gid, 
  c.sort_name AS composer_sort_name,
  c.begin_date_year AS composer_birth_year, 
  c.end_date_year AS composer_death_year,
  w.id AS work_id, 
  w.gid AS work_gid, 
  COALESCE(wa.name, w.name) AS work_name,
  w.type AS work_type, 
  l.begin_date_year AS work_begin_year, 
  l.end_date_year AS work_end_year,
  STRING_AGG(t.name, ',' ORDER BY t.name) AS tag_names
FROM
  work_composer_counts AS wcc
  JOIN musicbrainz.work AS w ON wcc.work_id = w.id
  JOIN musicbrainz.l_artist_work AS law ON w.id = law.entity1
  JOIN musicbrainz.link AS l ON law.link = l.id
  JOIN classical_composers AS c ON law.entity0 = c.id
  LEFT JOIN musicbrainz.work_alias AS wa ON w.id = wa.work AND wa.locale = 'en' AND wa.type = 1 AND wa.primary_for_locale = true
  LEFT JOIN musicbrainz.work_tag AS wt ON w.id = wt.work
  LEFT JOIN musicbrainz.tag AS t ON wt.tag = t.id
WHERE
  l.link_type = 168 -- 'composer' relationship
  -- Composer-specific filters (can vary by composer for the same work)
  AND c.sort_name ~ '^[A-Za-z]'  -- Composer name must start with ASCII letter
  AND (
    -- Include if not a song (type 17), or if a song but composer died before 1900
    w.type IS DISTINCT FROM 17 OR c.end_date_year < 1900
  )
  -- Tag filter: either no tags OR at least one allowed tag
  AND (
    NOT EXISTS (SELECT 1 FROM musicbrainz.work_tag WHERE work = w.id)
    OR EXISTS (
      SELECT 1 FROM musicbrainz.work_tag wt2
      JOIN allowed_tags at ON wt2.tag = at.id
      WHERE wt2.work = w.id
    )
  )
GROUP BY 
  c.id, c.gid, c.sort_name, c.begin_date_year, c.end_date_year,
  w.id, w.gid, w.name, w.type, l.begin_date_year, l.end_date_year, wa.name
ORDER BY c.sort_name, COALESCE(wa.name, w.name);
"""

GET_RECORDINGS_FOR_WORK_SQL = """
-- Get recordings linked to a specific work, with artist, label, and Deezer information
SELECT r.gid AS recording_gid, 
       r.name AS recording_name, 
       i.isrc,
       STRING_AGG(DISTINCT label.name, ', ') AS recording_labels, 
       d.track_id AS deezer_id,
       STRING_AGG(DISTINCT at.name, ', ') AS attributes,
       STRING_AGG(DISTINCT artist.name, '; ') AS artist_name,
       STRING_AGG(DISTINCT artist.comment, '; ') AS artist_comment,
       STRING_AGG(DISTINCT acn.name, '; ') AS artist_credit_name
FROM musicbrainz.recording AS r
-- Join to get the link between recording and work
JOIN musicbrainz.l_recording_work AS lrw ON r.id = lrw.entity0
JOIN musicbrainz.link AS l ON lrw.link = l.id
-- Get link attributes (e.g., "partial" recordings)
LEFT JOIN musicbrainz.link_attribute AS la ON l.id = la.link
LEFT JOIN musicbrainz.link_attribute_type AS at ON la.attribute_type = at.id
-- Get ISRC codes for the recording
LEFT JOIN musicbrainz.isrc AS i ON r.id = i.recording
-- Get Deezer track ID via ISRC
LEFT JOIN musicbrainz.deezer AS d ON i.isrc = d.isrc
-- Get labels associated with the recording
LEFT JOIN musicbrainz.l_label_recording AS llr ON r.id = llr.entity1
LEFT JOIN musicbrainz.label AS label ON llr.entity0 = label.id
-- Get artists from two sources:
-- 1. Artists linked via l_artist_recording relation
LEFT JOIN musicbrainz.l_artist_recording AS lar ON r.id = lar.entity1
-- 2. Artists from the recording's artist credit
LEFT JOIN musicbrainz.artist_credit_name AS acn ON r.artist_credit = acn.artist_credit
-- Join artist table for both sources
LEFT JOIN musicbrainz.artist AS artist ON (acn.artist = artist.id OR lar.entity0 = artist.id)
WHERE lrw.entity1 = %(work_id)s
GROUP BY r.gid, r.name, i.isrc, d.track_id
-- Exclude partial recordings
HAVING STRING_AGG(DISTINCT at.name, ', ') IS NULL 
    OR STRING_AGG(DISTINCT at.name, ', ') NOT ILIKE '%%partial%%'
ORDER BY r.name;
"""

GET_SUBWORKS_FOR_WORK_SQL = """
SELECT DISTINCT ON (lww.link_order, child_work.id, child_work.name)
  child_work.id AS work_id,
  child_work.gid AS work_gid,
  COALESCE(wa.name, child_work.name) AS work_name,
  child_work.type AS work_type,
  l.begin_date_year AS work_begin_year,
  l.end_date_year AS work_end_year
FROM musicbrainz.l_work_work AS lww
JOIN musicbrainz.link AS l ON lww.link = l.id
JOIN musicbrainz.work AS child_work ON lww.entity1 = child_work.id
LEFT JOIN musicbrainz.work_alias AS wa ON child_work.id = wa.work AND wa.locale = 'en' AND wa.type = 1 AND wa.primary_for_locale = true
WHERE lww.entity0 = %(work_id)s AND l.link_type = 281
ORDER BY lww.link_order, child_work.name;
"""

forbidden_artist_comment = ['band', 'pop', 'rock', 'jazz', 'hip hop', 'rap', 
                    'metal', 'punk', 'electronic', 'folk', 'country', 
                    'blues', 'r&b', 'soul']

def get_work_details_recursive(cursor, work_id, label_counter):
    # Returns: subworks, recordings, total_recordings, descendant_types
    cursor.execute(GET_RECORDINGS_FOR_WORK_SQL, {"work_id": work_id})
    recordings_data = cursor.fetchall()
    recordings = []
    for rec in recordings_data:
        deezer_id = rec.get("deezer_id")

        artist_comment = rec.get("artist_comment") or ""
        # Exclude recordings where the artist comment contains forbidden terms
        if any(term in artist_comment.lower() for term in forbidden_artist_comment):
            deezer_id = None

        # Exclude recordings where the artist credit name does not contain a space, most often a band name
        if ' ' not in rec.get("artist_credit_name", ''):
            deezer_id = None
        
        # The SQL returns an `attributes` column which is a
        # comma-separated string (e.g. 'live, partial'). When any of the
        # excluded attributes are present, exclude
        attrs = rec.get("attributes") or ""
        attr_list = [a.strip().lower() for a in attrs.split(",") if a and a.strip()]
        if any(a in ("medley", "cover", "karaoke") for a in attr_list):
            deezer_id = None

        recordings.append(
            {
                "gid": rec["recording_gid"],
                "name": rec["recording_name"],
                "isrc": rec["isrc"],
                "label": rec["recording_labels"],
                "deezerId": deezer_id
            }
        )

    # if not a single recording has a deezerId, skip this work
    if all(rec["deezerId"] is None for rec in recordings):
        recordings = []

    for rec in recordings:
        if rec["label"]:
            label_counter.update([rec["label"]])

    total_recordings_in_tree = len(recordings)
    all_descendant_types = []

    cursor.execute(GET_SUBWORKS_FOR_WORK_SQL, {"work_id": work_id})
    subworks_data = cursor.fetchall()

    grouped_subworks = defaultdict(list)
    for sw in subworks_data:
        grouped_subworks[normalize_name(sw["work_name"])].append(sw)

    valid_subworks = []
    for normalized_name, duplicates in grouped_subworks.items():
        winner_row = duplicates[0]
        # Recursively find the winner if there are duplicates
        if len(duplicates) > 1:
            best_subwork_details = None
            max_recs = -1
            for subwork_row in duplicates:
                sub, recs, count, types = get_work_details_recursive(
                    cursor, subwork_row["work_id"], label_counter
                )
                if count > max_recs:
                    max_recs = count
                    winner_row = subwork_row
                    best_subwork_details = (sub, recs, count, types)
            (
                child_subworks,
                child_recordings,
                child_rec_count,
                child_descendant_types,
            ) = best_subwork_details
        else:
            (
                child_subworks,
                child_recordings,
                child_rec_count,
                child_descendant_types,
            ) = get_work_details_recursive(cursor, winner_row["work_id"], label_counter)

        # Add the winner's direct type to the list
        if winner_row["work_type"]:
            all_descendant_types.append(winner_row["work_type"])
        # Add all types from its children
        all_descendant_types.extend(child_descendant_types)

        if child_rec_count > 0:
            total_recordings_in_tree += child_rec_count
            valid_subworks.append(
                {
                    "gid": winner_row["work_gid"],
                    "name": winner_row["work_name"],
                    "begin_year": winner_row["work_begin_year"],
                    "end_year": winner_row["work_end_year"],
                    "recordings": child_recordings,
                    "subworks": child_subworks,
                }
            )

    return valid_subworks, recordings, total_recordings_in_tree, all_descendant_types


def print_statistics(final_data, stats):
    # (Statistics function remains the same as previous version)
    print("\n" + "=" * 80)
    print(" " * 30 + "FINAL DATA STATISTICS")
    print("=" * 80)

    total_top_level_works = sum(len(c["works"]) for c in final_data)

    print("\n--- Overall Summary ---")
    print(f"{'Total Composers Found:':<35} {len(final_data)}")
    print(f"{'Total Top-Level Works Found:':<35} {total_top_level_works}")
    print(f"{'Total Recordings Found:':<35} {stats['total_recordings']}")

    print("\n--- Top 200 Composers by Number of Works ---")
    top_composers = sorted(final_data, key=lambda c: len(c["works"]), reverse=True)[
        :200
    ]
    for i, composer in enumerate(top_composers):
        print(f"{i+1:3}. {composer['name']:<40} ({len(composer['works'])} works)")

    print("\n--- Top 20 Works by Total Recordings (incl. sub-works) ---")
    top_works = sorted(
        stats["works_by_recording_count"], key=lambda x: x[2], reverse=True
    )[:20]
    for i, (work_name, composer_name, count) in enumerate(top_works):
        print(f"{i+1:2}. {count:<5} recordings - {work_name} ({composer_name})")

    print("\n--- Composer Distribution by Century of Birth ---")
    century_counts = defaultdict(int)
    for composer in final_data:
        if composer["birth_year"]:
            century = composer["birth_year"] // 100 + 1
            century_counts[century] += 1
    for century in sorted(century_counts.keys()):
        print(f"{century}th Century: {century_counts[century]} composers")

    print("\n--- Work Type Distribution ---")
    work_type_counts = sorted(
        stats["work_type_counts"].items(), key=lambda x: x[1], reverse=True
    )
    for work_type, count in work_type_counts:
        print(f"{work_type:<20} : {count} works")

    print("\n--- Average Recordings per Work Type ---")
    avg_rec_per_type = []
    for work_type, total_recs in stats["work_type_recording_sum"].items():
        work_count = stats["work_type_counts"][work_type]
        avg = total_recs / work_count if work_count else 0
        avg_rec_per_type.append((work_type, avg, work_count))
    avg_rec_per_type.sort(key=lambda x: x[1], reverse=True)
    for work_type, avg, count in avg_rec_per_type:
        print(f"{work_type:<20}: {avg:6.2f} avg recordings (from {count} works)")

    print("\n--- Top 20 Labels by Recording Count ---")
    for i, (label, count) in enumerate(stats["label_counter"].most_common(20)):
        print(f"{i+1:2}. {label:<40} ({count} recordings)")

    print("\n--- Distribution of Recordings per Top-Level Work ---")
    buckets = [
        (1, 1),
        (2, 5),
        (6, 10),
        (11, 25),
        (26, 50),
        (51, 100),
        (101, 250),
        (251, float("inf")),
    ]
    bucket_counts = defaultdict(int)
    for count in stats["recordings_per_work_dist"]:
        for lower, upper in buckets:
            if lower <= count <= upper:
                bucket_counts[(lower, upper)] += 1
                break
    for lower, upper in buckets:
        label = f"{lower}-{upper if upper != float('inf') else 'inf'}"
        count = bucket_counts.get((lower, upper), 0)
        print(f"Works with {label:<12} recordings: {count}")
    print("\n" + "=" * 80 + "\n")


def main():
    conn = None
    composers = {}
    stats = {
        "total_recordings": 0,
        "work_type_counts": defaultdict(int),
        "work_type_recording_sum": defaultdict(int),
        "recordings_per_work_dist": [],
        "works_by_recording_count": [],
        "label_counter": Counter(),
    }

    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        print("Fetching and grouping top-level works...")
        cursor.execute(GET_TOP_LEVEL_WORKS_SQL)
        top_level_works_raw = cursor.fetchall()

        grouped_works = defaultdict(list)
        for work in top_level_works_raw:
            grouped_works[
                (work["composer_id"], normalize_name(work["work_name"]))
            ].append(work)

        print(
            f"Found {len(top_level_works_raw)} candidate works, grouped into {len(grouped_works)} unique top-level works."
        )
        print(f"\n{'COMPOSER':<30}\t{'WORK':<60}\t{'RECORDINGS'}")
        print(f"{'-'*30}\t{'-'*60}\t{'-'*10}")

        for (composer_id, normalized_name), duplicates in grouped_works.items():
            winner_row = duplicates[0]
            descendant_types = []
            if len(duplicates) > 1:
                best_work_details = None
                max_recs = -1
                for work_row in duplicates:
                    sub, recs, count, types = get_work_details_recursive(
                        cursor, work_row["work_id"], stats["label_counter"]
                    )
                    if count > max_recs:
                        max_recs = count
                        winner_row = work_row
                        best_work_details = (sub, recs, count, types)
                subworks, recordings, total_recordings, descendant_types = (
                    best_work_details
                )
            else:
                subworks, recordings, total_recordings, descendant_types = (
                    get_work_details_recursive(
                        cursor, winner_row["work_id"], stats["label_counter"]
                    )
                )

            if total_recordings > 1:
                composer_name = winner_row["composer_sort_name"]
                final_work_name = (
                    winner_row["work_name"]
                )
                work_type_str = WORK_TYPES.get(winner_row["work_type"], "Unknown")

                # Infer work type from tags first if the work's own type is NULL.
                # If no useful tag mapping exists, fall back to inferring from child types.
                if winner_row["work_type"] is None:
                    mapped_from_tag = None
                    tag_names = winner_row.get("tag_names")
                    if tag_names:
                        # tag_names is a comma-separated string from the SQL query
                        tag_list = [t.strip().lower() for t in tag_names.split(",") if t and t.strip()]
                        mapped_types = [TAG_TO_WORK_TYPE[t] for t in tag_list if t in TAG_TO_WORK_TYPE]
                        if mapped_types:
                            # pick the most common mapped high-level type among tags
                            mapped_from_tag = Counter(mapped_types).most_common(1)[0][0]
                            work_type_str = mapped_from_tag

                    # If tags didn't yield a mapping, fall back to child-type majority
                    if mapped_from_tag is None:
                        non_null_types = [t for t in descendant_types if t is not None]
                        if non_null_types:
                            majority_type_int = Counter(non_null_types).most_common(1)[0][0]
                            work_type_str = WORK_TYPES.get(majority_type_int, "Unknown")

                if composer_id not in composers:
                    composers[composer_id] = {
                        "gid": winner_row["composer_gid"],
                        "name": composer_name,
                        "birth_year": winner_row["composer_birth_year"],
                        "death_year": winner_row["composer_death_year"],
                        "works": [],
                    }

                work_obj = {
                    "gid": winner_row["work_gid"],
                    "name": final_work_name,
                    "type": work_type_str,
                    "begin_year": winner_row["work_begin_year"],
                    "end_year": winner_row["work_end_year"],
                    "recordings": recordings,
                    "subworks": subworks,
                }
                composers[composer_id]["works"].append(work_obj)

                # Update statistics and print progress
                stats["total_recordings"] += total_recordings
                stats["work_type_counts"][work_type_str] += 1
                stats["work_type_recording_sum"][work_type_str] += total_recordings
                stats["recordings_per_work_dist"].append(total_recordings)
                stats["works_by_recording_count"].append(
                    (final_work_name, composer_name, total_recordings)
                )

                truncated_name = (
                    (final_work_name[:57] + "...")
                    if len(final_work_name) > 60
                    else final_work_name
                )
                print(f"{composer_name:<30}\t{truncated_name:<60}\t{total_recordings}")

        # filter composers: if composer is born after 1900, works must have at least two distinct work types not counting "Song", otherwise remove composer
        composers_to_remove = set()
        for composer in list(composers.values()):
            if composer["birth_year"] and composer["birth_year"] > 1900:
                distinct_types = set(w["type"] for w in composer["works"])
                if "Song" in distinct_types:
                    distinct_types.remove("Song")
                if len(distinct_types) < 2:
                    composers_to_remove.add(composer["gid"])
                    print(
                        f"Removing composer {composer['name']} born after 1900 with insufficient work types."
                    )

        final_data = sorted(
            [c for c in composers.values() if c["works"] and c["gid"] not in composers_to_remove], key=lambda c: c["name"]
        )
        output_filename = "musicbrainz.json"
        print(
            f"\nWriting {len(final_data)} composers with valid works to {output_filename}..."
        )
        with open(output_filename, "w", encoding="utf-8") as f:
            json.dump(final_data, f, ensure_ascii=False, indent=2)

        print("Done.")
        print_statistics(final_data, stats)

    except (Exception, psycopg2.DatabaseError) as error:

        print("An error occurred while processing MusicBrainz data.")
        print(f"Error type   : {type(error).__name__}")
        print(f"Error message: {error!s}")

        # If this is a psycopg2 DatabaseError, print available DB-specific info
        if isinstance(error, psycopg2.DatabaseError):
            try:
                print(f"pgcode  : {getattr(error, 'pgcode', None)}")
                print(f"pgerror : {getattr(error, 'pgerror', None)}")
                diag = getattr(error, "diag", None)
                if diag:
                    print("Diagnostics:")
                    for attr in (
                        "severity",
                        "message_primary",
                        "context",
                        "detail",
                        "hint",
                        "schema_name",
                        "table_name",
                        "column_name",
                        "data_type_name",
                        "constraint_name",
                        "statement_position",
                    ):
                        val = getattr(diag, attr, None)
                        if val:
                            print(f"  {attr}: {val}")
            except Exception:
                # Avoid raising while trying to print diagnostic info
                pass

        print("Traceback (most recent call last):")
        traceback.print_exc()
    finally:
        if conn is not None:
            conn.close()


if __name__ == "__main__":
    main()
