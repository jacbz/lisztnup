# Product Domain & Game Rules

## Overview

**Liszt'n Up!** is a Hitster-inspired classical music guessing game for local multiplayer on a tablet. Players listen to 30-second Deezer previews of classical music and guess composer, work, era, decade, or musical form. Four game modes with different mechanics.

**Dataset**: ~10,500 works from ~900 composers (MusicBrainz), ~27,000 playable tracks (Deezer previews).

## Game Modes

### Timeline

Players take clock-wise turns placing tracks on their own chronological timeline. Drag a card from the center stack to the correct position in your timeline. Correct placement = keep the card. Wrong = discard. First to reach the target card count wins (default 6, configurable 6/10/15). Each player gets a random initial card to start with.

- 1–10 players, each assigned a screen edge (Bottom/Left/Top/Right)
- Year-required filtering ensures all tracks have valid dates
- **Scoring**: Rewards correct placement, tight chronological gaps, close boundary calls, accuracy, speed, and streaks. Misses can earn early consolation so near-correct attempts still matter, but repeated misses fade out. Detailed formulas live in [SCORING.md](../scoring/SCORING.md).
- **Endgame**: When any player reaches target, endgame activates. In multiplayer, current round completes (all players finish). Winner = highest total score (not card count). Amber edge glow + "FINAL ROUND" badges during endgame.
- **Leaderboard**: Only completed timelines can publish. Endgame asks once per player name; allow/deny choices are saved in settings. Published names can be renamed later, and naming a score claims anonymous history for the same browser token.

### Classic

Spin the wheel to select a category, listen to the track, guess. Points awarded per category: Composer (20), Work (30), Form (10), Decade (15), Era (10).

- 1–10 players, solo mode available (no competitive scoring)
- Scoring screen after each reveal — all players default to "No guess"
- Stats graph accessible via floating button (bottom-right)

### Buzzer

Giant buzzer button starts playback. Categories reveal progressively based on time (highest points first). Players buzz in to guess. If timer runs out without a buzz, track info is shown without scoring.

- 2–10 players, no solo mode
- Always plays full 30s previews (ignores track length setting)
- 3 categories selected randomly, displayed at 50%/33%/17% of track time
- Categories exclude Decade/Era when track lacks year data
- Buzzer sound effect on press

### Bingo

Spin wheel → play track → reveal answer. No scoring. Each player has their own device with a unique 5×5 bingo grid at `/bingo`.

- Grid categories: Composer (6), Work (6), Era (5), Type (4), Decade (4) + FREE center
- Constraints: max 2 same category per row/column, max 2 adjacent same category
- Grid persists in localStorage across sessions. Print-friendly styling.
- Guess panel: input → blurred hidden → revealed (3 states)
- Game continues indefinitely

## Game Flow

```
Loading → Home → [Mode Selection → Player Setup] → Game → End Game
                                                    ↑         |
                                                    └─────────┘ (Play Again)
```

1. **Loading**: Preload shell assets (fonts, icons, sound effects) with a quiet progress bar while starting the catalog fetch.
2. **Home**: Continue streaming 2.5MB `lisztnup.json` behind a delayed loading card; Start Game, library, and tracklist counts wait on catalog readiness. Select mode, configure tracklist, change locale, and import shared tracklists via `addTracklist`.
3. **Setup**: Player names/colors/order (Timeline/Classic/Buzzer). Bingo shows QR code for `/bingo` route.
4. **Game Start**: Create `TracklistGenerator`, filter data, sample first track. Apply track length + volume settings.
5. **Round Flow**: Mode-specific (see above). All modes use `GameScreen` for shared infrastructure.
6. **In-Game Settings**: Volume (instant) and track length (next track) adjustable mid-game.
7. **Quit**: Logo click → confirmation dialog → reset state → home.
8. **Game Over** (Classic/Buzzer): Winner/tie announcement, final scores, stats graph, play again, or home.

## Scoring & Categories

Five categories, each with a point value. Categories can be disabled per tracklist (e.g., single-composer tracklist disables "Composer").

| Category | Points | Disabled when...             |
| -------- | ------ | ---------------------------- |
| Composer | 20     | Single composer in tracklist |
| Work     | 30     | —                            |
| Form     | 10     | —                            |
| Decade   | 15     | Narrow year range            |
| Era      | 10     | Narrow year range            |

Buzzer "Wrong" guess: -10 points.

## Tracklist System

### Default Tracklists

Five difficulty levels (Beginner → Expert) with pre-configured filters. Generated documentation in `out/TRACKLIST_*.md`.

### Daily Challenge

The daily challenge uses a global UTC month schedule so every player sees the same tracklist on the same day without server storage. Fixed dates reserve composer birthdays, national days, and Women’s Day; monthly filler excludes some tracklists, repeating allowed filler only when the month needs more days.

### Custom Tracklists

Created via `TracklistEditor`. Saved to localStorage via `SettingsService`. Features:

- **Filters** (toggleable): composer filtering (include/exclude/notability/country/gender), year range, popularity range, top N works, work name regex, per-composer work limit, max tracks per work, popularity weighting
- **Manual curation**: include/exclude specific works via `WorkSelectorPopup`. Stored as short UUIDs (8 chars).
- **Category score adjustments**: -4.3 to +4.3 per category to bias sampling
- **Sharing**: Compress config → URL param. Import via `addTracklist` param on load.

When filters disabled, only manually included works are used.

### TracklistGenerator

O(1) sampling with weighted random selection. Swap-and-pop for efficient sampling. Tracks work usage to enforce `maxTracksFromSingleWork` limits. Two weighting modes: logarithmic (default, variety) or work-count (when `limitWorksFromComposer` is set).

## Data Pipeline

```
MusicBrainz API → query_musicbrainz.py → process_musicbrainz.py
                                                    ↓
Deezer API ← link_deezer.py ← process_deezer.py → static/lisztnup.json (2.5MB)
```

Python scripts in `data/`. Config in `WORK_PROCESSING_CONFIG.yaml` and `WORK_TYPE_MATCHING_RULES.yaml`. Bad tracks filtered via `DEEZER_BANNED_IDS` (hard) and `DEEZER_EXCLUDED_IDS` (soft).

`lisztnup.json` stores work and part GIDs as 8-character prefixes for size; `composer_gid` values remain full for MusicBrainz artist links. The client hydrates this raw DTO into `GameCatalog` for indexed lookups and part→work resolution.

Each part includes up to 5 Deezer IDs (max ceil(n/2) of available recordings) for fallback.

## User-Facing Features

- **Problem reporting**: In-game popup via `TrackInfo` → `ProblemReportPopup` → `POST /api/game/reports`. Includes Deezer/MusicBrainz debug info. Thank-you state on success.
- **Feedback**: Multiple entry points (homepage FAB, about popup, end game, app footer) → `FeedbackPopup` → `POST /api/game/feedback`.
- **Search**: `SearchPopup` opens external search across 12 providers (Google, YouTube, Spotify, Apple Music, IDAGIO, Amazon, Tidal, Deezer, Wikipedia, IMSLP, PrestoMusic, MusicBrainz) for composer + work.
- **Library browser**: `LibraryViewer` with cloud view (composer word cloud), composer view, and table view. Category filter chips, country/gender filters on cloud.
