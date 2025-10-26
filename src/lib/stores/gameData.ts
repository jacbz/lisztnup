import { writable } from 'svelte/store';
import type { LisztnupData } from '$lib/types';

export const gameData = writable<LisztnupData | null>(null);
export const isDataLoaded = writable<boolean>(false);
// 0-100 percent progress of loading the main game data blob
export const dataLoadProgress = writable<number>(0);

export async function loadGameData(): Promise<void> {
	try {
		// reset flags/progress before starting a new load
		isDataLoaded.set(false);
		dataLoadProgress.set(0);

		const response = await fetch('/lisztnup.json');
		if (!response.ok) {
			throw new Error(`Failed to load game data: ${response.statusText}`);
		}

		// If stream + content-length available, report real byte progress
		const contentLengthHeader = response.headers.get('Content-Length');
		const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;

		if (response.body) {
			const reader = response.body.getReader();
			const chunks: Uint8Array[] = [];
			let received = 0;

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) {
					chunks.push(value);
					received += value.length;

					if (!Number.isNaN(total) && total > 0) {
						const pct = Math.max(1, Math.min(99, Math.round((received / total) * 100)));
						dataLoadProgress.set(pct);
					} else {
						// Unknown total size: nudge progress up to 90% to show activity
						dataLoadProgress.update((p) => (p < 90 ? p + 1 : p));
					}
				}
			}

			// Concatenate and parse
			let merged: Uint8Array;
			if (chunks.length === 1) {
				merged = chunks[0];
			} else {
				merged = new Uint8Array(received);
				let offset = 0;
				for (const c of chunks) {
					merged.set(c, offset);
					offset += c.length;
				}
			}

			const text = new TextDecoder('utf-8').decode(merged);
			const data: LisztnupData = JSON.parse(text);
			gameData.set(data);
			dataLoadProgress.set(100);
			isDataLoaded.set(true);
		} else {
			// Fallback: no streaming available
			const data: LisztnupData = await response.json();
			gameData.set(data);
			dataLoadProgress.set(100);
			isDataLoaded.set(true);
		}
	} catch (error) {
		console.error('Error loading game data:', error);
		// Leave progress as-is so UI can show where it failed
		throw error;
	}
}
