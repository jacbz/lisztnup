import { getContext } from 'svelte';
import type { Track } from '$lib/models';
import type { GuessCategory } from '$lib/types';

export const GAME_SCREEN_CONTEXT = Symbol('game-screen');

/**
 * Options for `revealTrack()` that allow game modes to customise the
 * post-reveal flow (scoring screen vs. track-info popup, categories, cleanup).
 */
export interface RevealOptions {
	/** Whether to show the scoring screen. Defaults to GameScreen's `enableScoring` prop. */
	showScoring?: boolean;
	/** Categories for the ScoringScreen (Buzzer passes its revealed categories). */
	scoringCategories?: GuessCategory[];
	/** Called before the standard next-round flow (mode-specific state cleanup). */
	beforeNextRound?: () => void;
}

/**
 * Shared context provided by GameScreen to all game-mode components.
 *
 * GameScreen owns audio, track sampling/preloading, and session management.
 * Mode-specific components (Timeline, Classic, Bingo, Buzzer) consume this
 * context to control playback, advance rounds, and read shared state.
 */
export interface GameScreenContext {
	playTrack: () => Promise<void>;
	stopTrack: () => void;
	replayTrack: () => Promise<void>;
	revealTrack: (options?: RevealOptions) => void;
	nextRound: () => Promise<void>;
	handlePlaybackEnd: () => void;
	sampleRawTrack: () => Track | null;
	prepareNewGame: () => void;
	/** Manually trigger a preload retry after a network failure. */
	retryPreload: () => void;
	/** Drop future preloads and refill with current audio settings. */
	invalidateBufferedTracks: () => void;
	onHome: () => void;
	/** The track at the current round index, or null if not yet loaded. */
	readonly currentTrack: Track | null;
	/** Current playback progress (0–1), updated reactively by GameScreen. */
	readonly audioProgressValue: number;
	/** Duration in seconds for the active loaded track. */
	readonly currentTrackDuration: number;
	readonly activeCategories: readonly GuessCategory[];
	readonly disabledCategories: readonly GuessCategory[];
	readonly hasValidYears: boolean;
	readonly tracksExhausted: boolean;
	readonly enableScoring: boolean;
	/** True while initial load or a depleted buffer blocks gameplay. */
	readonly isPreloading: boolean;
	/** True when the last preload attempt failed due to a network error (retries exhausted). */
	readonly hasPreloadError: boolean;
	/** Register a stats click handler from a child game mode (e.g. Timeline). Pass null to unregister. */
	registerStatsHandler: (handler: (() => void) | null) => void;
}

/**
 * Typed helper to retrieve the GameScreen context.
 * Must be called synchronously during component initialisation.
 */
export function getGameContext(): GameScreenContext {
	return getContext<GameScreenContext>(GAME_SCREEN_CONTEXT);
}
