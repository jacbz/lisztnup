"""
Transforms a hierarchical Musicbrainz JSON data extract into a flat, curated
dataset of classical works suitable for applications.

This script executes a multi-stage data processing pipeline:
1.  Loads composer and work data from 'musicbrainz.json'.
2.  Parses the raw data into structured Python classes, handling type inheritance
    for sub-works (e.g., a movement inherits the 'Symphony' type from its parent).
3.  Filters out composers born before a configurable year.
4.  Generates a flat list of all potential "root works" (e.g., Symphonies, Operas).
5.  For each work, it calculates a "Work Significance Score" (WSS) based on the
    popularity of its constituent parts (e.g., movements, arias). This score
    balances consistent popularity across all parts with the impact of a single
    "hit" part.
6.  Filters these works, keeping only those that meet a minimum WSS threshold.
7.  For the surviving works, it filters their individual parts using a DYNAMIC
    threshold. More significant works (higher WSS) have a more lenient part
    filter, while less significant works require their parts to be "greatest hits".
8.  Filters the composer list again, removing any who no longer have a sufficient
    number of works in the final dataset.
9.  Transforms Musicbrainz work types into a simplified, custom taxonomy using
    a series of mappings and keyword-based rules.
10. Saves the final, curated data to 'lisztnup.json' with a clean structure
    containing separate lists for composers and works (grouped by type).
11. Generates a detailed, human-readable 'lisztnup.md' markdown report.
12. Writes a log of unresolved work types to 'unresolved_types.txt'.
13. Prints a summary of the entire transformation process.
"""

import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Set, Any

# ==============================================================================
# --- Configuration Constants ---
# ==============================================================================

# --- Data Filtering Thresholds ---
MIN_WORKS_PER_COMPOSER = 2      # Composers with fewer final works than this will be dropped.
MIN_BIRTH_YEAR = 1400           # Composers born before this year will be dropped.
MIN_RECORDINGS_PER_PART = 3     # Leaf works (parts) with fewer recordings will be dropped at the start.
MINIMUM_WSS = 2.3               # The absolute minimum Work Significance Score for a work to be considered.

# --- Popularity Scoring Parameters ---
POPULARITY_ALPHA = 0.5          # Balances peak vs. average part popularity in the WSS formula.
                                # 0.0 = pure average; 1.0 = pure peak.

# --- Dynamic Part Score Filter Configuration ---
# This creates a sliding scale for the minimum part score. A work with a low WSS
# requires its parts to be highly significant (closer to 100), while a work with a
# very high WSS can include parts that are less significant relative to its main hit.
DYNAMIC_PART_SCORE_FILTER = {
    "WSS_LOWER_BOUND": MINIMUM_WSS, # WSS at which the part score requirement is highest.
    "WSS_UPPER_BOUND": 6.0,         # WSS at which the part score requirement is lowest.
    "PART_SCORE_AT_LOWER_WSS": 95,  # Required part score (0-100) for a work with WSS <= LOWER_BOUND.
    "PART_SCORE_AT_UPPER_WSS": 75,  # Required part score (0-100) for a work with WSS >= UPPER_BOUND.
}

# --- Work Type Transformation Rules ---
TYPE_MAPPING = {
    "Aria": "vocal", "Song": "vocal", "Song-cycle": "vocal", "Madrigal": "vocal",
    "Mass": "vocal", "Cantata": "vocal", "Oratorio": "vocal", "Motet": "vocal", "Vocal": "vocal",
    "Opera": "opera", "Operetta": "opera", "Zarzuela": "opera",
    "Ballet": "ballet",
    "Incidental music": "orchestral", "Symphony": "orchestral", "Symphonic poem": "orchestral",
    "Overture": "orchestral", "Suite": "orchestral", "Orchestral": "orchestral",
    "Concerto": "concerto",
    "Chamber": "chamber",
    "Quartet": "chamber",
    "Sonata": "other", "Partita": "other"
}

KEYWORD_RULES = [
    # ========================================================================
    # 1. Stage Works (Opera, Ballet)
    # These are specific and should be checked first.
    # ========================================================================
    (r'(?i)\bopera\b|Singspiel|Musikdrama|Zoroastre|Armide|Orfeo|dramatico|Acte\b|Atto\b|Porgy and Bess', 'opera'),
    (r'(?i)Swan Lake|Nutcracker|Creatures of Prometheus|L\'Arlésienne', 'ballet'),

    # ========================================================================
    # 2. Vocal Works (Sacred and Secular)
    # Captures major choral, religious, and vocal ensemble pieces.
    # ========================================================================
    (r'(?i)Cantata|Kantate|Oratorio|Stabat Mater|Requiem|Magnificat|Passion|Mass\b|Missa|Coronation Anthem|Chandos Anthem|(Gott|Herr|Jesu|Mensch).*BWV', 'vocal'),
    (r'(?i)Te Deum|Vesperae|Litaniae|Psalm|Salve Regina|Ave Maria|Kyrie|Credo|Agnus Dei|Dixit Dominus|Nisi Dominus|Offertorium|Motet|Hymn', 'vocal'),
    (r'(?i)Aria|Lied(?!chen)|Lieder|Gesänge|Chanson|Song(?!s? Without Words)|Recitative|Dichterliebe|Winterreise|Schwanengesang', 'vocal'),
    (r'(?i)Choral|Choräl|Coro\b|Chorus|for Soprano|for Bass|for Solo Voice', 'vocal'),

    # ========================================================================
    # 3. Concerto
    # Works featuring a soloist or group of soloists with an orchestra.
    # ========================================================================
    (r'(?i)Concerto|Konzert|Concertante|Concertstück|Rondo for .* and Orchestra|Variations on a Rococo Theme|for .* and Orchestra|Rhapsody in Blue', 'concerto'),

    # ========================================================================
    # 4. Orchestral Works
    # Music for a large ensemble, including symphonies, overtures, and dances.
    # ========================================================================
    (r'(?i)Symphony|Symphonie|Symphonische|Sinfonia(?! (BWV 7|BWV 8))', 'orchestral'), # Excludes Bach's keyboard Sinfonias
    (r'(?i)Overture|Ouverture|Poème symphonique|Symphonic|Serenade for Orchestra|Divertimento for Orchestra|Cassation|American in Paris', 'orchestral'),
    (r'(?i)Orchestersuite|for Orchestra|for Orchestra|for strings|for Wind Ensemble|for Military Band', 'orchestral'),

    # ========================================================================
    # 5. Chamber Music
    # Music for small ensembles, from duos to nonets, including most instrumental sonatas.
    # Also includes solo works except for keyboard solo works (handled separately).
    # ========================================================================
    (r'(?i)String Quartet|String Quintet|String Trio|Piano Quintet|Piano Trio|Clarinet Quintet|Horn Trio', 'chamber'),
    (r'(?i)Cello Sonata|Violin Sonata|Flute Sonata|Sonata for .* and|Trio Sonata|Triosonate|Pianoforte und Violine|violino e fagotto|Trio for Piano|four hands|4 hands', 'chamber'),
    (r'(?i)\bDuo\b|\bDuet\b|Trio\b(?! for Piano)|Quartet|Quintet|Sextet|Septet|Octet|Nonet', 'chamber'), # Excludes Piano Trio to avoid double-matching
    (r'(?i)Serenade for (Flute|Violin|Strings)|Divertiment.* for (Violin|Strings|Winds)|Caprice sur des airs', 'chamber'),
    (r'(?i)for (.+) and (.+)|pour (.+) et (.+)|für (.+) und (.+)|for Clarinet and Viola|for .+ Violins|Viol.* Solo|Divertiment|for \d', 'chamber'),

    # ========================================================================
    # 6. Keyboard Works (Piano, Harpsichord, Organetc.)
    # This is a broad category for solo keyboard music, with many specific forms.
    # ========================================================================
    (r'(?i)Piano Sonata|Sonata .* K .* |Klaviersonate|Keyboard Sonata|Harpsichord Sonata|Orgel', 'piano'),
    (r'(?i)(for|pour) Piano|für Klavier|Klavierstück|for Harpsichord|pour le Clavecin|Pièces de Clavecin|for Keyboard', 'piano'),
    # --- Specific Keyboard Forms ---
    (r'(?i)Album für die Jugend|Fantasiestück', 'piano'),
    (r'(?i)\bVariations? for Piano|\bVariationen für Klavier|Goldberg Variations|Diabelli Variations', 'piano'),
    (r'(?i)Kinderszenen|Albumblatt|Albumblätter|Papillons|Carnaval|Kreisleriana|Davidsbündlertänze|Waldszenen', 'piano'),
    (r'(?i)Well-Tempered Clavier|Wohltemperiert|Inventio|Präludium und Fuge', 'piano'), # Catches Bach's major keyboard cycles
]

# --- Recording Selection Preferences ---
LABEL_PREFERENCE = [
    "Deutsche Grammophon", "EMI", "Decca", "Hyperion", "Chandos", "Universal", "Philips"
]

# --- Excluded Composers ---
EXCLUDED_COMPOSERS: Set[str] = set([
    "Gruber, Franz Xaver",
    "Pierpont, James Lord",
    "Ellington, Duke",
    "Coltrane, John",
    "Tizol, Juan",
    "Gilmour, David",
    "Mason, Nick",
    "Waters, Roger",
    "Wright, Richard",
    "Young, Neil",
    "McLaughlin, John",
    "Townshend, Pete",
    "Wakeman, Rick",
    "Gardel, Carlos",
    "Vangelis",
    "Morricone, Ennio",
    "Emerson, Keith",
    "Strayhorn, Billy",
    "Ibrahim, Abdullah",
    "Cherry, Don",
    "Cale, John",
    "Handy, William Christopher",
    "Johnson, James P.",
    "Anderson, Leroy",
    "Goldsmith, Jerry",
    "Newman, Randy",
    "Jarre, Maurice",
    "Mills, Irving",
    "Foster, Stephen",
    "Willis, Wallace"
])

# Deezer IDs without preview mp3s, loaded from 'excluded_deezer_ids' file
EXCLUDED_DEEZER_IDS: Set[int] = set([])

EXCLUDED_WORKS: Set[str] = set([
    "bf57c435-6ce0-3d57-ab04-e2a9179b178c", # O Holy Night
    "8531b357-339e-3cc7-9ed2-0d6b928ed12e", # Joy to the World
    "bc0cdd41-eaa3-3330-b972-8e8174b9e64d", # Hark! The Herald Angels Sing
    "718b96fa-75eb-436e-8c30-0c647aa99696", # Ave Maria (duplicate)
])

WSS_OVERRIDES: Dict[str, float] = {
    "11f48c5e-5ee9-4646-9826-fb7c2fccce7f": 5.4,  # Swan Lake
    "bcc558d9-b9d5-39cd-b599-df5a988b9eee": 2.5, # Memories of the Alhambra
    "300dc2e7-fd2c-48c5-bbdc-29553afa56da": 3.5, # La paloma
    "15649d4e-2dd2-4211-84bc-f5d2d316203a": 4.0, # Messe solennelle en la majeur, op. 12
}

# ==============================================================================
# --- Data Class Definitions ---
# ==============================================================================


# --- Input Data Classes (matching 'musicbrainz.json') ---
@dataclass
class MBRecording:
    """Represents a single recording from the Musicbrainz data."""

    gid: str
    name: str
    isrc: str
    label: Optional[str]
    deezerId: int


@dataclass
class MBWork:
    """Represents a single work (which can have sub-works) from the Musicbrainz data."""

    gid: str
    name: str
    type: str
    begin_year: Optional[int]
    end_year: Optional[int]
    recordings: List[MBRecording]
    subworks: List["MBWork"]
    total_recordings_count: int = 0
    total_subworks_count: int = 0


@dataclass
class MBComposer:
    """Represents a single composer and their top-level works from the Musicbrainz data."""

    gid: str
    name: str
    birth_year: Optional[int]
    death_year: Optional[int]
    works: List[MBWork]


# --- Output Data Classes (for 'lisztnup.json') ---
@dataclass
class FinalPart:
    """Represents a single, curated part of a work in the final dataset."""

    name: str
    deezer: List[int]  # List of Deezer IDs (up to 5, but no more than ceil(n/2) of available)
    score: float  # Relative score (0-100) compared to the work's most popular part.

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


@dataclass
class FinalWork:
    """Represents a single, curated root work in the final dataset."""

    gid: str
    composer: str
    name: str
    type: str
    begin_year: Optional[int]
    end_year: Optional[int]
    score: float  # The absolute Work Significance Score (WSS).
    parts: List[FinalPart]

    def to_dict(self) -> Dict[str, Any]:
        return {**self.__dict__, "parts": [p.to_dict() for p in self.parts]}


@dataclass
class FinalComposer:
    """Represents a composer present in the final dataset."""

    gid: str
    name: str
    birth_year: Optional[int]
    death_year: Optional[int]

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__


@dataclass
class FinalOutput:
    """Top-level container for the final JSON output."""

    composers: List[FinalComposer]
    works: Dict[str, List[FinalWork]]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "composers": [c.to_dict() for c in self.composers],
            "works": {
                type_name: [w.to_dict() for w in works_list]
                for type_name, works_list in self.works.items()
            },
        }


# ==============================================================================
# --- Main Processing Class ---
# ==============================================================================


class MusicbrainzProcessor:
    """
    Orchestrates the transformation of hierarchical Musicbrainz data into a
    flat, curated dataset.
    """

    def __init__(self, composers_data: List[Dict[str, Any]]):
        """
        Initializes the processor.

        :param composers_data: A list of composer dictionaries from the raw JSON file.
        """
        self.composers = self._parse_input_data(composers_data)
        self.unresolved_work_candidates: Dict[str, str] = {}
        self.stats: Counter = Counter()

    def _parse_input_data(self, raw_data: List[Dict[str, Any]]) -> List[MBComposer]:
        """
        Parses the raw list of dictionaries into a list of MBComposer objects.

        :param raw_data: The list of composer data loaded from JSON.
        :return: A list of MBComposer instances.
        """
        return [
            MBComposer(
                gid=c["gid"],
                name=c["name"],
                birth_year=c["birth_year"],
                death_year=c["death_year"],
                works=[self._parse_work_tree(w) for w in c["works"]],
            )
            for c in raw_data
        ]

    def _parse_work_tree(
        self, work_dict: Dict[str, Any], parent_type: Optional[str] = None
    ) -> MBWork:
        """
        Recursively parses a work and its sub-works, ensuring type inheritance.

        If a sub-work has no type, it inherits the type of its parent.

        :param work_dict: The dictionary representing the current work.
        :param parent_type: The type of the parent work, passed down during recursion.
        :return: An MBWork instance representing the work tree.
        """
        current_type = work_dict.get("type", parent_type or "Unknown")
        subworks = [
            self._parse_work_tree(sub, current_type)
            for sub in work_dict.get("subworks", [])
        ]
        recordings = [MBRecording(**rec) for rec in work_dict.get("recordings", [])]
        return MBWork(
            gid=work_dict["gid"],
            name=work_dict["name"],
            type=current_type,
            begin_year=work_dict["begin_year"],
            end_year=work_dict["end_year"],
            recordings=recordings,
            subworks=subworks,
        )

    def process(self) -> FinalOutput:
        """
        Runs the main data processing and filtering pipeline.

        :return: A FinalOutput object containing the curated composers and works.
        """
        self.stats["initial_composers"] = len(self.composers)

        # Stage 1: Initial filtering and candidate generation (includes dynamic part filtering)
        composers_by_birth_year = self._filter_composers_by_birth_year(self.composers)
        work_candidates = self._generate_work_candidates(composers_by_birth_year)

        # Stage 2: Group and filter works by their absolute significance score (WSS)
        works_by_type = self._group_works_by_type(work_candidates)
        works_after_wss = self._filter_works_by_wss(works_by_type)
        works_after_wss = self._filter_works_cleanup(works_after_wss)

        # Stage 3: Finalize the composer list based on who has works remaining
        final_composers = self._filter_final_composers(
            composers_by_birth_year, works_after_wss
        )
        self.stats["final_composers"] = len(final_composers)

        # Stage 4: Synchronize lists, removing works by composers who were dropped
        final_composer_gids = {c.gid for c in final_composers}
        final_works: Dict[str, List[FinalWork]] = {}
        for work_type, works in works_after_wss.items():
            synced_list = [
                work for work in works if work.composer in final_composer_gids
            ]
            if synced_list:
                final_works[work_type] = synced_list

        # Stage 5: Write logs and return the final packaged data
        self._write_unresolved_log(final_works)
        return FinalOutput(composers=final_composers, works=final_works)

    def _filter_composers_by_birth_year(
        self, composers: List[MBComposer]
    ) -> List[MBComposer]:
        """Filters out composers born before the configured MIN_BIRTH_YEAR."""
        filtered = [
            c for c in composers if c.birth_year and c.birth_year >= MIN_BIRTH_YEAR
        ]
        self.stats["composers_dropped_birth_year"] = len(composers) - len(filtered)
        return filtered

    def _get_dynamic_part_score_threshold(self, work_wss: float) -> float:
        """
        Calculates a dynamic minimum part score threshold using linear interpolation.

        A work with a high WSS will have a lower (more lenient) threshold than
        a work with a low WSS.

        :param work_wss: The Work Significance Score of the parent work.
        :return: The calculated minimum part score (0-100) for its parts.
        """
        conf = DYNAMIC_PART_SCORE_FILTER
        lower_wss = conf["WSS_LOWER_BOUND"]
        upper_wss = conf["WSS_UPPER_BOUND"]
        lower_score = conf["PART_SCORE_AT_LOWER_WSS"]
        upper_score = conf["PART_SCORE_AT_UPPER_WSS"]

        # Clamp the WSS to the defined bounds
        if work_wss <= lower_wss:
            return lower_score
        if work_wss >= upper_wss:
            return upper_score

        # Calculate the progress of the WSS within the range
        wss_range = upper_wss - lower_wss
        wss_progress = (work_wss - lower_wss) / wss_range

        # Interpolate the score threshold
        score_range = upper_score - lower_score
        return lower_score + (wss_progress * score_range)

    def _generate_work_candidates(self, composers: List[MBComposer]) -> List[FinalWork]:
        """
        Generates a flat list of scored and pre-filtered FinalWork candidates.
        """
        all_works: List[FinalWork] = []
        for composer in composers:
            for root_work in composer.works:
                self.stats["total_root_works_considered"] += 1
                self._calculate_recursive_counts(root_work)
                leaf_parts = self._filter_and_flatten_tree(root_work)
                if not leaf_parts:
                    continue

                parts_with_pss = [
                    (part, math.log(1 + len(part.recordings))) for part in leaf_parts
                ]
                if not parts_with_pss:
                    continue

                pss_values = [pss for _, pss in parts_with_pss]
                avg_pss = sum(pss_values) / len(pss_values)
                max_pss = max(pss_values)
                wss = (1 - POPULARITY_ALPHA) * avg_pss + POPULARITY_ALPHA * max_pss

                # Get the dynamic threshold for this specific work
                dynamic_threshold = self._get_dynamic_part_score_threshold(wss)

                potential_parts = []
                for part, pss in parts_with_pss:
                    deezer_ids = self._select_deezer_ids(part.recordings)
                    if deezer_ids:
                        part_score = (pss / max_pss) * 100 if max_pss > 0 else 0
                        potential_parts.append(
                            FinalPart(
                                name=part.name,
                                deezer=deezer_ids,
                                score=round(part_score, 2),
                            )
                        )
                    else:
                        self.stats["parts_dropped_no_deezerid"] += 1

                # Filter parts based on the calculated dynamic threshold
                final_parts = [
                    p for p in potential_parts if p.score >= dynamic_threshold
                ]
                self.stats["parts_dropped_by_dynamic_score"] += len(
                    potential_parts
                ) - len(final_parts)

                if not final_parts:
                    if potential_parts:
                        self.stats["works_dropped_became_empty"] += 1
                    continue

                if root_work.gid in WSS_OVERRIDES:
                    wss = WSS_OVERRIDES[root_work.gid]

                all_works.append(
                    FinalWork(
                        gid=root_work.gid,
                        composer=composer.gid,
                        name=root_work.name,
                        type=self._transform_type(root_work, composer.gid),
                        begin_year=root_work.begin_year,
                        end_year=root_work.end_year,
                        score=round(wss, 2),
                        parts=final_parts,
                    )
                )
        return all_works

    def _group_works_by_type(
        self, works: List[FinalWork]
    ) -> Dict[str, List[FinalWork]]:
        """Groups a list of FinalWork objects into a dictionary keyed by work type."""
        grouped: Dict[str, List[FinalWork]] = defaultdict(list)
        for work in works:
            grouped[work.type].append(work)
        return grouped

    def _filter_works_by_wss(
        self, works_by_type: Dict[str, List[FinalWork]]
    ) -> Dict[str, List[FinalWork]]:
        """Filters works in each type category by the MINIMUM_WSS threshold."""
        filtered_map: Dict[str, List[FinalWork]] = {}
        for work_type, works in works_by_type.items():
            initial_count = len(works)
            filtered_list = [work for work in works if work.score >= MINIMUM_WSS and work.gid not in EXCLUDED_WORKS]
            self.stats["works_dropped_by_min_wss"] += initial_count - len(filtered_list)

            filtered_list.sort(key=lambda w: w.score, reverse=True)
            if filtered_list:
                filtered_map[work_type] = filtered_list
        return filtered_map

    def _filter_final_composers(
        self,
        original_composers: List[MBComposer],
        final_works: Dict[str, List[FinalWork]],
    ) -> List[FinalComposer]:
        """
        Determines the final list of composers based on who has enough works
        surviving in the final dataset.
        """
        composer_work_counts: Counter = Counter(
            w.composer for works in final_works.values() for w in works
        )
        final_composers: List[FinalComposer] = []
        for composer in original_composers:
            if composer_work_counts[composer.gid] >= MIN_WORKS_PER_COMPOSER and \
               composer.name not in EXCLUDED_COMPOSERS:
                final_composers.append(
                    FinalComposer(
                        gid=composer.gid,
                        name=composer.name,
                        birth_year=composer.birth_year,
                        death_year=composer.death_year,
                    )
                )
            elif composer.gid in composer_work_counts:
                self.stats["composers_dropped_min_works"] += 1
        return sorted(final_composers, key=lambda c: c.name)

    def _filter_works_cleanup(
        self, works_after_wss: Dict[str, List[FinalWork]]
    ) -> Dict[str, List[FinalWork]]:
        """
        Cleans up the works list by:
        1. Removing works that appear with multiple different composers (same gid, different composer gid).
        2. Removing duplicate works with the same gid (keeping only the first occurrence).
        3. Removing parts that have Deezer IDs assigned to other works (cross-work deduplication).
        4. Removing duplicate parts within each work that have the same Deezer ID (keeping only the first).
        5. Removing works that become empty after part deduplication.
        """
        gid_to_composers = defaultdict(set)
        gid_to_first_work = {}
        
        for works in works_after_wss.values():
            for work in works:
                gid_to_composers[work.gid].add(work.composer)
                # Track the first occurrence of each gid
                if work.gid not in gid_to_first_work:
                    gid_to_first_work[work.gid] = work

        # Find gids with multiple composers (to remove entirely)
        gids_with_multiple_composers = {
            gid for gid, composers in gid_to_composers.items() if len(composers) > 1
        }

        # Assign each deezer ID to the first work that contains it
        deezer_to_work_gid = {}
        for work_type, works in works_after_wss.items():
            for work in works:
                if work.gid in gids_with_multiple_composers:
                    continue
                for part in work.parts:
                    for deezer_id in part.deezer:
                        if deezer_id not in deezer_to_work_gid:
                            deezer_to_work_gid[deezer_id] = work.gid

        filtered_works = {}
        seen_gids = set()
        duplicates_removed = 0
        
        for work_type, works in works_after_wss.items():
            filtered_list = []
            for work in works:
                # Skip works with multiple composers
                if work.gid in gids_with_multiple_composers:
                    continue
                # Skip duplicate gids (keep only first occurrence)
                if work.gid in seen_gids:
                    duplicates_removed += 1
                    continue
                seen_gids.add(work.gid)

                # Filter parts: keep only those where at least one deezer ID is assigned to this work
                filtered_parts = []
                for part in work.parts:
                    # Check if any deezer ID in this part belongs to this work
                    if any(deezer_to_work_gid.get(deezer_id) == work.gid for deezer_id in part.deezer):
                        # Filter the deezer IDs to only keep those assigned to this work
                        part.deezer = [
                            deezer_id for deezer_id in part.deezer
                            if deezer_to_work_gid.get(deezer_id) == work.gid
                        ]
                        filtered_parts.append(part)
                    else:
                        self.stats["parts_dropped_cross_work_duplicate"] += 1

                # Filter duplicate parts within work by checking for overlapping deezer IDs
                seen_deezer = set()
                final_parts = []
                for part in filtered_parts:
                    # Check if any deezer ID in this part has been seen
                    if not any(deezer_id in seen_deezer for deezer_id in part.deezer):
                        # Add all deezer IDs from this part to seen set
                        seen_deezer.update(part.deezer)
                        final_parts.append(part)
                    else:
                        self.stats["parts_dropped_duplicate_deezer"] += 1
                work.parts = final_parts

                if not work.parts:
                    self.stats["works_dropped_empty_after_deezer_dedup"] += 1
                    continue

                filtered_list.append(work)
            
            if filtered_list:
                filtered_works[work_type] = filtered_list

        self.stats["works_dropped_multiple_composers"] = len(gids_with_multiple_composers)
        self.stats["works_dropped_duplicates"] = duplicates_removed
        return filtered_works

    def _calculate_recursive_counts(self, work: MBWork) -> None:
        """Recursively traverses a work tree to sum up total recordings and sub-works."""
        if not work.subworks:
            work.total_recordings_count, work.total_subworks_count = (
                len(work.recordings),
                0,
            )
            return

        rec_count, sub_count = 0, 0
        for sub in work.subworks:
            self._calculate_recursive_counts(sub)
            rec_count += sub.total_recordings_count
            sub_count += 1 + sub.total_subworks_count
        work.total_recordings_count = len(work.recordings) + rec_count
        work.total_subworks_count = len(work.subworks) + sub_count

    def _filter_and_flatten_tree(self, work: MBWork) -> List[MBWork]:
        """
        Recursively flattens a work tree into a list of its valid "leaf" nodes.
        """
        if not work.subworks:
            if len(work.recordings) >= MIN_RECORDINGS_PER_PART:
                return [work]
            self.stats["parts_dropped_min_recordings"] += 1
            return []

        filtered_leafs = [
            leaf for sub in work.subworks for leaf in self._filter_and_flatten_tree(sub)
        ]
        if not filtered_leafs and len(work.recordings) >= MIN_RECORDINGS_PER_PART:
            return [work]
        return filtered_leafs

    def _transform_type(self, work: MBWork, composer_gid: str) -> str:
        """
        Applies a series of rules to map a Musicbrainz work type to the custom taxonomy.
        """
        if (
            composer_gid == "09ff1fe8-d61c-4b98-bb82-18487c74d7b7"
            and work.type == "Unknown"
        ):
            return "piano"  # Chopin
        if "Piano Sonata" in work.name and work.type == "Sonata":
            return "piano"
        if work.type in TYPE_MAPPING:
            type_map = TYPE_MAPPING[work.type]
            if type_map != "other":
                return type_map
        for pattern, new_type in KEYWORD_RULES:
            if re.search(pattern, work.name, re.IGNORECASE):
                return new_type

        self.unresolved_work_candidates[work.name] = (
            f"'{work.name}' (Original Type: {work.type})"
        )
        return "other"

    def _select_deezer_ids(self, recordings: List[MBRecording], max_ids: int = 5) -> List[int]:
        """
        Selects up to max_ids Deezer IDs from a list of recordings based on 
        preferred record labels. Returns up to 5 IDs but no more than ceil(n/2) 
        of the available recordings.
        
        :param recordings: List of recordings to select from
        :param max_ids: Maximum number of IDs to return (default: 5)
        :return: List of selected Deezer IDs
        """
        if not recordings:
            return []
        
        # Filter out excluded IDs
        recordings = [r for r in recordings if r.deezerId is not None and r.deezerId not in EXCLUDED_DEEZER_IDS]
        if not recordings:
            return []
        
        # Calculate max number to select: min of max_ids and ceil(n/2)
        max_to_select = min(max_ids, math.ceil(len(recordings) / 2))
        
        # Sort recordings by length of title (longest first) - often better match
        recordings.sort(key=lambda r: len(r.name), reverse=True)

        selected_ids = []
        with_labels = [r for r in recordings if r.label]
        
        # First, try to select from preferred labels
        for pref in LABEL_PREFERENCE:
            for rec in with_labels:
                if rec.label and pref.lower() in rec.label.lower() and rec.deezerId not in selected_ids:
                    selected_ids.append(rec.deezerId)
                    if len(selected_ids) >= max_to_select:
                        return selected_ids
        
        # Then fill with remaining recordings with labels
        for rec in with_labels:
            if rec.deezerId not in selected_ids:
                selected_ids.append(rec.deezerId)
                if len(selected_ids) >= max_to_select:
                    return selected_ids
        
        # Finally, fill with any remaining recordings
        for rec in recordings:
            if rec.deezerId not in selected_ids:
                selected_ids.append(rec.deezerId)
                if len(selected_ids) >= max_to_select:
                    return selected_ids
        
        return selected_ids

    def _write_unresolved_log(self, final_works: Dict[str, List[FinalWork]]) -> None:
        """Writes a log of works in the final output whose types remain 'other'."""
        if not self.unresolved_work_candidates:
            return
        final_unresolved_names = {w.name for w in final_works.get("other", [])}
        final_messages = sorted(
            [
                msg
                for name, msg in self.unresolved_work_candidates.items()
                if name in final_unresolved_names
            ]
        )
        if not final_messages:
            return

        with open("unresolved_types.txt", "w", encoding="utf-8") as f:
            f.write(
                "List of works in the final output whose types could not be resolved by defined rules:\n"
            )
            f.write("=" * 80 + "\n")
            f.writelines(f"{item}\n" for item in final_messages)

    def print_summary(self, final_output: FinalOutput) -> None:
        """Prints a detailed statistical summary of the entire transformation process."""
        print("\n" + "=" * 80)
        print(" " * 28 + "TRANSFORMATION SUMMARY")
        print("=" * 80 + "\n--- Composer Filtering Pipeline ---")
        print(f"{'Initial composers loaded:':<45} {self.stats['initial_composers']}")
        print(
            f"{f'Composers dropped (birth year < {MIN_BIRTH_YEAR}):':<45} {self.stats['composers_dropped_birth_year']}"
        )
        print(
            f"{f'Composers dropped (< {MIN_WORKS_PER_COMPOSER} final works):':<45} {self.stats['composers_dropped_min_works']}"
        )
        print(f"{'Final composers in output:':<45} {self.stats['final_composers']}")

        all_final_works = [w for works in final_output.works.values() for w in works]
        total_final_works = len(all_final_works)
        total_final_parts = sum(len(w.parts) for w in all_final_works)
        print("\n--- Work & Part Filtering Pipeline ---")
        print(
            f"{'Total root works considered:':<45} {self.stats['total_root_works_considered']}"
        )
        print(
            f"{f'Parts dropped (< {MIN_RECORDINGS_PER_PART} recordings):':<45} {self.stats['parts_dropped_min_recordings']}"
        )
        print(
            f"{'Parts dropped (no Deezer ID):':<45} {self.stats['parts_dropped_no_deezerid']}"
        )
        print(
            f"{f'Works dropped (WSS < {MINIMUM_WSS}):':<45} {self.stats['works_dropped_by_min_wss']}"
        )
        print(
            f"{'Parts dropped (dynamic score threshold):':<45} {self.stats['parts_dropped_by_dynamic_score']}"
        )
        print(
            f"{'Works dropped (all parts filtered out):':<45} {self.stats['works_dropped_became_empty']}"
        )
        print(
            f"{'Works dropped (multiple composers):':<45} {self.stats['works_dropped_multiple_composers']}"
        )
        print(
            f"{'Works dropped (duplicates):':<45} {self.stats['works_dropped_duplicates']}"
        )
        print(
            f"{'Parts dropped (cross-work duplicate Deezer ID):':<45} {self.stats['parts_dropped_cross_work_duplicate']}"
        )
        print(
            f"{'Parts dropped (duplicate Deezer ID):':<45} {self.stats['parts_dropped_duplicate_deezer']}"
        )
        print(
            f"{'Works dropped (empty after Deezer dedup):':<45} {self.stats['works_dropped_empty_after_deezer_dedup']}"
        )
        print(f"{'Total final works in output:':<45} {total_final_works}")
        print(f"{'Total final parts in output:':<45} {total_final_parts}")

        composer_map = {c.gid: c.name for c in final_output.composers}
        composer_stats = []
        for gid, name in composer_map.items():
            works_for_composer = [w for w in all_final_works if w.composer == gid]
            work_count = len(works_for_composer)
            part_count = sum(len(w.parts) for w in works_for_composer)
            avg_parts = part_count / work_count if work_count > 0 else 0
            composer_stats.append((name, work_count, part_count, avg_parts))

        composer_stats.sort(key=lambda x: x[1], reverse=True)
        print("\n--- Composers by Final Work Count ---")
        print(f"{'#':>3} {'Composer':<35} {'Works':>7} {'Parts':>7} {'Avg Parts':>10}")
        print(f"{'-'*3} {'-'*35} {'-'*7} {'-'*7} {'-'*10}")
        for i, (name, wc, pc, ap) in enumerate(composer_stats):
            print(f"{i+1:3}. {name:<35} {wc:>7} {pc:>7} {ap:>10.1f}")

        print("\n--- Top 50 Works by Score (All Types) ---")
        all_final_works.sort(key=lambda w: w.score, reverse=True)
        for i, work in enumerate(all_final_works[:50]):
            print(
                f"{i+1:3}. {work.name:<50} ({composer_map.get(work.composer, 'N/A')}) -> Score: {work.score:.2f}"
            )

        print("\n--- Final Data Distribution by Type ---")
        type_counts = {
            type_name: len(works) for type_name, works in final_output.works.items()
        }
        for type_name, count in sorted(
            type_counts.items(), key=lambda item: item[1], reverse=True
        ):
            print(f"  - {type_name:<12}: {count} works")

        if final_output.works.get("other"):
            print(
                f"\nWrote {len(final_output.works['other'])} unresolved work types to 'unresolved_types.txt'."
            )
        print("=" * 80)


# ==============================================================================
# --- Standalone Helper Functions ---
# ==============================================================================


def generate_markdown_report(final_output: FinalOutput) -> None:
    """
    Generates a detailed, human-readable markdown report of the final curated dataset.

    :param final_output: The final, curated data object.
    """
    composer_map = {c.gid: c.name for c in final_output.composers}
    all_works = [w for works_list in final_output.works.values() for w in works_list]

    all_works.sort(key=lambda w: (composer_map.get(w.composer, "Z"), w.name))

    works_by_type: Dict[str, List[FinalWork]] = defaultdict(list)
    for work in all_works:
        works_by_type[work.type].append(work)

    with open("lisztnup.md", "w", encoding="utf-8") as f:
        f.write("# LisztNUp Curated Works\n\n")
        f.write(
            "A curated list of classical works, sorted by composer and work title within each category.\n\n"
        )

        for type_name in sorted(works_by_type.keys()):
            f.write(f"## {type_name.capitalize()}\n\n")
            f.write("| Composer | Work (Year) | Score | Parts (Score) |\n")
            f.write("| :--- | :--- | :---: | :--- |\n")

            for work in works_by_type[type_name]:
                composer_name = composer_map.get(work.composer, "N/A")

                year_str = ""
                if work.begin_year:
                    if work.end_year and work.end_year != work.begin_year:
                        year_str = f"({work.begin_year}–{work.end_year})"
                    else:
                        year_str = f"({work.begin_year})"
                elif work.end_year:
                    year_str = f"({work.end_year})"

                work_cell = f"{work.name} {year_str}".strip()
                work_score_cell = f"{work.score:.2f}"

                parts_cell_items = []
                for part in sorted(work.parts, key=lambda p: p.name):
                    parts_cell_items.append(f"* {part.name} ({part.score:.2f})")
                parts_cell = "<br>".join(parts_cell_items)

                f.write(
                    f"| {composer_name} | {work_cell} | {work_score_cell} | {parts_cell} |\n"
                )
            f.write("\n")
    print("Generated markdown report 'lisztnup.md'.")


# ==============================================================================
# --- Main Execution Block ---
# ==============================================================================

def compact_json_dumps(data, indent=2):
    """Pretty print JSON with indent, but keep number arrays on one line."""
    # First, do normal pretty printing
    pretty = json.dumps(data, indent=indent)
    
    # Regex pattern to match arrays containing only numbers
    # Matches arrays like [ 1, 2, 3 ] or [ 1.5, 2.3 ] across multiple lines
    pattern = r'\[\s*(-?\d+\.?\d*\s*,\s*)*-?\d+\.?\d*\s*\]'
    
    # Find all number arrays that span multiple lines
    def compress_array(match):
        # Extract the array string and parse it
        array_str = match.group(0)
        # Remove all whitespace and newlines
        return re.sub(r'\s+', ' ', array_str).replace('[ ', '[').replace(' ]', ']')
    
    # Replace multi-line number arrays with single-line versions
    pattern_multiline = r'\[\s*\n\s*(-?\d+\.?\d*\s*,?\s*\n?\s*)+\]'
    result = re.sub(pattern_multiline, compress_array, pretty)
    
    return result

def load_excluded_deezer_ids() -> set[int]:
    """Load excluded Deezer IDs from file."""
    path = Path("excluded_deezer_ids")
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    return set()


def main() -> None:
    """
    Main execution function: loads data, runs the processor, saves the results,
    and generates reports.
    """
    try:
        with open("musicbrainz.json", "r", encoding="utf-8") as f:
            composers_data: List[Dict[str, Any]] = json.load(f)
    except FileNotFoundError:
        print(
            "Error: 'musicbrainz.json' not found. Please run the data extraction script first."
        )
        return

    # Load excluded Deezer IDs from file
    global EXCLUDED_DEEZER_IDS
    EXCLUDED_DEEZER_IDS = load_excluded_deezer_ids()
    print(f"Loaded {len(EXCLUDED_DEEZER_IDS)} excluded Deezer IDs.")

    print(
        f"Loaded {len(composers_data)} composers from 'musicbrainz.json'. Starting processing..."
    )

    processor = MusicbrainzProcessor(composers_data)
    final_output = processor.process()

    with open("../static/lisztnup.json", "w", encoding="utf-8") as f:
        json_output = final_output.to_dict()
        f.write(compact_json_dumps(json_output, indent=2))
    print(f"\nSuccessfully processed data and saved to 'lisztnup.json'.")

    generate_markdown_report(final_output)

    processor.print_summary(final_output)


if __name__ == "__main__":
    main()
