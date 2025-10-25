import { writable } from 'svelte/store';
import type { GameState, RoundState, Track } from '$lib/types';

export const gameState = writable<GameState>('loading');

export const tracklist = writable<Track[]>([]);

export const currentRound = writable<RoundState>({
	currentTrackIndex: 0,
	category: null,
	isSpinning: false,
	isPlaying: false,
	playbackEnded: false,
	isRevealed: false
});

export function resetRound() {
	currentRound.update((state) => ({
		...state,
		category: null,
		isSpinning: false,
		isPlaying: false,
		playbackEnded: false,
		isRevealed: false
	}));
}

export function nextRound() {
	currentRound.update((state) => ({
		currentTrackIndex: state.currentTrackIndex + 1,
		category: null,
		isSpinning: false,
		isPlaying: false,
		playbackEnded: false,
		isRevealed: false
	}));
}
