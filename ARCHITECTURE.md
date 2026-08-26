# Architecture

## Directory Map

```
src/
├── app.css                    Global styles (scrollbars, keyframes)
├── app.d.ts                   Type declarations (Cloudflare bindings, __BUILD_DATE__)
├── app.html                   HTML shell
├── hooks.server.ts            Server hooks: pageview tracking with bot filtering
├── lib/
│   ├── types/                 Shared non-catalog TypeScript types (game, settings, leaderboard)
│   ├── data/                  Static data configs (categories, default tracklists, tracklist configs)
│   ├── models/                Runtime domain models (`GameCatalog`, `Composer`, `Work`, `Part`)
│   ├── stores/                Svelte stores (gameData, settings, gameState, session, toast)
│   ├── utils/                 Pure utilities (compression, formatters, random, uuid, svg, fontLoader, search)
│   ├── i18n/                  svelte-i18n setup + 10 locale JSON files
│   ├── services/              Business logic singletons
│   │   ├── client.ts           Browser API client + leaderboard/replay caches + retry queue
│   │   ├── DeezerPlayer.ts      Active playback + preloadable audio assets
│   │   ├── audioProcessing.ts   Pure DSP: LUFS, gain, leading-silence detection
│   │   ├── PlayableTrackBuffer.svelte.ts Shared current+2 playable preload queue
│   │   ├── TracklistGenerator.ts   O(1) weighted sampling + curation
│   │   ├── SettingsService.ts      localStorage persistence
│   │   └── ReplayPlayer / PreviewPlayer .svelte.ts  Replay + tracklist-viewer audio
│   ├── logic/                 Game logic classes
│   │   ├── timelineGame.svelte.ts  Timeline state + logic (Svelte 5 reactive class)
│   │   ├── timelineScoring.ts      Pure scoring (difficulty, speed, streak, efficiency)
│   │   └── timelineTypes/Motion/ReplayIndex.ts  Types, motion, replay indexes
│   ├── server/                Server-only code (Cloudflare Workers)
│   │   ├── analytics.ts         User hashing (GDPR-compliant daily-rotating salt)
│   │   ├── logging.ts           Database-backed diagnostic logger
│   │   ├── metrics.ts           Read-through cache for global aggregates
│   │   ├── homeStats.ts         Home counter load, shared by / and /[locale]
│   │   ├── leaderboardRollup.ts Sole writer of the leaderboard_best rollup
│   │   └── telegram.ts          Telegram Bot API notifications
│   ├── game-logger.ts         Client-side analytics (GameAnalytics singleton)
│   └── components/            UI components (see doc/FRONTEND.md)
│       ├── game/              Game mode screens + SpinningWheel + timeline/
│       └── ui/                primitives/ screens/ setup/ gameplay/
├── routes/
│   ├── +page.svelte           Home app; [locale=locale]/ mirrors it for localized SEO
│   ├── +layout.svelte         Root layout + server-derived SEO metadata
│   ├── bingo/+page.svelte     Bingo grid route (per-player device)
│   ├── sitemap.xml/+server.ts Localized URL sitemap
│   └── api/game/
│       ├── events/+server.ts  Game telemetry (start, progress, end, placements)
│       ├── feedback/+server.ts User feedback collection
│       ├── leaderboard/+server.ts Timeline leaderboard (GET top N, POST with anti-cheat)
│       │   └── replay/+server.ts  One replay blob, fetched on demand
│       └── reports/+server.ts  Problem report collection
static/
├── lisztnup.json              2.5MB compiled music database
├── fonts/                     Streamster + Rajdhani font files
└── screenshots/               Mode rule screenshots
data/                          Python data pipeline (MusicBrainz → Deezer)
doc/                           Design docs + generated tracklist docs
out/                           Generated docs; scoring/ has Timeline formulas, simulator, reports
```

## Layer Architecture

Dependency direction flows **downward only** — upper layers may import from lower layers, never the reverse.

```
routes/ → components/ → logic/ → services/ → stores/ → models/ → utils/ → types/ → data/
```

Each layer's contents are described in the directory map above. `utils/` and below are pure — no side effects, no imports from higher layers.

**Cross-cutting**: `i18n/` is used by all layers. `server/` is only imported by `routes/api/` and `+page.server.ts` loads.

## Client Data Flow

```
LoadingScreen (shell assets + static/lisztnup.json fetch)
  → Home loading card (delayed takeover of streamed catalog progress)
  → gameData store (`GameCatalog` hydrates + indexes once)
  → TracklistGenerator (filters indexed catalog on init, O(1) sampling)
  → PlayableTrackBuffer (current track + 2 ready future tracks)
  → DeezerPlayer.preload() (Deezer preview fetch, LUFS analysis)
  → playerState store → UI (PlayerControl, Visualizer, TrackInfo)
```

## Key Runtime Objects

| Object               | Module                  | Scope                                                                                  |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `GameCatalog`        | `models/GameCatalog.ts` | Immutable hydrated music catalog with GID, composer-count indexes, and track resolvers |
| `deezerPlayer`       | `DeezerPlayer.ts`       | One active playback controller; buffered assets are owned by `PlayableTrackBuffer`     |
| `playerState`        | `DeezerPlayer.ts`       | Store exported alongside player — reactive playback state                              |
| `analytics`          | `game-logger.ts`        | One per app — fire-and-forget telemetry via sendBeacon                                 |
| `settings`           | `stores/settings.ts`    | Custom store wrapping `SettingsService` (static class) — auto-persists to localStorage |
| `TracklistGenerator` | `TracklistGenerator.ts` | One per game session — created at game start                                           |

## Server & Analytics

### Deployment

Cloudflare Pages with D1. Config in `wrangler.toml`: binding `DB` → `lisztnup-analytics`; env var `TELEGRAM_BOT_TOKEN`; `@sveltejs/adapter-cloudflare` → `.svelte-kit/cloudflare/`. Pages has no Cron Triggers — scheduled work must be lazy instead.

### Database Schema (database.sql)

| Table                 | Purpose                 | Key columns                                                                |
| --------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `pageviews`           | Server-side page views  | `user_hash`, `country`, `path`, `device`, `os`, `user_agent`               |
| `game_sessions`       | Game lifecycle tracking | `id` (UUID), `state`, `mode`, `tracklist_id`, `locale`, `game_info` (JSON) |
| `timeline_placements` | Per-placement tracking  | `session_id`, `work_gid`, `part_gid`, `deezer_id`, `placement`, `distance` |
| `problem_reports`     | User-reported issues    | `session_id`, `message`, `track_metadata` (JSON: MB/Deezer ids + labels)   |
| `feedback`            | General user feedback   | `session_id`, `message`, `email`                                           |
| `timeline_scores`     | Timeline solo scores    | `player_token`, `score`, `attempts`, `target`, `average_time`, `has_log`   |
| `timeline_score_logs` | Replay blobs, split out | `score_id` (PK), `log` — fetched only when a replay is opened              |
| `logs`                | Server-side diagnostics | `severity`, `message`, `context` (includes user/country), `session_id`     |
| `leaderboard_best`    | Leaderboard rollup      | PK `(period_key, player_token, player_name, tracklist_id, target)`         |
| `track_stats`         | Placement rollup        | `part_gid` (PK), `played`, `correct`                                       |
| `metrics`             | Materialized aggregates | `key` (PK), `value`, `updated_at`                                          |

All tables include `user_hash` (SHA-256 of IP + daily-rotating salt — never stores raw IPs) and `country` (from Cloudflare headers).

### Row-Read Budget

D1 bills **rows read**, scaling with table size × request rate. Any query whose cost grows with total table size must stay out of per-request paths. Preserve both mechanisms when adding queries:

- **Indexes** — every hot-path predicate is index-seekable. Check new queries with `EXPLAIN QUERY PLAN`: expect `SEARCH`, never `SCAN`, and no `TEMP B-TREE FOR ORDER BY` alongside a `LIMIT`.
- **Rollups, written not scanned** — writes are the cheap resource (100k/day allowed, ~2k used). `track_stats` is UPSERTed with each placement insert. `leaderboard_best` holds one row per player per config per period, which is what removes the old `ROW_NUMBER()` dedup CTE.

`leaderboard_best` has exactly one writer — `rebuildPlayerRollup()` in `src/lib/server/leaderboardRollup.ts`, called on submit and rename — so nothing can drift, and inconsistency self-heals on the player's next submission. Period keys (`all`, `W:<cutoff>`, `M:<cutoff>`) _are_ the German week/month boundary, so buckets and query cutoffs cannot diverge; only currently-queryable buckets are materialized.

`metrics` is a read-through cache for aggregates identical across visitors: serve the stored row, refresh in `waitUntil()` past TTL (Pages has no Cron Triggers). See `getCachedMetric()`.

### API Endpoints

| Endpoint                           | Purpose                                       | Key behavior                                                                                                                                                     |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/game/events`            | Game telemetry (start/progress/end/placement) | UPSERT + `json_patch()`, non-blocking via `waitUntil()`                                                                                                          |
| `POST /api/game/feedback`          | User feedback (5–1000 chars)                  | Validates, writes DB, sends Telegram notification                                                                                                                |
| `POST /api/game/reports`           | Problem reports with track metadata JSON      | Same as feedback + Telegram message with MusicBrainz/Deezer links                                                                                                |
| `GET /api/game/track-stats`        | Per-card Timeline placement stats             | `track_stats` primary-key lookup                                                                                                                                 |
| `GET /api/game/leaderboard`        | Top N timeline scores; tracklist records      | Max 50; `scope` + `period` + `country`; reads `leaderboard_best`; returns `has_log`/`score_id`, not the replay itself                                            |
| `POST/PATCH /api/game/leaderboard` | Submit, publish, or rename timeline scores    | POST validates replay logs (with replay metadata for score recalculation); PATCH rewrites anonymous rows for the browser token; both rebuild the player's rollup |
| `GET /api/game/leaderboard/replay` | One replay blob by `score_id`                 | Fetched only when a viewer opens a replay; immutable, cached forever                                                                                             |

### Server Hooks (hooks.server.ts)

Pageview tracking: bot filtering (UA + Cloudflare Bot Management), 10-min dedup per user per path, collects country/device/OS/UA. Non-blocking via `waitUntil()`.

### Client Analytics (game-logger.ts)

`GameAnalytics` sends game lifecycle, placement, report, and feedback events with `sendBeacon()` / keepalive fetch. Failures are silent and never block gameplay.
