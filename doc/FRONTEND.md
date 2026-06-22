# Frontend: Component Architecture & UI Patterns

## Component Hierarchy

```
src/lib/components/
├── ui/
│   ├── primitives/     Toast, Popup, Dialog, EdgeDisplay, Slider, RangeSlider,
│   │                   ToggleButton, NumberSelector, LoadingProgress, ScoringCard, Logo, QRCode,
│   │                   ExternalLink, SearchPopup, AboutPopup, AppFooter
│   ├── screens/        HomeScreen, LoadingScreen, EndGameScreen, StatsScreen, ScoringScreen
│   ├── setup/          ModeSelector, ModeRulesPopup, PlayerSetup, TracklistSelector,
│   │                   TracklistEditor, TrackTable, ComposerCloud, LibraryViewer,
│   │                   WorkSelectorPopup, TimelineLeaderboard, BingoSetup, ShareLinkPopup
│   └── gameplay/       PlayerControl, PlayStopIcon, Visualizer, InGameSettings,
│                       TrackInfo, NetworkStatusBanner, FeedbackPopup, ProblemReportPopup,
│                       FlashingText
├── game/
│   ├── GameScreen.svelte         Base infrastructure for all modes
│   ├── ClassicGameScreen.svelte  ~25 lines, delegates everything to GameScreen
│   ├── BuzzerGameScreen.svelte   Buzzer-specific timing + category progression
│   ├── BingoGameScreen.svelte    Wheel-based, no scoring
│   ├── TimelineGameScreen.svelte Thin wrapper — logic in TimelineGame class
│   ├── SpinningWheel.svelte      Canvas + SVG, physics-based
│   └── timeline/                 TimelineCard, PlayerTimeline, CardStack, TimelineRevealPopup, TimelineEndGameScreen
```

All UI components re-exported from `src/lib/components/ui/index.ts`.
`LoadingScreen` blocks only on shell visuals/fonts; `HomeScreen` warms local game sounds in the background while setup stays interactive.

## GameScreen Base Pattern

`GameScreen.svelte` provides shared infrastructure that all game modes extend:

- Audio playback (play/stop/replay via DeezerPlayer active controller)
- Track sampling and buffered preloading (`PlayableTrackBuffer`: current + 2 future ready tracks)
- Common UI: header, round indicator, quit dialog, in-game settings, scoring screen, track-info popup, stats screen, end game screen, network status banner
- Typed context exposed to child mode components via `setContext`

**Mode components access shared functionality through context** (`getGameContext()`):

| Context getter/method            | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `ctx.currentTrack`               | Reactive getter — track at current round index      |
| `ctx.audioProgressValue`         | Reactive getter — playback progress 0–1             |
| `ctx.playTrack()`                | Start audio playback                                |
| `ctx.stopTrack()`                | Stop audio playback                                 |
| `ctx.replayTrack()`              | Replay current track                                |
| `ctx.revealTrack(options?)`      | Trigger reveal flow with `RevealOptions`            |
| `ctx.nextRound()`                | Advance to the next buffered track                  |
| `ctx.currentTrackDuration`       | Active loaded track duration in seconds             |
| `ctx.isPreloading`               | True only for initial/depleted visible waits        |
| `ctx.hasPreloadError`            | True when visible loading is retrying after failure |
| `ctx.retryPreload()`             | Manual retry trigger                                |
| `ctx.invalidateBufferedTracks()` | Drop future preloads after audio setting changes    |

**`RevealOptions`** lets modes customize post-reveal behavior:

- `showScoring` — override whether scoring screen appears
- `scoringCategories` — subset of categories (Buzzer passes only revealed ones)
- `beforeNextRound` — mode-specific cleanup callback

## Popup & Dialog Conventions

**`Popup.svelte`** — the universal modal. Use its preset system:

| Prop          | Options                                            | Default  |
| ------------- | -------------------------------------------------- | -------- |
| `width`       | `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `5xl`, `6xl` | —        |
| `maxHeight`   | `85vh`, `90vh`                                     | `90vh`   |
| `padding`     | `none`, `sm`, `md`, `lg`, `responsive`             | `md`     |
| `shadow`      | `light`, `medium`, `strong`                        | `medium` |
| `overflow`    | `auto`, `hidden`, `visible`                        | `auto`   |
| `borderColor` | `cyan`, `none`, custom class                       | `cyan`   |
| `styled`      | boolean                                            | `true`   |

**Critical**: Use separate `in`/`out` transitions (not `transition:` directive) to prevent Safari flickering. Backdrop fade-out has 100ms delay.

**Close guard**: `Popup` prevents double-fire of `onClose` during out-transition via a `closing` flag. Reset when `visible` becomes `true`.

**`Dialog.svelte`** — confirmation dialogs. Wraps `Popup` with `md` width and `strong` shadow.

## Rotation-Aware Components

**`EdgeDisplay`** mirrors content onto an explicit set of screen edges via the `edges: PlayerEdge[]` prop (default all four), orienting each copy towards the player seated there. Passes rotation context to children via snippet parameters so they can counter-rotate for correct hit-testing and drag visualization. Compute the edge set with `edgesForPlayerCount()` (`$lib/utils`) for modes that share one broadcast display (Classic/Buzzer), or from per-player edges (Timeline's `occupiedEdges`).

Used in Timeline mode where multiple players sit around a tablet. `PlayerTimeline` and drag-and-drop logic use `document.elementsFromPoint` for rotation-agnostic hit testing and vector rotation for drag ghosts.

## SpinningWheel

Canvas-based with SVG text overlay for crisp curved text. Key behaviors:

- **Physics**: Quartic ease-out deceleration, 96% friction normalized to 60fps
- **Spin**: 3–6 full rotations + random angle, validated to avoid invalid categories
- **Drag**: Sliding window velocity tracking (last 5 samples, ~80ms). Threshold: 0.3 deg/ms
- **Safari**: Throttled drag updates via `requestAnimationFrame`, reduced shadow blur during animation
- **Categories**: Shuffled on mount, filtered by tracklist. `getCategoryFromRotation` is the single source of truth.

## Audio Visualization

`Visualizer.svelte` renders a canvas-based starburst that reacts to music frequency data.

```
DeezerPlayer → playerState.analyserNode → Visualizer.$effect → requestAnimationFrame loop
```

Uses `$effect` to watch `analyserNode`, starts visualization when available (handles LUFS analysis delay). 300ms fade in/out transitions. Uses `untrack()` to read canvas/dimensions without creating reactive dependencies.

## Reusable Component Catalog

| Component               | Purpose                                                               | Used by                                                                                  |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `PlayerControl`         | Multi-state play button with visualizer                               | GameScreen, TrackTable, TrackInfo                                                        |
| `PlayStopIcon`          | Morphing play↔stop SVG with spring animation                          | PlayerControl                                                                            |
| `TrackInfo`             | Track metadata display with replay, report, search                    | Scoring flow, Timeline card inspect; optional `showMirror` for mirrored tabletop layouts |
| `ScoringCard`           | Per-player scoring with category toggles                              | ScoringScreen                                                                            |
| `TrackTable`            | Sortable work table with audio preview playback                       | LibraryViewer, WorkSelectorPopup                                                         |
| `ComposerCloud`         | Chunk-rendered word cloud with filters; countries sorted by count     | LibraryViewer                                                                            |
| `LibraryViewer`         | Multi-view library browser (cloud/composer/table)                     | TracklistSelector, TracklistEditor                                                       |
| `WorkSelectorPopup`     | Work selection for manual curation                                    | TracklistEditor                                                                          |
| `ShareLinkPopup`        | QR code + copy/share link                                             | BingoSetup, TracklistSelector                                                            |
| `NetworkStatusBanner`   | Offline/loading/reconnected banner                                    | GameScreen                                                                               |
| `Logo`                  | Branding with glow effect, configurable size                          | GameScreen, Bingo route                                                                  |
| `QRCode`                | QR code generator (cyan on dark gray)                                 | ShareLinkPopup, BingoSetup                                                               |
| `SearchPopup`           | External search (12 providers incl. streaming, reference)             | TrackInfo                                                                                |
| `ModeRulesPopup`        | Game rules with screenshots                                           | ModeSelector                                                                             |
| `TimelineLeaderboard`   | Period/scope scorebar, click-open country menu, expandable top scores | HomeScreen                                                                               |
| `TimelineEndGameScreen` | Timeline finale with replay, score sharing, and leaderboard naming    | TimelineGameScreen                                                                       |
| `TracklistRecordsPopup` | Latest record per tracklist/target combo                              | HomeScreen                                                                               |
| `AboutPopup`            | App info, author link, donation link, feedback launcher               | HomeScreen                                                                               |
| `AppFooter`             | Attribution footer with library/feedback links                        | HomeScreen                                                                               |
| `FeedbackPopup`         | User feedback submission                                              | HomeScreen, EndGameScreen, AboutPopup, AppFooter                                         |
| `FlashingText`          | Flash overlay: centered+rotated (per-player streaks) or `edges`-broadcast (global, e.g. final round) | TimelineGameScreen                                          |
| `ProblemReportPopup`    | Track problem report with metadata                                    | TrackInfo                                                                                |

## Responsive Design

- **Mobile-first** with `md:` breakpoint for desktop
- Scoring UI: bottom-center on mobile, bottom-right on desktop
- Stats graph: max 600px on desktop, full width on mobile, reduced padding (p-2 vs p-5)
- Popups: responsive padding option (`p-4` mobile, `p-8` desktop)
- Bingo grid: fixed positioning with centered flex layout, no scrolling
