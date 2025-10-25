import { writable } from 'svelte/store';
import type { LisztnupData } from '$lib/types';

export const gameData = writable<LisztnupData | null>(null);
export const isDataLoaded = writable<boolean>(false);

export async function loadGameData(): Promise<void> {
	try {
		const response = await fetch('/lisztnup.json');
		if (!response.ok) {
			throw new Error(`Failed to load game data: ${response.statusText}`);
		}
		const data: LisztnupData = await response.json();
		gameData.set(data);
		isDataLoaded.set(true);
	} catch (error) {
		console.error('Error loading game data:', error);
		throw error;
	}
}
