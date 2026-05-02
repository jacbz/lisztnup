import { DEFAULT_TRACKLISTS } from '$lib/data/defaultTracklists';
import type { DefaultTracklist } from '$lib/types';

/** Eligible tracklists for the daily challenge (excludes beginner). */
const DAILY_CANDIDATES: DefaultTracklist[] = DEFAULT_TRACKLISTS.filter(
	(t) => t.id !== 'beginner'
);

/** Mulberry32 seeded PRNG — returns a function that yields [0, 1) on each call. */
function seededRandom(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher-Yates shuffle using a seeded PRNG — deterministic for a given seed. */
function seededShuffle<T>(array: readonly T[], seed: number): T[] {
	const rng = seededRandom(seed);
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

/** Returns today's date as `YYYY-MM-DD` in the user's local timezone. */
export function getTodayDateString(): string {
	const d = new Date();
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Returns the daily challenge tracklist for today.
 *
 * Uses a seeded shuffle per calendar month so that:
 * - Everyone gets the same tracklist on the same day.
 * - No tracklist repeats within a single month (39 candidates ≥ 31 days).
 */
export function getDailyTracklist(): DefaultTracklist {
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth(); // 0-indexed
	const day = now.getDate(); // 1-indexed

	const seed = year * 13 + month;
	const shuffled = seededShuffle(DAILY_CANDIDATES, seed);
	return shuffled[(day - 1) % shuffled.length];
}
