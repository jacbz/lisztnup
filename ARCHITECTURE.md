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
│   │   ├── client.ts           Browser API client + leaderboard cache + background retry queue
│   │   ├── DeezerPlayer.ts      Active playback + preloadable audio assets
│   │   ├── PlayableTrackBuffer.svelte.ts Shared current+2 playable preload queue
│   │   ├── ReplayPlayer.svelte.ts  Independent replay (Svelte 5 reactive)
│   │   ├── TracklistGenerator.ts   O(1) weighted sampling + curation
│   │   ├── SettingsService.ts      localStorage persistence
│   │   └── PreviewPlayer.svelte.ts Audio preview for tracklist viewer
│   ├── logic/                 Game logic classes
│   │   ├── timelineGame.svelte.ts  Timeline game state + logic (Svelte 5 reactive class)
│   │   ├── timelineScoring.ts      Pure scoring functions (difficulty, speed, streak, efficiency)
│   │   └── timelineTypes.ts, timelineMotion.ts  Timeline types + shared card motion helpers
│   ├── server/                Server-only code (Cloudflare Workers)
│   │   ├── analytics.ts         User hashing (GDPR-compliant daily-rotating salt)
│   │   └── telegram.ts          Telegram Bot API notifications
│   ├── game-logger.ts         Client-side analytics (GameAnalytics singleton)
│   └── components/            UI components (see doc/FRONTEND.md)
│       ├── game/              Game mode screens + SpinningWheel + timeline/
│       └── ui/                primitives/ screens/ setup/ gameplay/
├── routes/
│   ├── +page.svelte           Home page (main app)
│   ├── +layout.svelte         Root layout
│   ├── bingo/+page.svelte     Bingo grid route (per-player device)
│   └── api/game/
│       ├── events/+server.ts  Game telemetry (start, progress, end, placements)
│       ├── feedback/+server.ts User feedback collection
│       ├── leaderboard/+server.ts Timeline leaderboard (GET top N, POST with anti-cheat)
│       └── reports/+server.ts  Problem report collection
static/
├── lisztnup.json              2.5MB compiled music database
├── fonts/                     Streamster + Rajdhani font files
└── screenshots/               Mode rule screenshots
data/                          Python data pipeline (MusicBrainz → Deezer)
doc/                           Design docs + generated tracklist docs
out/                           Generated tracklist reference docs (TRACKLIST_*.md)
```

## Layer Architecture

Dependency direction flows **downward only** — upper layers may import from lower layers, never the reverse.

```
routes/                  SvelteKit pages and API endpoints
  ↓
components/              Svelte components (ui/ and game/)
  ↓
logic/                   Game logic classes (TimelineGame)
  ↓
services/                Business logic (DeezerPlayer, TracklistGenerator, Settings)
  ↓
stores/                  Reactive state (Svelte stores)
  ↓
models/                  Runtime domain models and indexed catalog lookups
  ↓
utils/                   Pure utility functions (no side effects, no imports from above)
  ↓
types/                   Non-catalog TypeScript definitions (no runtime code)
  ↓
data/                    Static configuration (tracklist configs, categories)
```

**Cross-cutting**: `i18n/` is used by all layers. `server/` is only imported by `routes/api/`.

## Client Data Flow

```
static/lisztnup.json
  → LoadingScreen (streamed with progress bar)
  → gameData store (`GameCatalog` hydrates + indexes the catalog once)
  → TracklistGenerator (filters indexed catalog on init, O(1) sampling)
  → PlayableTrackBuffer (current track + 2 ready future tracks)
  → DeezerPlayer.preload() (fetch preview from Deezer API, LUFS analysis)
  → playerState store (isPlaying, progress, track, analyserNode)
  → UI components (PlayerControl, Visualizer, TrackInfo)
```

## Key Runtime Objects

| Object               | Module                  | Scope                                                                                  |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `GameCatalog`        | `models/GameCatalog.ts` | Immutable hydrated music catalog with GID indexes and track resolvers                  |
| `deezerPlayer`       | `DeezerPlayer.ts`       | One active playback controller; buffered assets are owned by `PlayableTrackBuffer`     |
| `playerState`        | `DeezerPlayer.ts`       | Store exported alongside player — reactive playback state                              |
| `analytics`          | `game-logger.ts`        | One per app — fire-and-forget telemetry via sendBeacon                                 |
| `settings`           | `stores/settings.ts`    | Custom store wrapping `SettingsService` (static class) — auto-persists to localStorage |
| `TracklistGenerator` | `TracklistGenerator.ts` | One per game session — created at game start                                           |

## Server & Analytics

### Deployment

Cloudflare Pages with D1 database. Config in `wrangler.toml`:

- **Binding**: `DB` → D1 database `lisztnup-analytics`
- **Env vars**: `TELEGRAM_BOT_TOKEN` (for admin notifications)
- **Adapter**: `@sveltejs/adapter-cloudflare`
- **Output**: `.svelte-kit/cloudflare/`

### Database Schema (analytics.sql)

| Table                 | Purpose                 | Key columns                                                                |
| --------------------- | ----------------------- | -------------------------------------------------------------------------- |
| `pageviews`           | Server-side page views  | `user_hash`, `country`, `path`, `device`, `os`, `user_agent`               |
| `game_sessions`       | Game lifecycle tracking | `id` (UUID), `state`, `mode`, `tracklist_id`, `locale`, `game_info` (JSON) |
| `timeline_placements` | Per-placement tracking  | `session_id`, `work_gid`, `placed_correctly`                               |
| `problem_reports`     | User-reported issues    | `session_id`, `message`, `deezer_id`, `composer`, `work`, `part`           |
| `feedback`            | General user feedback   | `session_id`, `message`, `email`                                           |
| `timeline_scores`     | Timeline solo scores    | `player_token`, `score`, `attempts`, `target`, `average_time`, `log`       |

All tables include `user_hash` (SHA-256 of IP + daily-rotating salt — never stores raw IPs) and `country` (from Cloudflare headers).

### API Endpoints

| Endpoint                     | Purpose                                       | Key behavior                                                |
| ---------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| `POST /api/game/events`      | Game telemetry (start/progress/end/placement) | UPSERT + `json_patch()`, non-blocking via `waitUntil()`     |
| `POST /api/game/feedback`    | User feedback (5–1000 chars)                  | Validates, writes DB, sends Telegram notification           |
| `POST /api/game/reports`     | Problem reports with Deezer/work metadata     | Same as feedback + detailed Telegram message                |
| `GET /api/game/leaderboard`  | Top N timeline scores                         | Max 50; strips tokens and returns Berlin `YYYY-MM-DD` dates |
| `POST /api/game/leaderboard` | Submit solo timeline score                    | Validates completion + stores compact replay log            |

### Server Hooks (hooks.server.ts)

Pageview tracking: bot filtering (UA + Cloudflare Bot Management), 10-min dedup per user per path, collects country/device/OS/UA. Non-blocking via `waitUntil()`.

### Client Analytics (game-logger.ts)

`GameAnalytics` sends game lifecycle, placement, report, and feedback events with `sendBeacon()` / keepalive fetch. Failures are silent and never block gameplay.

### Telegram Notifications (server/telegram.ts)

Admin notifications for feedback and problem reports; sends HTML-formatted messages via Telegram Bot API
