import { getContext } from 'svelte';
import type { Readable } from 'svelte/store';
import type { Track, GuessCategory } from '$lib/types';

export const GAME_SCREEN_CONTEXT = Symbol('game-screen');

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
	revealTrack: () => void;
	nextRound: () => Promise<void>;
	handlePlaybackEnd: () => void;
	sampleRawTrack: () => Track | null;
	prepareNewGame: () => void;
	audioProgress: Readable<number>;
	onHome: () => void;
	readonly activeCategories: readonly GuessCategory[];
	readonly disabledCategories: readonly GuessCategory[];
	readonly hasValidYears: boolean;
	readonly tracksExhausted: boolean;
	readonly enableScoring: boolean;
}

/**
 * Typed helper to retrieve the GameScreen context.
 * Must be called synchronously during component initialisation.
 */
export function getGameContext(): GameScreenContext {
	return getContext<GameScreenContext>(GAME_SCREEN_CONTEXT);
}
