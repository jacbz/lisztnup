import { writable } from 'svelte/store';
import type { GameState, RoundState, Track } from '$lib/types';

export const gameState = writable<GameState>('loading');

export const tracklist = writable<Track[]>([]);

export const currentRound = writable<RoundState>({
	currentTrackIndex: 0,
	category: null,
	isRevealed: false,
	isPlaying: false
});

export function resetRound() {
	currentRound.update((state) => ({
		...state,
		category: null,
		isRevealed: false,
		isPlaying: false
	}));
}

export function nextRound() {
	currentRound.update((state) => ({
		currentTrackIndex: state.currentTrackIndex + 1,
		category: null,
		isRevealed: false,
		isPlaying: false
	}));
}
