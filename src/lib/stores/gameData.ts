import { get, writable } from 'svelte/store';
import { GameCatalog, type RawLisztnupData } from '$lib/models';

export const gameData = writable<GameCatalog | null>(null);
export const isDataLoaded = writable<boolean>(false);
export const isDataLoading = writable<boolean>(false);
// 0-100 percent progress of loading the main game data blob
export const dataLoadProgress = writable<number>(0);

let loadPromise: Promise<void> | null = null;

/**
 * Parses the raw data and updates the stores.
 * @param text The raw data to parse.
 */
function parseData(text: string) {
	const rawData: RawLisztnupData = JSON.parse(text);
	gameData.set(GameCatalog.fromRaw(rawData));
	dataLoadProgress.set(100);
	isDataLoaded.set(true);
}

/**
 * Handles a streaming response, updating progress as data is received.
 * @param response The response to handle.
 */
async function handleStreamingResponse(response: Response) {
	const contentLengthHeader = response.headers.get('Content-Length');
	const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;
	const reader = response.body!.getReader();
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
				dataLoadProgress.update((p) => (p < 90 ? p + 1 : p));
			}
		}
	}

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
	parseData(text);
}

async function loadGameDataInternal(): Promise<void> {
	try {
		isDataLoaded.set(false);
		isDataLoading.set(true);
		dataLoadProgress.set(0);

		const response = await fetch('/lisztnup.json');
		if (!response.ok) {
			throw new Error(`Failed to load game data: ${response.statusText}`);
		}

		if (response.body) {
			await handleStreamingResponse(response);
		} else {
			const data: RawLisztnupData = await response.json();
			gameData.set(GameCatalog.fromRaw(data));
			dataLoadProgress.set(100);
			isDataLoaded.set(true);
		}
	} catch (error) {
		console.error('Error loading game data:', error);
		throw error;
	} finally {
		isDataLoading.set(false);
		loadPromise = null;
	}
}

export function loadGameData(): Promise<void> {
	if (get(isDataLoaded) && get(gameData)) {
		return Promise.resolve();
	}

	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = loadGameDataInternal();
	return loadPromise;
}
