# AGENTS.md

> Entry point for AI coding agents. Read this first, then follow links for deeper context.

## Project

**Liszt'n Up!** — A serverless, web-based classical music guessing game for local multiplayer on a tablet. Four game modes (Timeline, Classic, Buzzer, Bingo). 10,500+ works, 900+ composers, 27,000+ tracks.

## Tech Stack

| Layer     | Technology                          |
| --------- | ----------------------------------- |
| Framework | SvelteKit 5 (Svelte Runes)          |
| Language  | TypeScript (strict)                 |
| Styling   | Tailwind CSS 4                      |
| State     | Svelte Stores + localStorage        |
| Audio     | Web Audio API + HTML Audio fallback |
| Icons     | `lucide-svelte`                     |
| i18n      | `svelte-i18n` (10 languages)        |
| Deploy    | Cloudflare Pages + D1               |
| Build     | Vite 7, pnpm                        |

## Commands

```bash
pnpm dev              # Dev server (localhost:5173)
pnpm build            # Full build (sync tracklists → vite build → minify JSON)
pnpm check            # Type-check with svelte-check
pnpm lint             # ESLint + Prettier
pnpm format           # Auto-format
pnpm preview          # Preview production build
pnpm sync:tracklist   # Regenerate tracklist docs in out/
```

## Documentation Map

| Document                                 | Purpose                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ARCHITECTURE.md](ARCHITECTURE.md)       | **Start here for code navigation.** Directory map, layer architecture, data flow, singletons, server & analytics layer, database schema, API endpoints. |
| [doc/DESIGN.md](doc/DESIGN.md)           | Design principles, Svelte 5 patterns, Tailwind/styling rules, TypeScript conventions, i18n rules.                                                       |
| [doc/FRONTEND.md](doc/FRONTEND.md)       | Component hierarchy, GameScreen base pattern, Popup conventions, SpinningWheel physics, animation patterns, component catalog.                          |
| [doc/PRODUCT.md](doc/PRODUCT.md)         | Game modes & rules, game flow state machine, tracklist system, data pipeline, user-facing features.                                                     |
| [scoring/SCORING.md](scoring/SCORING.md) | Detailed scoring formulas and balance variables.                                                                                                        |
| [doc/RELIABILITY.md](doc/RELIABILITY.md) | Network resilience, audio fallbacks, Safari handling, state integrity guards, resource cleanup.                                                         |

## Documentation Maintenance

After implementing changes, **update the relevant doc file** — not all of them, just the one that covers the area you changed:

| What changed                                                        | Update                                   |
| ------------------------------------------------------------------- | ---------------------------------------- |
| New/moved files, layers, stores, services, API endpoints, DB tables | [ARCHITECTURE.md](ARCHITECTURE.md)       |
| Coding patterns, styling rules, i18n conventions                    | [doc/DESIGN.md](doc/DESIGN.md)           |
| Components, popups, animations, UI patterns                         | [doc/FRONTEND.md](doc/FRONTEND.md)       |
| Game rules, flow, tracklists, user features                         | [doc/PRODUCT.md](doc/PRODUCT.md)         |
| Scoring formulas and balance variables                              | [scoring/SCORING.md](scoring/SCORING.md) |
| Error handling, resilience, cleanup, Safari workarounds             | [doc/RELIABILITY.md](doc/RELIABILITY.md) |

**Anti-bloat rules:**

- Each doc must stay **under 150 lines**. If a doc is approaching the limit, tighten prose — don't split into more files.
- Write **what** and **why**, not implementation play-by-play. Agent-legible means concise and navigable, not exhaustive.
- Never duplicate information across docs. Each fact lives in exactly one file.
- Remove obsolete content when replacing it — don't append.
- `AGENTS.md` itself must stay **under 100 lines**. It is a map, not an encyclopedia.

## Critical Conventions

1. **Tailwind over custom CSS.** Only use `app.css` for things Tailwind can't express.
2. **Svelte 5 Runes only.** `$state`, `$derived`, `$effect` — never legacy `$:` syntax.
3. **All strings through i18n.** No hardcoded user-visible text. No `default` values. Add keys to all 10 locale files. As a creative game, all i18n strings must be creative, highly idiomatic to each language, and never just a literal translation.
4. **Types directory.** Shared types in `src/lib/types/`, re-exported from `index.ts`.
5. **Context pattern.** Parent components expose typed context via `setContext` + `satisfies`. Children use `getGameContext()`.
6. **Stores auto-persist.** All settings changes write to localStorage immediately via `SettingsService`.
7. **Network errors.** Use `NetworkError` for transient failures. Callers distinguish from permanent errors with `instanceof`.
8. **Cleanup.** Always unsubscribe stores, remove event listeners, destroy audio resources in `onDestroy` or `onMount` return.
9. **Analytics are silent.** `GameAnalytics` uses `sendBeacon` / `keepalive` fetch. Never block gameplay on telemetry.
10. **Popup transitions.** Use separate `in`/`out` transitions (not `transition:` directive) to prevent Safari flickering.

## Key Files

| File                                        | Role                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| `src/lib/services/DeezerPlayer.ts`          | Audio playback singleton + LUFS normalization + NetworkError |
| `src/lib/services/TracklistGenerator.ts`    | O(1) weighted track sampling + manual curation               |
| `src/lib/components/game/GameScreen.svelte` | Base game infrastructure (all modes extend this)             |
| `src/lib/components/game/context.ts`        | Typed context interface for GameScreen ↔ mode communication  |
| `src/lib/logic/timelineGame.svelte.ts`      | Timeline game state + logic (Svelte 5 reactive class)        |
| `src/lib/stores/`                           | All reactive state (gameData, settings, gameState, etc.)     |
| `src/lib/game-logger.ts`                    | Client analytics singleton (sendBeacon delivery)             |
| `src/hooks.server.ts`                       | Server-side pageview tracking                                |
| `src/routes/api/game/`                      | Analytics + feedback + reports API endpoints                 |
| `database.sql`                              | Database schema (5 tables)                                   |
| `static/lisztnup.json`                      | 2.5MB compiled music database                                |
