"""process_musicbrainz.py

Transforms a hierarchical Musicbrainz JSON data extract into a flat, curated
dataset of classical works suitable for applications.

This script executes a multi-stage data processing pipeline:
1.  Loads composer and work data from 'musicbrainz.json'.
2.  Parses the raw data into structured Python classes.
3.  Filters out composers born before a configurable year.
4.  Generates a list of "Work Candidates" (Root Works).
5.  Calculates a "Work Significance Score" (WSS) for every candidate.
6.  Applies manual exclusions (works/composers) immediately to prune the dataset.
7.  Resolves musical overlaps (The "Vivaldi" Logic):
    - If a specific MusicBrainz sub-work (e.g., "Spring") is contained in multiple
      root works (e.g., "The Four Seasons" and "Op. 8"), it is assigned strictly
      to the root work with the highest WSS. It is removed from lower-scoring parents.
8.  Resolves metadata overlaps (The "Bad Tagging" Logic):
    - A specific Deezer ID must map to exactly ONE part in the entire dataset.
    - If a Deezer ID appears in multiple parts within the SAME work (e.g., mapped to
      both "Mov 1" and "Mov 2"), it is banned.
    - If a Deezer ID appears in parts of DIFFERENT works, it is banned.
9.  Renormalization: If the top-scoring part (100.0) was removed in steps 7 or 8,
    the remaining parts are re-scaled so the new best part becomes 100.0.
10. Filters works by the global WSS threshold.
11. Applies dynamic part filtering (higher WSS works allow lower-scoring parts).
12. Formats part names by stripping redundant work-name prefixes.
13. Finalizes the composer list and calculates composer scores.
14. Saves data to 'lisztnup.json' and generates markdown reports.
"""

import json
import logging
import math
import os
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
import subprocess
from typing import Dict, List, Optional, Set, Any, Tuple
import yaml
import pycountry
import urllib.parse

# Module-level logger – writes to process_musicbrainz.log
log = logging.getLogger("lisztnup")

# ==============================================================================
# --- Configuration Constants ---
# ==============================================================================

# --- Data Filtering Thresholds ---
MIN_WORKS_PER_COMPOSER = 1      # Composers with fewer final works than this will be dropped.
MIN_BIRTH_YEAR = 1400           # Composers born before this year will be dropped.
MIN_RECORDINGS_PER_PART = 3     # Leaf works (parts) with fewer recordings will be dropped at the start.
MINIMUM_WSS = 1.4               # The absolute minimum Work Significance Score for a work to be considered.

# --- Popularity Scoring Parameters ---
POPULARITY_ALPHA = 0.5          # Balances peak vs. average part popularity in the WSS formula.
                                # 0.0 = pure average; 1.0 = pure peak.

# --- Output GID Compression ---
SHORT_GID_LENGTH = 8

# --- Dynamic Part Score Filter Configuration ---
# This creates a sliding scale for the minimum part score. A work with a low WSS
# requires its parts to be highly significant (closer to 100), while a work with a
# very high WSS can include parts that are less significant relative to its main hit.
DYNAMIC_PART_SCORE_FILTER = {
    "WSS_LOWER_BOUND": MINIMUM_WSS, # WSS at which the part score requirement is highest.
    "WSS_UPPER_BOUND": 6.5,         # WSS at which the part score requirement is lowest.
    "PART_SCORE_AT_LOWER_WSS": 90,  # Required part score (0-100) for a work with WSS <= LOWER_BOUND.
    "PART_SCORE_AT_UPPER_WSS": 75,  # Required part score (0-100) for a work with WSS >= UPPER_BOUND.
}

# --- Work Type Transformation Rules ---
TYPE_MAPPING = {
    "Aria": "vocal", "Song": "vocal", "Song-cycle": "vocal", "Madrigal": "vocal",
    "Mass": "vocal", "Cantata": "vocal", "Oratorio": "vocal", "Motet": "vocal", "Vocal": "vocal",
    "Opera": "opera", "Operetta": "opera", "Zarzuela": "opera",
    "Ballet": "ballet",
    "Incidental music": "orchestral", "Symphony": "orchestral", "Symphonic poem": "orchestral",
    "Overture": "orchestral", "Suite": "other", "Orchestral": "orchestral",
    "Concerto": "concerto",
    "Chamber": "chamber",
    "Quartet": "chamber",
    "Sonata": "other", "Partita": "other"
}

# --- Recording Selection Preferences ---
LABEL_PREFERENCE = [
    "Deutsche Grammophon", "EMI", "Decca", "Hyperion", "Chandos", "Universal", "Philips"
]

# --- Country Normalization ---
# Maps MusicBrainz area names to ISO 3166-1 alpha-2 codes.
# Historical/regional names that don't appear in COUNTRY_TO_ALPHA2 are
# resolved here first, then everything is converted to alpha-2.
COUNTRY_REGION_MAP: Dict[str, str] = {
    "England": "GB",
    "Scotland": "GB",
    "Wales": "GB",
    "Flanders": "BE",
    "Napoli": "IT",
    "Czechoslovakia": "CZ",
    "South Korea": "KR",
    "Russia": "RU",
    "Québec": "CA",
}

# Per-composer country overrides by full GID (alpha-2).
# Used for dissolved states (Soviet Union) and composers with null MusicBrainz area.
COUNTRY_COMPOSER_MAP: Dict[str, str] = {
    # Soviet Union
    "c74a60bb-7f8b-4d73-90d0-c993861b8779": "AM",  # Babajanian, Arno
    "9654ff1f-1d6d-4673-973e-a4b42c1e8469": "RU",  # Blumenfeld, Felix
    "96c39679-7de4-48d1-a9ea-d8840296bb73": "RU",  # Kabalevsky, Dmitri
    "fa25cd1f-beeb-4718-b4bb-d3da4f53539f": "AM",  # Khachaturian, Aram
    "5486f401-0f75-4e65-ae02-d54bdb25c83e": "RU",  # Mosolov, Alexander
    "2382cbc9-dd4e-4fc8-a92e-5391f70bd3b2": "RU",  # Schnittke, Alfred
    "58db9420-92fe-4921-b89f-53d1fe65cefd": "RS",  # Tajčević, Marko
    "554fbabf-54f4-4640-8eb6-88693b6085c7": "PL",  # Weinberg, Mieczysław
    # Null area
    "0e3cc8e1-7bfe-4110-830e-dca6e8e6a999": "SI",  # Gallus, Jacobus
    "9a99004f-87b1-4598-b049-ff79d9993357": "GB",  # Richards, David
}

# Deezer IDs excluded via external configuration files (loaded in main)
EXCLUDED_DEEZER_IDS: Set[int] = set([])
BANNED_DEEZER_IDS: Set[int] = set([])


# ==============================================================================
# --- Title Similarity Helpers (for part-name formatting) ---
# ==============================================================================

def _normalize_punctuation(text: str) -> str:
    """Replace smart quotes and apostrophes with their ASCII equivalents.

    Each replacement is a single-char-to-single-char mapping, so the
    string length is preserved.  This allows index arithmetic on the
    original string to remain valid after matching against the
    normalized version.
    """
    return (
        text
        .replace("\u2018", "'")   # \u2018 LEFT SINGLE QUOTATION MARK
        .replace("\u2019", "'")   # \u2019 RIGHT SINGLE QUOTATION MARK
        .replace("\u201A", "'")   # \u201a SINGLE LOW-9 QUOTATION MARK
        .replace("\u201C", '"')   # \u201c LEFT DOUBLE QUOTATION MARK
        .replace("\u201D", '"')   # \u201d RIGHT DOUBLE QUOTATION MARK
        .replace("\u201E", '"')   # \u201e DOUBLE LOW-9 QUOTATION MARK
    )


def _tokenize_title(text: str) -> Set[str]:
    """Splits a string into a set of normalized word tokens for similarity comparison."""
    normalized = unicodedata.normalize("NFD", text.lower())
    stripped = re.sub(r"[\u0300-\u036f]", "", normalized)  # remove combining marks
    return set(token for token in re.split(r"[^a-z0-9]+", stripped) if token)


def _are_titles_similar(title_a: str, title_b: str) -> bool:
    """
    Checks whether two title strings are semantically similar
    using a token-based Jaccard Index (threshold > 0.5).
    """
    tokens_a = _tokenize_title(title_a)
    tokens_b = _tokenize_title(title_b)
    union = tokens_a | tokens_b
    if not union:
        return False
    score = len(tokens_a & tokens_b) / len(union)
    return score > 0.5


# Pattern for qualifier phrases (e.g. "for cello and piano", "op. 12")
# that can appear between the work name and the movement identifier.
_QUALIFIER_PREFIX_RE = re.compile(
    r"^(?:for\b|op\.?\s*|in\s+[A-G]).*?:\s+", re.IGNORECASE
)


def _strip_qualifier_prefix(text: str) -> str:
    """Strip a leading qualifier phrase ending with ': ' from *text*.

    After the work-name prefix has been removed, the remainder may still
    start with a qualifier like "for cello and piano: " or "op. 12: ".
    This function strips that qualifier so only the movement content
    remains.  If the text doesn't start with a recognised qualifier, it
    is returned unchanged.
    """
    m = _QUALIFIER_PREFIX_RE.match(text)
    if m:
        rest = text[m.end():].strip()
        if rest:
            return rest
    return text


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
    birth_year: int
    death_year: Optional[int]
    gender: str
    country: str
    works: List[MBWork]


# --- Output Data Classes (for 'lisztnup.json') ---
@dataclass
class FinalPart:
    """
    Represents a single, curated part of a work in the final dataset.
    Holds the MB GID for internal deduplication, and outputs a short GID.
    """
    gid: str  # Internal use: MusicBrainz GID for deduplication
    name: str
    deezer: List[int]
    score: float  # Relative score (0-100) compared to the work's most popular part.

    def to_dict(self) -> Dict[str, Any]:
        """Returns dictionary representation for output."""
        return {
            "gid": short_gid(self.gid),
            "name": self.name,
            "deezer": self.deezer,
            "score": self.score
        }

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
        return {
            "gid": short_gid(self.gid),
            "composer_gid": self.composer,
            "name": self.name,
            "type": self.type,
            "begin_year": self.begin_year,
            "end_year": self.end_year,
            "score": self.score,
            "parts": [p.to_dict() for p in self.parts]
        }

@dataclass
class FinalComposer:
    """Represents a composer present in the final dataset."""
    gid: str
    name: str
    birth_year: int
    death_year: Optional[int]
    gender: str
    country: str
    score: float

    def to_dict(self) -> Dict[str, Any]:
        return self.__dict__

@dataclass
class FinalOutput:
    """Top-level container for the final JSON output."""
    composers: List[FinalComposer]
    works: List[FinalWork]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "composers": [c.to_dict() for c in self.composers],
            "works": [w.to_dict() for w in self.works],
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
        self._composer_map = {c.gid: c for c in self.composers}
        self._composer_names: Dict[str, str] = {c.gid: c.name for c in self.composers}
        self.unresolved_work_candidates: Dict[str, List[Tuple[str, str]]] = defaultdict(list)
        
        # Load work type matching rules
        with open("WORK_TYPE_MATCHING_RULES.yaml", "r", encoding="utf-8") as f:
            rules = yaml.safe_load(f)
        self.general_rules = rules.get("general_rules", {})
        self.composer_specific_rules = rules.get("composer_specific_rules", {})
        
        # Load work processing configuration
        with open("WORK_PROCESSING_CONFIG.yaml", "r", encoding="utf-8") as f:
            config = yaml.safe_load(f) or {}
        self.excluded_composers = set(config.get("excluded_composers") or [])
        self.excluded_works = set((config.get("excluded_works") or {}).keys())
        self.wss_overrides = config.get("wss_overrides") or {}
        self.pss_overrides = config.get("pss_overrides") or {}
        self.year_overrides = config.get("year_overrides") or {}
        self.manual_classification_overrides = config.get("manual_classification_overrides") or {}
        self.deezer_overrides: Dict[str, List[int]] = config.get("deezer_overrides") or {}
        
        self.stats: Counter = Counter()

    def _parse_input_data(self, raw_data: List[Dict[str, Any]]) -> List[MBComposer]:
        """Parses the raw list of dictionaries into a list of MBComposer objects."""
        return [
            MBComposer(
                gid=c["gid"],
                name=c["name"] if "," in c["name"] else f"{c['name'].split()[-1]}, {' '.join(c['name'].split()[:-1])}",
                birth_year=c["birth_year"],
                death_year=c["death_year"],
                gender=c["gender"],
                country=c["country"],
                works=[self._parse_work_tree(w) for w in c["works"]],
            )
            for c in raw_data
        ]

    @staticmethod
    def _normalize_countries(composers: List[FinalComposer]) -> None:
        """Normalizes all composer countries to ISO 3166-1 alpha-2 codes.

        Resolution order:
        1. Per-composer GID override (dissolved states, null areas)
        2. Historical region mapping (England → GB, etc.)
        3. pycountry lookup for standard country names
        """
        for c in composers:
            original = c.country

            if c.gid in COUNTRY_COMPOSER_MAP:
                c.country = COUNTRY_COMPOSER_MAP[c.gid]
            elif original in COUNTRY_REGION_MAP:
                c.country = COUNTRY_REGION_MAP[original]
            else:
                c.country = MusicbrainzProcessor._lookup_alpha2(original, c.name, c.gid)

            if c.country != original:
                log.info("COUNTRY α2 | %s | %s → %s", c.name, original, c.country)

    @staticmethod
    def _lookup_alpha2(country: Optional[str], composer_name: str, composer_gid: str) -> str:
        """Resolves a country name to its ISO 3166-1 alpha-2 code via pycountry."""
        if not country or country == "None":
            raise ValueError(
                f"Composer {composer_name} ({composer_gid}) has no country. "
                f"Add their GID to COUNTRY_COMPOSER_MAP."
            )
        try:
            return pycountry.countries.lookup(country).alpha_2
        except LookupError:
            raise ValueError(
                f"Unknown country '{country}' for {composer_name} ({composer_gid}). "
                f"Add to COUNTRY_REGION_MAP or COUNTRY_COMPOSER_MAP."
            ) from None

    def _parse_work_tree(
        self, work_dict: Dict[str, Any], parent_type: Optional[str] = None
    ) -> MBWork:
        """Recursively parses a work and its sub-works."""
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
        """
        self.stats["initial_composers"] = len(self.composers)

        # Stage 1: Filter composers by birth year
        log.info("=" * 60)
        log.info("STAGE 1: Filter composers by birth year")
        composers_active = self._filter_composers_by_birth_year(self.composers)

        # Stage 2: Generate Work Candidates (Initial Scoring)
        # We calculate scores now for deduplication prioritization.
        log.info("=" * 60)
        log.info("STAGE 2: Generate work candidates")
        work_candidates = self._generate_work_candidates(composers_active)

        # Stage 3: Apply Manual Exclusions (Early Pruning)
        # Removes works/composers defined in WORK_PROCESSING_CONFIG.yaml BEFORE complex logic
        log.info("=" * 60)
        log.info("STAGE 3: Apply manual exclusions")
        work_candidates = self._apply_manual_exclusions(work_candidates)

        # Stage 3.5: Check Work Dates
        # Output works that fall outside composer living dates.
        log.info("=" * 60)
        log.info("STAGE 3.5: Check work dates vs composer life")
        self._check_work_dates(work_candidates)

        # Stage 4: Resolve MB Part Collisions
        # Ensure a specific MusicBrainz sub-work GID belongs to only ONE root work.
        # It is assigned to the root work with the highest WSS.
        log.info("=" * 60)
        log.info("STAGE 4: Resolve cross-work MB part duplications")
        work_candidates = self._resolve_mb_part_collisions(work_candidates)

        # Stage 5: Resolve Deezer ID Collisions (The "Metadata" Fix)
        # STRICT 1:1 RULE: A Deezer ID must point to exactly ONE part in the universe.
        log.info("=" * 60)
        log.info("STAGE 5: Ban ambiguous/duplicate Deezer IDs")
        work_candidates = self._resolve_deezer_collisions(work_candidates)

        # Stage 6: Re-normalize Part Scores (The "Il Pirata" Fix)
        # If the top part (100.0) was removed in previous steps, rescale remaining parts.
        log.info("=" * 60)
        log.info("STAGE 6: Re-normalize part scores")
        self._renormalize_part_scores(work_candidates)

        # Stage 7: Filter by WSS, Dynamic Thresholds, and Type Grouping
        log.info("=" * 60)
        log.info("STAGE 7: Final WSS filtering & Type grouping")
        works_by_type = self._group_works_by_type(work_candidates)
        works_after_wss = self._filter_works_by_wss(works_by_type)

        # Stage 8: Format part names (strip work-name prefixes)
        # Runs after all filtering so the common-prefix / all-or-nothing logic
        # operates on the final set of parts per work.
        log.info("=" * 60)
        log.info("STAGE 8: Format part names")
        all_final_works = [w for works in works_after_wss.values() for w in works]
        self._format_part_names(all_final_works)

        # Stage 9: Finalize Composer List
        log.info("=" * 60)
        log.info("STAGE 9: Finalize composer list")
        final_composers = self._filter_final_composers(composers_active, all_final_works)
        self.stats["final_composers"] = len(final_composers)

        # Stage 10: Normalize country names to ISO 3166-1
        log.info("=" * 60)
        log.info("STAGE 10: Normalize country names")
        self._normalize_countries(final_composers)

        # Stage 11: Sync lists and sort
        final_composer_gids = {c.gid for c in final_composers}
        final_work_list = []
        for w in all_final_works:
            if w.composer in final_composer_gids:
                final_work_list.append(w)
        
        # Sort: Composer Name -> Work Name
        composer_map = {c.gid: c.name for c in final_composers}
        final_work_list.sort(key=lambda w: (composer_map.get(w.composer, ""), w.name))

        # Apply specific patches
        self._apply_special_patches(final_work_list)

        final_output = FinalOutput(composers=final_composers, works=final_work_list)
        self._write_unresolved_log(final_output)
        return final_output

    def _filter_composers_by_birth_year(
        self, composers: List[MBComposer]
    ) -> List[MBComposer]:
        """Filters out composers born before the configured MIN_BIRTH_YEAR."""
        filtered = []
        for c in composers:
            if c.birth_year and c.birth_year >= MIN_BIRTH_YEAR:
                filtered.append(c)
            else:
                log.info("COMPOSER DROPPED (birth year) | %s (%s) | born %s < %d",
                         c.name, c.gid, c.birth_year or "unknown", MIN_BIRTH_YEAR)
                self.stats["composers_dropped_birth_year"] += 1
        return filtered

    def _generate_work_candidates(self, composers: List[MBComposer]) -> List[FinalWork]:
        """
        Generates a flat list of FinalWork candidates with calculated WSS scores.
        Does NOT apply threshold filtering yet.
        """
        candidates: List[FinalWork] = []
        for composer in composers:
            for root_work in composer.works:
                self.stats["total_root_works_considered"] += 1
                self._calculate_recursive_counts(root_work)
                leaf_parts = self._filter_and_flatten_tree(root_work)
                
                if not leaf_parts:
                    log.debug("WORK SKIPPED (no leaf parts) | %s (%s) | Composer: %s | Source type: %s",
                              root_work.name, root_work.gid, composer.name, root_work.type)
                    continue

                # Root shared recordings boost: Recordings attached to the parent work
                # contribute to the popularity of its parts.
                root_shared_recs = (len(root_work.recordings) / len(leaf_parts)) if root_work.subworks else 0.0
                
                parts_with_pss = []
                for part in leaf_parts:
                    # Calculate PSS (Part Significance Score)
                    raw_score = math.log(1 + len(part.recordings) + root_shared_recs)
                    parts_with_pss.append((part, raw_score))
                
                if not parts_with_pss:
                    continue

                pss_values = [pss for _, pss in parts_with_pss]
                avg_pss = sum(pss_values) / len(pss_values)
                max_pss = max(pss_values)
                wss = (1 - POPULARITY_ALPHA) * avg_pss + POPULARITY_ALPHA * max_pss

                # Apply PSS Overrides (Manual boosts for specific parts)
                if any(p.gid in self.pss_overrides for p, _ in parts_with_pss):
                    log.debug("PSS OVERRIDE APPLIED | %s (%s) | Composer: %s | Source type: %s | Original max PSS: %.2f",
                              root_work.name, root_work.gid, composer.name, root_work.type, max_pss)
                    max_pss = max_pss * 1.03
                    parts_with_pss = [
                        (part, max_pss if part.gid in self.pss_overrides else pss) 
                        for part, pss in parts_with_pss
                    ]

                # Convert to FinalPart objects
                potential_parts = []
                for part, pss in parts_with_pss:
                    if part.gid in self.deezer_overrides:
                        deezer_ids = self.deezer_overrides[part.gid]
                        log.debug("DEEZER OVERRIDE | %s (%s) | IDs: %s", part.name, part.gid, deezer_ids)
                    else:
                        deezer_ids = self._select_deezer_ids(part.recordings)
                    if deezer_ids:
                        part_score = (pss / max_pss) * 100 if max_pss > 0 else 0
                        potential_parts.append(
                            FinalPart(
                                gid=part.gid,
                                name=part.name,
                                deezer=deezer_ids,
                                score=round(part_score, 2),
                            )
                        )
                    else:
                        self.stats["parts_dropped_no_deezerid"] += 1

                if not potential_parts:
                    self.stats["works_dropped_became_empty"] += 1
                    log.debug("WORK SKIPPED (no parts with Deezer IDs) | %s (%s) | Composer: %s | Source type: %s",
                              root_work.name, root_work.gid, composer.name, root_work.type)
                    continue

                # Apply WSS Overrides
                if root_work.gid in self.wss_overrides:
                    log.debug("WSS OVERRIDE | %s (%s) | %.2f -> %.2f", root_work.name, root_work.gid, wss, self.wss_overrides[root_work.gid])
                    wss = self.wss_overrides[root_work.gid]
                
                # Apply Year Overrides
                begin_year, end_year = root_work.begin_year, root_work.end_year
                if root_work.gid in self.year_overrides:
                    override = self.year_overrides[root_work.gid]
                    log.debug("YEAR OVERRIDE | %s (%s) | %s/%s -> %s", root_work.name, root_work.gid, begin_year, end_year, override)
                    if isinstance(override, list) and len(override) >= 2:
                        begin_year, end_year = override[0], override[1]
                    elif isinstance(override, int):
                        begin_year, end_year = None, override

                work_type = self._transform_type(root_work, composer)
                log.info("WORK CANDIDATE | %s (%s) | Composer: %s | Source type: %s | Final type: %s | WSS: %.2f | Parts: %d",
                         root_work.name, root_work.gid, composer.name, root_work.type, work_type, round(wss, 2), len(potential_parts))
                candidates.append(FinalWork(
                    gid=root_work.gid,
                    composer=composer.gid,
                    name=root_work.name,
                    type=work_type,
                    begin_year=begin_year,
                    end_year=end_year,
                    score=round(wss, 2),
                    parts=potential_parts
                ))
        return candidates

    def _check_work_dates(self, works: List[FinalWork]) -> None:
        """
        Checks that every work falls between composer living dates.
        Outputs findings to 'date_anomalies.txt' and a summary to the console.
        """
        anomalies_for_file = []
        for work in works:
            composer = self._composer_map.get(work.composer)
            if not composer or not (composer.birth_year or composer.death_year):
                continue

            birth = composer.birth_year
            death = composer.death_year
            
            issue = None
            if birth and work.begin_year is not None and work.begin_year < birth:
                issue = f"Work start {work.begin_year} < Composer birth {birth}"
                self.stats["date_anomaly_before_birth"] += 1

            comp_year = work.end_year if work.end_year is not None else work.begin_year
            if death and comp_year is not None and comp_year > death:
                issue = f"Work completion {comp_year} > Composer death {death}"
                self.stats["date_anomaly_after_death"] += 1
            
            if issue:
                last_name = composer.name.split(",")[0].strip()
                query = f"{last_name} {work.name}"
                search_url = f"https://www.google.com/search?q={urllib.parse.quote_plus(query)}"
                mb_url = f"https://musicbrainz.org/work/{work.gid}"

                file_entry = (
                    f"{'='*80}\n"
                    f"WORK:     {work.name}\n"
                    f"GID:      {work.gid}\n"
                    f"COMPOSER: {composer.name}\n"
                    f"ISSUE:    {issue}\n"
                    f"GOOGLE:   {search_url}\n"
                    f"MB LINK:  {mb_url}\n"
                    f"{'='*80}"
                )
                anomalies_for_file.append(file_entry)
                log.warning("DATE ANOMALY | %s | %s | %s", work.name, issue, composer.name)
        
        if anomalies_for_file:
            with open("date_anomalies.txt", "w", encoding="utf-8") as f:
                f.write("\n\n".join(anomalies_for_file))
            log.warning("Found %d date anomalies. See 'date_anomalies.txt'", len(anomalies_for_file))

    def print_date_anomaly_summary(self) -> None:
        """Prints a prominent warning if date anomalies were found."""
        total = self.stats.get("date_anomaly_before_birth", 0) + self.stats.get("date_anomaly_after_death", 0)
        if total > 0:
            summary = (f"\n" + "!" * 80 + "\n"
                       f"!!! WARNING: {total} works have dates outside composer life range.\n"
                       f"!!! Detailed report generated: 'date_anomalies.txt'\n" + 
                       "!" * 80 + "\n")
            print(summary)

    def _format_part_names(self, works: List[FinalWork]) -> None:
        """
        Strips redundant work-name prefixes from part names in-place.

        Strategy per part:
        1. Try to strip the exact work name as a prefix (with colon/dash/comma separator).
        2. Fallback: Look for a colon followed by a movement identifier pattern,
           but ONLY if there is no text between the common prefix of all parts
           in the work and the matched colon (safety check), AND the text before
           the colon is semantically similar to the work name (Jaccard Index).
        """
        renamed_count = 0
        for work in works:
            if not work.parts:
                continue

            # Collect candidate renames: either ALL parts rename, or NONE do.
            candidates: List[Tuple[FinalPart, str]] = []
            for part in work.parts:
                new_name = self._format_single_part_name(
                    part.name, work.name
                )
                candidates.append((part, new_name))

            all_renamed = all(new != p.name for p, new in candidates)
            if not all_renamed:
                # Log which parts blocked the rename
                for part, new_name in candidates:
                    if new_name == part.name:
                        log.debug(
                            "PART RENAME BLOCKED (all-or-nothing) | %s (%s) | part '%s' unchanged",
                            work.name, work.gid, part.name,
                        )
                continue

            # Apply all renames
            for part, new_name in candidates:
                log.debug(
                    "PART RENAMED | %s (%s) | '%s' -> '%s'",
                    work.name, work.gid, part.name, new_name,
                )
                part.name = new_name
                renamed_count += 1

        log.info("Part names formatted: %d parts renamed across all works", renamed_count)
        self.stats["parts_renamed"] = renamed_count

    @staticmethod
    def _format_single_part_name(
        part_name: str, work_name: str
    ) -> str:
        """
        Formats a single part name by removing the work title prefix.

        1. Strip exact work name as prefix (with separator).
        2. Fallback: colon + movement pattern, guarded by a common-prefix safety
           check and Jaccard title similarity.
        """
        # 1. Try stripping the exact work name as a prefix.
        #    Normalize smart quotes / apostrophes so that typographic
        #    inconsistencies between work and part names don't prevent
        #    matching.  Length is preserved so we can index the original.
        norm_part = _normalize_punctuation(part_name)
        norm_work = _normalize_punctuation(work_name)
        prefix_pattern = re.compile(
            r"^" + re.escape(norm_work) + r" ?[:\-,]\s*", re.IGNORECASE
        )
        m = prefix_pattern.match(norm_part)
        if m:
            stripped = part_name[m.end():].strip()
            if stripped:
                # If stripping left a qualifier (e.g. "for cello and piano: 1. Allegro"),
                # extend through the qualifier up to the colon before movement content.
                stripped = _strip_qualifier_prefix(stripped)
                return stripped

        # 2. Fallback: colon followed by a movement identifier
        movement_pattern = re.compile(
            r"^(.+?):\s+"
            r"((?:[IVXLCDM]+\b\.?|(?:(?:No|Nº|Nr|Op)\.?\s*)?\d+\.?)\s*.*)",
            re.IGNORECASE,
        )
        match = movement_pattern.match(part_name)
        if match:
            potential_prefix = match.group(1)
            movement_part = match.group(2)

            # Verify the prefix is similar to the work name
            if _are_titles_similar(work_name, potential_prefix):
                return movement_part.strip()

        # 3. No valid pattern found
        return part_name

    def _apply_manual_exclusions(self, works: List[FinalWork]) -> List[FinalWork]:
        """
        Filters out composers and works defined in config files *before* heavy processing.
        """
        filtered = []
        for w in works:
            # Check Excluded Composer
            if w.composer in self._composer_names:
                c_name = self._composer_names[w.composer]
                if c_name in self.excluded_composers:
                    self.stats["works_dropped_excluded_composer"] += 1
                    log.info("WORK DROPPED (excluded composer) | %s (%s) | Composer: %s", w.name, w.gid, c_name)
                    continue
            
            # Check Excluded Work
            if w.gid in self.excluded_works:
                self.stats["works_dropped_manual_exclusion"] += 1
                log.info("WORK DROPPED (manual exclusion) | %s (%s) | Composer: %s", w.name, w.gid, w.composer)
                continue
            
            filtered.append(w)
        return filtered

    def _resolve_mb_part_collisions(self, works: List[FinalWork]) -> List[FinalWork]:
        """
        Ensures that a specific MusicBrainz Part GID belongs to only ONE root work.
        
        Scenario: 'Spring' (MB GID 123) is in 'The Four Seasons' (Score 10) 
        and 'Op. 8' (Score 5).
        Resolution: 'Spring' remains in 'The Four Seasons'. It is removed from 'Op. 8'.
        """
        # Sort works by score descending. The highest-scoring work gets "dibs" on parts.
        sorted_works = sorted(works, key=lambda w: w.score, reverse=True)
        
        claimed_part_gids: Set[str] = set()
        cleaned_works = []

        for work in sorted_works:
            unique_parts = []
            for part in work.parts:
                if part.gid not in claimed_part_gids:
                    claimed_part_gids.add(part.gid)
                    unique_parts.append(part)
                else:
                    self.stats["parts_dropped_duplicate_mb_gid"] += 1
                    log.debug("PART DROPPED (duplicate content) | %s (%s) | work: %s (%s)", part.name, part.gid, work.name, work.gid)
            
            work.parts = unique_parts
            if work.parts:
                cleaned_works.append(work)
            else:
                self.stats["works_dropped_empty_after_part_dedup"] += 1
                log.info("WORK DROPPED (empty after content dedup) | %s (%s)", work.name, work.gid)
        
        return cleaned_works

    def _resolve_deezer_collisions(self, works: List[FinalWork]) -> List[FinalWork]:
        """
        Scans all works for Deezer ID collisions.
        STRICT RULE: A Deezer ID must map to exactly ONE part GID in the dataset.
        
        1. Intra-work: If 'Mov 1' and 'Mov 2' of the same work share a Deezer ID, it's banned.
        2. Cross-work: If 'Work A' and 'Work B' share a Deezer ID, it's banned.
        """
        # Collect part GIDs with Deezer overrides (exempt from collision checks)
        overridden_part_gids = set(self.deezer_overrides.keys())

        # Pass 1: Map Deezer ID -> Set of Unique Part GIDs that use it
        deezer_to_parts: Dict[int, Set[str]] = defaultdict(set)
        
        for work in works:
            for part in work.parts:
                if part.gid in overridden_part_gids:
                    continue  # Overridden parts are exempt from collision detection
                for did in part.deezer:
                    deezer_to_parts[did].add(part.gid)
        
        # Pass 2: Identify IDs used in > 1 distinct part
        runtime_banned_ids = set()
        for did, part_gids in deezer_to_parts.items():
            if len(part_gids) > 1:
                runtime_banned_ids.add(did)
                self.stats["deezer_ids_banned_collisions"] += 1
        
        if runtime_banned_ids:
            log.warning(f"Banned {len(runtime_banned_ids)} Deezer IDs due to part collisions.")

        # Pass 3: Purge banned IDs from all works
        cleaned_works = []
        for work in works:
            cleaned_parts = []
            for part in work.parts:
                if part.gid in overridden_part_gids:
                    cleaned_parts.append(part)  # Overridden parts skip collision filtering
                    continue
                # Filter IDs
                original_ids = set(part.deezer)
                valid_ids = [did for did in part.deezer if did not in runtime_banned_ids]
                part.deezer = valid_ids
                
                if part.deezer:
                    cleaned_parts.append(part)
                else:
                    self.stats["parts_dropped_all_deezer_banned"] += 1
                    banned_in_part = original_ids.intersection(runtime_banned_ids)
                    log.debug("PART DROPPED (No Deezer remaining after ban) | %s (%s) | Work: %s (%s) | Offending IDs: %s", 
                              part.name, part.gid, work.name, work.gid, banned_in_part)
            
            work.parts = cleaned_parts
            if work.parts:
                cleaned_works.append(work)
            else:
                self.stats["works_dropped_empty_after_deezer_ban"] += 1
                log.info("WORK DROPPED (empty after Deezer ban) | %s (%s)", work.name, work.gid)

        return cleaned_works

    def _renormalize_part_scores(self, works: List[FinalWork]) -> None:
        """
        If parts were removed (e.g., due to Deezer bans), the work might lack a 100.0 score part.
        This function rescales the remaining parts so the highest scoring one becomes 100.0.
        """
        for work in works:
            if not work.parts:
                continue
            
            # Find current max score
            max_score = max(p.score for p in work.parts)
            
            # If max is less than 100 (and greater than 0), scale up
            if 0 < max_score < 99.9:
                factor = 100.0 / max_score
                log.debug("RENORMALIZING | %s (%s) | Max was %.2f, factor %.2f", work.name, work.gid, max_score, factor)
                for p in work.parts:
                    p.score = min(100.0, round(p.score * factor, 2))

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
        """
        Filters works in each type category by MINIMUM_WSS.
        Also applies the DYNAMIC PART SCORE FILTER here:
        - If a work survives WSS check, its parts are checked against the dynamic threshold.
        """
        filtered_map: Dict[str, List[FinalWork]] = {}
        for work_type, works in works_by_type.items():
            valid_works = []
            for work in works:
                # 1. Check Global Work Score
                if work.score < MINIMUM_WSS:
                    # If work is by a female composer, keep it anyway
                    composer_gender = next((c.gender for c in self.composers if c.gid == work.composer), "unknown")
                    if composer_gender == "female":
                        log.info("WORK RETAINED (WSS < %.2f but composer is female) | %s (%s) | %.2f", MINIMUM_WSS, work.name, work.gid, work.score)
                        work.score = MINIMUM_WSS  # Boost to threshold to keep it in the dataset
                    else:
                        self.stats["works_dropped_by_min_wss"] += 1
                        log.info("WORK DROPPED (WSS < %.2f) | %s (%s) | %.2f", MINIMUM_WSS, work.name, work.gid, work.score)
                        continue

                # 2. Check Dynamic Part Score Threshold
                dynamic_threshold = self._get_dynamic_part_score_threshold(work.score)
                valid_parts = []
                for p in work.parts:
                    if p.score >= dynamic_threshold:
                        valid_parts.append(p)
                    else:
                        self.stats["parts_dropped_by_dynamic_score"] += 1
                
                work.parts = valid_parts
                
                if work.parts:
                    valid_works.append(work)
                else:
                    self.stats["works_dropped_became_empty"] += 1
                    log.info("WORK DROPPED (all parts below dynamic threshold) | %s (%s) | WSS: %.2f", work.name, work.gid, work.score)

            valid_works.sort(key=lambda w: w.score, reverse=True)
            if valid_works:
                filtered_map[work_type] = valid_works
        return filtered_map

    def _filter_final_composers(
        self,
        original_composers: List[MBComposer],
        all_works: List[FinalWork],
    ) -> List[FinalComposer]:
        """
        Determines the final list of composers based on who has enough works
        surviving in the final dataset. Calculates composer scores.
        """
        composer_work_counts = Counter(w.composer for w in all_works)
        final_composers: List[FinalComposer] = []
        
        # Calculate dataset-wide stats for scoring normalization
        if not all_works:
            return []
        
        max_work_count = max(composer_work_counts.values()) if composer_work_counts else 0
        max_wss = max((w.score for w in all_works), default=MINIMUM_WSS)

        # 1. Select Valid Composers
        for composer in original_composers:
            count = composer_work_counts[composer.gid]
            if count >= MIN_WORKS_PER_COMPOSER and composer.name not in self.excluded_composers:
                final_composers.append(
                    FinalComposer(
                        gid=composer.gid,
                        name=composer.name,
                        birth_year=composer.birth_year,
                        death_year=composer.death_year,
                        gender=composer.gender,
                        country=composer.country,
                        score=0.0,  # Will be calculated later
                    )
                )
            elif count > 0:
                self.stats["composers_dropped_min_works"] += 1
                log.info("COMPOSER DROPPED (< %d works) | %s (%s) | %d works",
                         MIN_WORKS_PER_COMPOSER, composer.name, composer.gid, count)
        
        # 2. Calculate and Assign Scores
        raw_scores = [
            self._calculate_composer_score(c.gid, all_works, max_work_count, max_wss)
            for c in final_composers
        ]

        if raw_scores:
            min_score = min(raw_scores)
            max_score = max(raw_scores)
            for idx, final_composer in enumerate(final_composers):
                if max_score > min_score:
                    normalized = (raw_scores[idx] - min_score) / (max_score - min_score) * 100
                else:
                    normalized = 0.0
                final_composer.score = round(normalized, 2)
        
        return sorted(final_composers, key=lambda c: c.name)

    def _calculate_composer_score(self, composer_gid: str, all_works: List[FinalWork], max_work_count: int, max_wss: float) -> float:
        """
        Calculates the composer score using a balanced formula that considers three key aspects:
        peak performance, overall depth, and volume of works. The score is designed to reward
        composers who have both standout works and a consistent body of significant compositions,
        while also accounting for the sheer quantity of their output.
        
        Formula: Composer Score = Peak Component + Depth Component ü Volume Component
        
        Components:
        1. Peak Component (0-1 scale):
           - Measures the composer's highest achievements by averaging the top works' WSS scores.
           - Rationale: Highlights composers with exceptional masterpieces, capturing the "peak" impact
             that can define a composer's legacy. Using the top provides robustness against outliers
             while still emphasizing standout works.
           - Normalization: (avg_top_3 - MINIMUM_WSS) / (max_wss - MINIMUM_WSS)
             - Uses the dataset's actual maximum WSS as the upper bound for fair comparison across composers.
             - MINIMUM_WSS is the threshold below which works are filtered out.
        
        2. Depth Component (0-1 scale):
           - Measures the average quality across all of the composer's works.
           - Rationale: Rewards consistency and breadth in quality output. A composer with many
             moderately successful works should score higher than one with only a few hits, promoting
             depth over narrow specialization.
           - Normalization: Same as Peak Component, using dataset min/max WSS.
        
        3. Volume Component (0-1 scale):
           - Measures the logarithm of the number of works, providing diminishing returns.
           - Rationale: Accounts for prolificacy without over-rewarding sheer quantity. The log scale
             ensures that doubling from 10 to 20 works is more impactful than from 100 to 200.
             Adding 1 prevents log(0) issues.
           - Formula: log10(work_count + 1) / log10(max_work_count + 1)
             - Normalized against the most prolific composer in the dataset.
        
        Weights Rationale:
        - Peak: Recognizes exceptional achievements, which contribute to a composer's legacy.
        - Depth: Prioritizes consistent quality across works, rewarding breadth and reliability.
        - Volumee Accounts for prolificacy, valuing the quantity of output alongside quality.
        
        Overall Rationale:
        - The formula balances recognition of genius (peaks), reliability (depth), and productivity (volume).
        - Normalization ensures fairness across different eras and datasets by using relative scales.
        - Scores are clamped to 0-1 per component and combined to produce a final 0-100 score.
        
        :param composer_gid: The unique GID of the composer.
        :param all_works: List of all final works in the dataset.
        :param max_work_count: The maximum number of works any composer has in the dataset.
        :param max_wss: The maximum WSS score of any work in the dataset.
        :return: The composer score as a float between 0 and 100.
        """
        composer_works = [w for w in all_works if w.composer == composer_gid]
        if not composer_works:
            return 0.0
        
        wss_scores = [w.score for w in composer_works]
        
        # Peak Component
        top_scores = sorted(wss_scores, reverse=True)[:5]
        avg_top = sum(top_scores) / len(top_scores) if top_scores else 0
        denom = max_wss - MINIMUM_WSS
        peak_component = (avg_top - MINIMUM_WSS) / denom if denom > 0 else 0.0
        peak_component = max(0, min(1, peak_component))

        # Depth Component
        avg_all = sum(wss_scores) / len(wss_scores)
        depth_component = (avg_all - MINIMUM_WSS) / denom if denom > 0 else 0.0
        depth_component = max(0, min(1, depth_component))
        
        # Volume Component
        if max_work_count > 0:
            volume_component = math.log10(len(composer_works) + 1) / math.log10(max_work_count + 1)
        else:
            volume_component = 0.0
        
        # Final score
        score = (peak_component * 15) + (depth_component * 35) + (volume_component * 50)
        return score

    def _get_dynamic_part_score_threshold(self, work_wss: float) -> float:
        """Interpolates the minimum part score based on parent work WSS."""
        conf = DYNAMIC_PART_SCORE_FILTER
        lower_wss = conf["WSS_LOWER_BOUND"]
        upper_wss = conf["WSS_UPPER_BOUND"]
        lower_score = conf["PART_SCORE_AT_LOWER_WSS"]
        upper_score = conf["PART_SCORE_AT_UPPER_WSS"]

        if work_wss <= lower_wss:
            return lower_score
        if work_wss >= upper_wss:
            return upper_score

        wss_range = upper_wss - lower_wss
        wss_progress = (work_wss - lower_wss) / wss_range
        score_range = upper_score - lower_score
        return lower_score + (wss_progress * score_range)

    def _calculate_recursive_counts(self, work: MBWork) -> None:
        """Recursively sums recordings and sub-works. Updates MBWork in place."""
        if not work.subworks:
            work.total_recordings_count = len(work.recordings)
            work.total_subworks_count = 0
            return

        rec_count, sub_count = 0, 0
        for sub in work.subworks:
            self._calculate_recursive_counts(sub)
            rec_count += sub.total_recordings_count
            sub_count += 1 + sub.total_subworks_count
        
        work.total_recordings_count = len(work.recordings) + rec_count
        work.total_subworks_count = len(work.subworks) + sub_count

    def _filter_and_flatten_tree(self, work: MBWork) -> List[MBWork]:
        """Flattens tree to leaf nodes (parts). Drops parts with too few recordings."""
        if not work.subworks:
            if len(work.recordings) >= MIN_RECORDINGS_PER_PART:
                return [work]
            log.debug("PART DROPPED (too few recordings) | %s (%s) | Recordings: %d < %d",
                      work.name, work.gid, len(work.recordings), MIN_RECORDINGS_PER_PART)
            return []

        filtered_leafs = [
            leaf for sub in work.subworks for leaf in self._filter_and_flatten_tree(sub)
        ]
        if not filtered_leafs and len(work.recordings) >= MIN_RECORDINGS_PER_PART:
            log.debug("WORK PROMOTED TO LEAF (no subwork leaves survived) | %s (%s) | Recordings: %d",
                      work.name, work.gid, len(work.recordings))
            return [work]
        return filtered_leafs

    def _transform_type(self, work: MBWork, composer: MBComposer) -> str:
        """Determines the simplified work type based on rules."""
        composer_name = composer.name
        work_name_normalized = work.name.replace("’", "'").replace("“", '"').replace("”", '"')

        if work.gid in self.manual_classification_overrides:
            result = self.manual_classification_overrides[work.gid]
            log.debug("TYPE RESOLVED (manual override) | %s (%s) | %s -> %s | Composer: %s",
                      work.name, work.gid, work.type, result, composer_name)
            return result

        if "Piano Sonata" in work_name_normalized and work.type == "Sonata":
            log.debug("TYPE RESOLVED (Piano Sonata special case) | %s (%s) | %s -> piano | Composer: %s",
                      work.name, work.gid, work.type, composer_name)
            return "piano"

        # match only the whole word "ballet", not variants like "ballett"
        if re.search(r"\bballet\b", work_name_normalized, re.IGNORECASE):
            log.debug("TYPE RESOLVED (ballet keyword) | %s (%s) | %s -> ballet | Composer: %s",
                      work.name, work.gid, work.type, composer_name)
            return "ballet"
        
        # Composer specific rules
        if composer_name in self.composer_specific_rules:
            for rule_type, patterns in self.composer_specific_rules[composer_name].items():
                if isinstance(patterns, list):
                    for pattern in patterns:
                        if isinstance(pattern, str) and re.search(pattern, work_name_normalized, re.IGNORECASE):
                            log.debug("TYPE RESOLVED (composer-specific rule) | %s (%s) | %s -> %s | Composer: %s | Pattern: %s",
                                      work.name, work.gid, work.type, rule_type, composer_name, pattern)
                            return rule_type

        if work.type in TYPE_MAPPING and TYPE_MAPPING[work.type] != "other":
            result = TYPE_MAPPING[work.type]
            log.debug("TYPE RESOLVED (TYPE_MAPPING) | %s (%s) | %s -> %s | Composer: %s",
                      work.name, work.gid, work.type, result, composer_name)
            return result

        # General rules
        for rule_type, patterns in self.general_rules.items():
            if isinstance(patterns, list):
                for pattern in patterns:
                    if isinstance(pattern, str) and re.search(pattern, work_name_normalized, re.IGNORECASE):
                        log.debug("TYPE RESOLVED (general rule) | %s (%s) | %s -> %s | Composer: %s | Pattern: %s",
                                  work.name, work.gid, work.type, rule_type, composer_name, pattern)
                        return rule_type

        log.debug("TYPE UNRESOLVED (no rule matched) | %s (%s) | Source type: %s -> other | Composer: %s",
                  work.name, work.gid, work.type, composer_name)
        self.unresolved_work_candidates[composer.gid].append((work.name, work.type))
        return "other"

    def _select_deezer_ids(self, recordings: List[MBRecording], max_ids: int = 5) -> List[int]:
        """
        Selects optimal Deezer IDs based on label preference and availability.
        Excludes explicit excludes and bans.
        """
        if not recordings:
            return []
        
        # Filter valid candidates
        candidates = [
            r for r in recordings 
            if r.deezerId is not None 
            and r.deezerId not in EXCLUDED_DEEZER_IDS 
            and r.deezerId not in BANNED_DEEZER_IDS
        ]
        if not candidates:
            return []
        
        max_to_select = min(max_ids, math.ceil(len(candidates) / 2))
        
        # Heuristic: Sort by name length descending (usually better matches)
        candidates.sort(key=lambda r: len(r.name), reverse=True)

        selected_ids = []
        with_labels = [r for r in candidates if r.label]
        
        # 1. Preferred Labels
        for pref in LABEL_PREFERENCE:
            for rec in with_labels:
                if rec.label and pref.lower() in rec.label.lower() and rec.deezerId not in selected_ids:
                    selected_ids.append(rec.deezerId)
                    if len(selected_ids) >= max_to_select:
                        return selected_ids
        
        # 2. Remaining with labels
        for rec in with_labels:
            if rec.deezerId not in selected_ids:
                selected_ids.append(rec.deezerId)
                if len(selected_ids) >= max_to_select:
                    return selected_ids
                
        # 3. Any remaining (non-live)
        for rec in candidates:
            if rec.deezerId not in selected_ids and "live" not in rec.name.lower():
                selected_ids.append(rec.deezerId)
                if len(selected_ids) >= max_to_select:
                    return selected_ids
        
        # 4. Any remaining
        for rec in candidates:
            if rec.deezerId not in selected_ids:
                selected_ids.append(rec.deezerId)
                if len(selected_ids) >= max_to_select:
                    return selected_ids
        
        return selected_ids

    def _apply_special_patches(self, works: List[FinalWork]) -> None:
        """Applies hardcoded content patches."""
        for w in works:
            if w.gid == "812b5cc4-a7a0-3809-aa6c-290c9ebd79be": # Peter and the Wolf
                # Replace parts with a specific manually selected recording
                log.info("SPECIAL PATCH | %s (%s) | Replacing parts with manual selection", w.name, w.gid)
                w.parts = [
                    FinalPart(
                        gid="manual-patch-gid",
                        name="Peter and the Wolf, op. 67: 1. Introduction (no narration)",
                        deezer=[2803098022],
                        score=100.0
                    )
                ]

    def _write_unresolved_log(self, final_output: FinalOutput) -> None:
        """Writes 'unresolved_types.txt' for debugging classification."""
        composer_map = {c.gid: c.name for c in final_output.composers}
        final_unresolved = {(w.composer, w.name) for w in final_output.works if w.type == "other"}
        
        grouped = defaultdict(list)
        for composer_gid, works in self.unresolved_work_candidates.items():
            composer_name = composer_map.get(composer_gid, composer_gid)
            for work_name, orig_type in works:
                if (composer_gid, work_name) in final_unresolved:
                    grouped[composer_name].append((work_name, orig_type))

        with open("unresolved_types.txt", "w", encoding="utf-8") as f:
            for composer_name in sorted(grouped.keys()):
                f.write(f"# {composer_name}\n")
                for work_name, orig_type in sorted(grouped[composer_name]):
                    f.write(f"{work_name}\n")
                f.write("\n")

    def print_summary(self, final_output: FinalOutput) -> None:
        """Prints a statistical summary to console."""
        print("\n" + "=" * 80)
        print(" " * 28 + "TRANSFORMATION SUMMARY")
        print("=" * 80)
        
        # Print stats from self.stats
        sorted_stats = sorted(self.stats.items())
        for k, v in sorted_stats:
            label = k.replace("_", " ").title()
            print(f"{label:<50} {v}")

        print("-" * 80)
        print(f"{'Final Composers':<50} {len(final_output.composers)}")
        print(f"{'Final Works':<50} {len(final_output.works)}")
        

        composer_map = {c.gid: c.name for c in final_output.composers}
        composer_stats = []
        for gid, name in composer_map.items():
            works_for_composer = [w for w in final_output.works if w.composer == gid]
            work_count = len(works_for_composer)
            part_count = sum(len(w.parts) for w in works_for_composer)
            avg_parts = part_count / work_count if work_count > 0 else 0
            composer_stats.append((name, work_count, part_count, avg_parts))

        composer_stats.sort(key=lambda x: x[1], reverse=True)
        print("\n--- Composers by Final Work Count ---")
        print(f"{'#':>3} {'Composer':<35} {'Works':>7} {'Parts':>7} {'Avg Parts':>10}")
        print(f"{'-'*3} {'-'*35} {'-'*7} {'-'*7} {'-'*10}")
        for i, (name, wc, pc, ap) in enumerate(composer_stats[:20]):
            print(f"{i+1:3}. {name:<35} {wc:>7} {pc:>7} {ap:>10.1f}")

        print("\n--- Top 50 Works by Score (All Types) ---")
        final_output.works.sort(key=lambda w: w.score, reverse=True)
        for i, work in enumerate(final_output.works[:50]):
            print(
                f"{i+1:3}. {work.name:<50} ({composer_map.get(work.composer, 'N/A')}) -> Score: {work.score:.2f}"
            )

        print("\n--- Final Data Distribution by Type ---")
        type_counts = Counter(w.type for w in final_output.works)
        for type_name, count in sorted(
            type_counts.items(), key=lambda item: item[1], reverse=True
        ):
            print(f"  - {type_name:<12}: {count} works")

        other_works = [w for w in final_output.works if w.type == "other"]
        if other_works:
            print(
                f"\nWrote {len(other_works)} unresolved work types to 'unresolved_types.txt'."
            )
        print("=" * 80)


# ==============================================================================
# --- Utilities & Main ---
# ==============================================================================

def compact_json_dumps(data, indent=2):
    """Pretty print JSON but keep number arrays on one line."""
    pretty = json.dumps(data, indent=indent, ensure_ascii=False)
    # Regex to compress multi-line number arrays
    pattern = r'\[\s*\n\s*(-?\d+\.?\d*\s*,?\s*\n?\s*)+\]'
    return re.sub(
        pattern, 
        lambda m: re.sub(r'\s+', ' ', m.group(0)).replace('[ ', '[').replace(' ]', ']'), 
        pretty
    )

def short_gid(gid: str, length: int = SHORT_GID_LENGTH) -> str:
    return gid[:length]

def load_id_set(filename: str) -> Set[int]:
    """Loads a set of integers from a newline-delimited file."""
    path = Path(filename)
    if path.exists():
        return set(int(line.strip()) for line in path.read_text().splitlines() if line.strip())
    return set()

def generate_markdown_report(final_output: FinalOutput) -> None:
    """Generates LIBRARY.md."""
    composer_map = {c.gid: c.name for c in final_output.composers}
    all_works = final_output.works

    with open("../out/LIBRARY.md", "w", encoding="utf-8") as f:
        f.write("# Liszt'n Up! Curated Works\n\n")
        f.write("| Composer | Work | Score | Parts (Score) |\n")
        f.write("| :--- | :--- | :---: | :--- |\n")

        for work in all_works:
            c_name = composer_map.get(work.composer, "N/A")
            parts_str = "<br>".join([f"* {p.name} ({p.score:.1f})" for p in sorted(work.parts, key=lambda x: x.name)])
            f.write(f"| {c_name} | {work.name} | {work.score:.2f} | {parts_str} |\n")
    print("Generated markdown report 'LIBRARY.md'.")

def check_short_uuid_collisions(final_output: FinalOutput, short_length: int = 8) -> None:
    """Checks for potential UUID collisions if frontend uses short IDs."""
    short_map = defaultdict(list)

    for work in final_output.works:
        short = work.gid[:short_length]
        short_map[short].append(("work", work.name, work.gid))
        for part in work.parts:
            pshort = part.gid[:short_length]
            short_map[pshort].append(("part", f"{part.name} (in {work.name})", part.gid))

    # Find any short IDs that map to more than one distinct full-GID (work or part)
    collisions = {}
    for short, entries in short_map.items():
        if len(entries) <= 1:
            continue
        full_gids = {gid for (_kind, _name, gid) in entries}
        # If all entries share the same full-GID, it's not a real collision
        if len(full_gids) <= 1:
            continue
        collisions[short] = entries

    if collisions:
        print(f"\nWARNING: Found {len(collisions)} short-UUID ({short_length}) collisions!")
        for k, entries in collisions.items():
            display = [f"{kind}:{name} [{gid}]" for kind, name, gid in entries]
            print(f"  {k}: {display}")
    else:
        print(f"\n✓ No short-UUID collisions detected ({short_length} chars).")

def main() -> None:
    try:
        with open("musicbrainz.json", "r", encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: 'musicbrainz.json' not found.")
        return

    # Load Exclusion Lists
    global EXCLUDED_DEEZER_IDS, BANNED_DEEZER_IDS
    EXCLUDED_DEEZER_IDS = load_id_set("DEEZER_EXCLUDED_IDS")
    BANNED_DEEZER_IDS = load_id_set("DEEZER_BANNED_IDS")
    print(f"Loaded {len(EXCLUDED_DEEZER_IDS)} excluded and {len(BANNED_DEEZER_IDS)} banned Deezer IDs.")

    # Configure Logging
    log.setLevel(logging.DEBUG)
    fh = logging.FileHandler("process_musicbrainz.log", mode="w", encoding="utf-8")
    fh.setFormatter(logging.Formatter("%(message)s"))
    log.addHandler(fh)

    # Run Pipeline
    processor = MusicbrainzProcessor(data)
    final_output = processor.process()

    # Save Output
    with open("../static/lisztnup.json", "w", encoding="utf-8") as f:
        f.write(compact_json_dumps(final_output.to_dict()))
    print("Saved 'lisztnup.json'.")

    # Reports
    generate_markdown_report(final_output)
    processor.print_summary(final_output)
    processor.print_date_anomaly_summary()
    check_short_uuid_collisions(final_output)
    print("Processing log written to 'process_musicbrainz.log'.")

if __name__ == "__main__":
    main()
    subprocess.run(["pnpm", "sync:tracklist"], check=True)
