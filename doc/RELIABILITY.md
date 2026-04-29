# Reliability: Error Handling, Resilience & Edge Cases

## Network Resilience

### NetworkError Classification

`DeezerPlayer.ts` exports `NetworkError extends Error` to distinguish transient failures from permanent ones:

- **Transient** (retry): fetch timeouts, `AbortError`, HTTP errors, audio preload failures → wrapped in `NetworkError`
- **Permanent** (skip): track not found, invalid Deezer ID → standard `Error`

### Fetch & Preload Timeouts

All network operations use 15-second `AbortController`-based timeouts:
- `fetch()` for audio data
- HTML Audio `canplaythrough` preloads

This prevents indefinite hangs on stalled connections.

### Offline Detection

`networkStatus` store tracks connectivity via `navigator.onLine` + window `online`/`offline` events:

- `isOnline` / `isOffline` — reactive stores for UI binding
- `waitForOnline()` — promise that resolves immediately if online, or when connectivity resumes
- `lastReconnectedAt` — timestamp of last offline→online transition, enables `$effect`-based auto-retry

`DeezerPlayer._load()` checks `navigator.onLine` before loading and awaits `waitForOnline()` if offline.

### Exponential Backoff Retry

`GameScreen.sampleAndPreloadTrack()` on `NetworkError`:
1. Retry same Deezer ID up to 3 times
2. Backoff: 1s → 2s → 4s
3. If `navigator.onLine` is false during retry, await `waitForOnline()` first

Context exposes `isPreloading`, `hasPreloadError`, and `retryPreload()` for child components.

### Network Status Banner

`NetworkStatusBanner.svelte` shows contextual in-game banners (z-50, below header):
- **Red** (`WifiOff`): "You are offline"
- **Amber** (spinning `Loader`): "Failed to load track. Retrying…"
- **Green** (auto-hide 2s): "Back online!"

### Auto-Retry on Reconnect

Timeline's `$effect` watches `lastReconnectedAt` + `hasPreloadError`. On reconnection after a failure, automatically calls `retryPreload()`.

### Error Messages

All network error strings use i18n keys (`network.*`), translated in all 10 locales.

All `nextRound()` calls wrapped in try/catch with i18n toast messages.

## Audio Resilience

### Multi-ID Fallback

Each track part has up to 5 Deezer IDs. On load failure:
1. Try another random ID from the same part
2. If all IDs fail, discard track and sample a new one

Failed tracks removed by **identity-based filtering** (not index-based) to prevent corruption from concurrent operations.

### Automatic Track Replacement

If a track can't load after exhausting all Deezer IDs, `sampleAndPreloadTrack()` samples a fresh track automatically. Gameplay continues uninterrupted.

### Safari / WebKit Handling

- **Dual playback modes**: Web Audio API (Chromium default) vs HTML Audio Element (WebKit default). User-configurable via `enableAudioNormalization` setting.
- **Audio context initialization**: `start.mp3` played on user gesture (Start Game button) to satisfy Safari autoplay restrictions.
- **LUFS normalization**: Both modes analyze loudness (ITU-R BS.1770-4, target -23 LUFS). Web Audio uses `GainNode`; HTML Audio translates gain to volume (gain 2 → volume 1.0).

### Concurrency Guard

`sampleAndPreloadTrack()` uses a `preloadInProgress` flag to prevent overlapping calls from fighting over the singleton `DeezerPlayer` (which calls `destroy()` on each `load()`). Reset on Play Again / `prepareNewGame`.

### Year Filtering

Timeline and Classic apply `requireWorkYear` filtering at game start, removing works without explicit `begin_year` and `end_year`. Guarantees year-based UI and categories always have valid data.

## State Integrity

### Popup Close Guard

`Popup.svelte` uses a `closing` flag to prevent `onClose` from firing more than once per close cycle. Mobile browsers (Android Chrome, iOS Safari) can trigger double-taps during the ~200ms out-transition. Flag resets when `visible` becomes `true` via `$effect`.

### Timeline Re-Entrancy Guards

- **`handleCloseRevealPopup`**: `isClosingRevealPopup` flag prevents double execution. All reveal state (`revealPurpose`, `revealReachedWin`, `revealIsCorrect`, `revealEntryId`) captured upfront before any async delays, so callbacks operate on consistent snapshots.
- **`initGame`**: `#isInitializing` flag prevents overlapping calls (e.g., rapid Play Again taps) from producing interleaved dealing animations.
- **`finalizeTurn` sync**: After rotating to the next player, directly syncs `centerStack[0].track` as a safety net for the main `$effect`-based sync, which can be skipped due to identity guard timing on mobile.
- **`handlePlay` resilience**: Wraps `playTrack()` in try/catch, resets `turnPhase` and `hasPlaybackStarted` on error so the player can retry.

## Resource Cleanup

| Component | What's cleaned up |
|---|---|
| Classic/Buzzer/Bingo/Timeline | `audioProgress.subscribe()` unsubscribe in `onDestroy` |
| `TimelineGame.destroy()` | `pointermove`/`pointerup`/`pointercancel` window listeners |
| `BuzzerGameScreen` | `AudioContext` close, `buzzerAudio` pause+null, `keydown` listener, `audioProgress` unsub |
| `GameScreen` | `beforeunload` listener removal, `deezerPlayer.destroy()` (via `onMount` return) |
| `ReplayPlayer` | `destroy()` method stops playback, nulls `HTMLAudioElement`. Generation-based cancellation discards stale async ops. |
| `Visualizer` | `$effect` cleanup cancels `requestAnimationFrame` |
