# Design Principles & Coding Conventions

## Core Principles

- **Serverless**: 100% client-side game logic. Server is only used for analytics and feedback (Cloudflare Pages + D1).
- **Type-Safe**: Strict TypeScript everywhere. No `any`, no untyped context.
- **Dark Mode / Neon Aesthetic**: Galaxy background, transparent UI backgrounds, cyan accent color (`rgb(6, 182, 212)`).
- **Touch-Optimized**: Designed for tablet multiplayer. All interactions must work with touch — `preventDefault()` on touch events to prevent scrolling, pointer events for drag interactions.
- **Smooth Animations**: Physics-based wheel, fly/slide transitions, staggered fade-ins, canvas-based visualizations. Frame-rate normalize all physics to 60fps.
- **Full i18n**: Every user-visible string goes through `svelte-i18n`. 10 languages supported.

## Svelte 5 Patterns

- **Runes**: Use `$state`, `$derived`, `$effect` — not legacy `$:` reactive declarations.
- **`$effect` discipline**: Use `untrack()` to read values without creating reactive dependencies. Always clean up side effects (return cleanup function or use guards).
- **`SvelteMap`**: Use for reactive collections in classes.
- **Context API**: Parent components expose typed context via `setContext` + `satisfies` for type safety. Children access via `getContext` helper (e.g., `getGameContext()`).
- **Reactive classes over composables**: Complex game logic lives in Svelte 5 reactive classes (e.g., `TimelineGame`) rather than `use*` composable functions. Classes own `$state`/`$derived` fields and expose methods.
- **Snippets**: Use `{#snippet}` for reusable markup within components (e.g., pagination controls). Prefer snippets over extracting tiny sub-components.

## Styling Rules

- **Tailwind-first**: Use Tailwind utility classes. Custom CSS only for things Tailwind can't express (`@keyframes`, scrollbar pseudo-elements, canvas).
- **Custom fonts**: Streamster (logo/branding), Rajdhani (UI body, 5 weights). CJK fonts loaded on-demand via `fontLoader.ts`.
- **Scrollbars**: Cyan theme on dark background. Webkit pseudo-elements + Firefox `scrollbar-color` fallback. Defined in `app.css`.
- **Color palette**: Cyan primary, dark purple/slate backgrounds, 10-color player palette. Category colors defined in `categories.ts`.
- **Animations**: Custom `@keyframes` in `app.css` (`trophy-glow`, `shimmer`, `streak-flash`). Component transitions use Svelte `fly`, `slide`, `fade` with consistent durations (200-300ms).
- **Responsive**: Mobile-first. Use `md:` breakpoint for desktop-specific layouts. Fixed positioning adapts per breakpoint (e.g., bottom-center on mobile, bottom-right on desktop).
- **Popup styling**: Use the `Popup` component with its preset system (width, padding, shadow, border, overflow). Use separate `in`/`out` transitions to prevent Safari flickering.

## TypeScript Conventions

- **Strict mode**: `noImplicitAny`, `strictNullChecks` enabled.
- **Types directory**: Shared types in `src/lib/types/` with barrel re-export from `index.ts`.
- **Typed context**: Context interfaces defined in dedicated files (e.g., `context.ts`), used with `satisfies` at creation site.
- **Custom error classes**: Use subclasses (e.g., `NetworkError extends Error`) to enable typed error handling with `instanceof`.
- **Export conventions**: Re-export from `index.ts` barrel files in each directory. Services export both the class/singleton and relevant types/utilities.

## i18n Rules

- **No `default` values in code**: All strings must be defined in locale JSON files. Never use `$_('key', { default: 'fallback' })`.
- **All 10 locales**: en, de, es, fr, it, pt, ja, ko, zh-CN, zh-TW. Every new key must be added to all locale files.
- **Reuse keys**: Check existing locale files before creating new keys. Reuse `common.*`, `game.*`, etc.
- **Interpolation**: Use `{variable}` syntax in locale strings for dynamic values.
- **Tone**: Informal, friendly. Translations should feel natural in each language, not robotic.
- **CJK fonts**: When `ja`, `zh-CN`, or `zh-TW` locales are selected, `fontLoader.ts` dynamically loads appropriate Google Fonts (Noto Sans JP/SC/TC).

## Data Conventions

- **Short UUIDs**: Use first 8 chars of MusicBrainz GIDs for storage/sharing efficiency. Resolve via `uuid.ts` utilities.
- **localStorage**: All user settings auto-persisted immediately via `SettingsService`. Never batch writes.
- **Compression**: Use `compression.ts` (browser `CompressionStream` API) for URL-shared tracklists.
