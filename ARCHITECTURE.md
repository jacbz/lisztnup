# Architecture

## Directory Map

```
src/
├── app.css                    Global styles (scrollbars, keyframes)
├── app.d.ts                   Type declarations (Cloudflare bindings, __BUILD_DATE__)
├── app.html                   HTML shell
├── hooks.server.ts            Server hooks: pageview tracking with bot filtering
├── lib/
│   ├── types/                 Shared TypeScript types (composer, data, game, settings, track, work)
│   ├── data/                  Static data configs (categories, default tracklists, tracklist configs)
│   ├── stores/                Svelte stores (gameData, settings, gameState — which also
│   │                            defines tracklist + currentRound stores, gameSession,
│   │                            toast, networkStatus)
│   ├── utils/                 Pure utilities (compression, formatters, random, uuid, svg, fontLoader, search)
│   ├── i18n/                  svelte-i18n setup + 10 locale JSON files
│   ├── services/              Business logic singletons
│   │   ├── DeezerPlayer.ts      Audio playback + LUFS normalization + NetworkError
│   │   ├── ReplayPlayer.svelte.ts  Independent replay (Svelte 5 reactive)
│   │   ├── TracklistGenerator.ts   O(1) weighted sampling + curation
│   │   ├── SettingsService.ts      localStorage persistence
│   │   └── PreviewPlayer.svelte.ts Audio preview for tracklist viewer
│   ├── logic/                 Game logic classes
│   │   ├── timelineGame.svelte.ts  Timeline game state + logic (Svelte 5 reactive class)
│   │   └── timelineTypes.ts        Timeline type definitions
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
utils/                   Pure utility functions (no side effects, no imports from above)
  ↓
types/                   TypeScript type definitions (no runtime code)
  ↓
data/                    Static configuration (tracklist configs, categories)
```

**Cross-cutting**: `i18n/` is used by all layers. `server/` is only imported by `routes/api/`.

## Client Data Flow

```
static/lisztnup.json
  → LoadingScreen (streamed with progress bar)
  → gameData store (2.5MB in memory)
  → TracklistGenerator (filters on init, O(1) sampling)
  → GameScreen.sampleAndPreloadTrack() (on-demand per round)
  → DeezerPlayer.load() (fetch preview from Deezer API, LUFS analysis)
  → playerState store (isPlaying, progress, track, analyserNode)
  → UI components (PlayerControl, Visualizer, TrackInfo)
```

## Key Singletons

| Singleton            | Module                  | Scope                                                                                  |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `deezerPlayer`       | `DeezerPlayer.ts`       | One per app — created in GameScreen, destroyed on unmount                              |
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

All tables include `user_hash` (SHA-256 of IP + daily-rotating salt — never stores raw IPs) and `country` (from Cloudflare headers).

### API Endpoints

| Endpoint                  | Purpose                                       | Key behavior                                            |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `POST /api/game/events`   | Game telemetry (start/progress/end/placement) | UPSERT + `json_patch()`, non-blocking via `waitUntil()` |
| `POST /api/game/feedback` | User feedback (5–1000 chars)                  | Validates, writes DB, sends Telegram notification       |
| `POST /api/game/reports`  | Problem reports with Deezer/work metadata     | Same as feedback + detailed Telegram message            |

### Server Hooks (hooks.server.ts)

Pageview tracking: bot filtering (UA + Cloudflare Bot Management), 10-min dedup per user per path, collects country/device/OS/UA. Non-blocking via `waitUntil()`.

### Client Analytics (game-logger.ts)

`GameAnalytics` class (exported as `analytics` singleton):

- `startGame()`, `logPlacement()`, `updateProgress()`, `endGame()` → `POST /api/game/events`
- `reportProblem()` → `POST /api/game/reports`
- `sendFeedback()` → `POST /api/game/feedback`
- Delivery: `navigator.sendBeacon()` with `fetch(..., { keepalive: true })` fallback
- Completely silent failures — never blocks gameplay
- Session ID via `crypto.randomUUID()` (with fallback)

### Telegram Notifications (server/telegram.ts)

Admin notifications for feedback and problem reports; sends HTML-formatted messages via Telegram Bot API
