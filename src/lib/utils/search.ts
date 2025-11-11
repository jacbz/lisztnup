// Fuse.js based flexible fuzzy search utility
// Uses fuse.js (added as a dependency) to provide tolerant matching across
// composer, work, and year fields. The API is generic and preserves item types.

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';

export interface SearchItem {
	composer: string;
	work: string;
	year?: string;
}

const defaultFuseOptions: IFuseOptions<SearchItem> = {
	// Keys to search, with weights to prioritize title (work) over composer
	keys: [
		{ name: 'work', weight: 0.5 },
		{ name: 'composer', weight: 0.8 },
		{ name: 'year', weight: 0.1 }
	],
	// A more permissive threshold to match plurals/misspellings
	threshold: 0.5,
	// Don't bias by location of match in the string
	ignoreLocation: true,
	// Allow matching across longer distances in the string
	distance: 100,
	// Find all matching substrings (helps with token matches)
	findAllMatches: true,
	// Minimum characters required to perform fuzzy matching
	minMatchCharLength: 2,
	// Return score and match details so callers can inspect results
	includeScore: true,
	includeMatches: true
};

export function createFuse<T extends SearchItem>(items: T[], options?: IFuseOptions<T>) {
	return new Fuse(
		items as unknown as T[],
		(options ?? (defaultFuseOptions as unknown)) as IFuseOptions<T>
	);
}

/**
 * Filter an array of items using a flexible fuzzy search powered by fuse.js.
 * Returns the original item type array (preserves generics).
 */
export function filterWorks<T extends SearchItem>(
	items: T[],
	query: string,
	options?: IFuseOptions<T>
): T[] {
	if (!query || !query.trim()) return items;

	const fuse = createFuse(items, options);
	// Use fuse.search to get scored results; map back to original items
	const results = fuse.search(query);
	return results.map((r) => r.item as T);
}

/**
 * Convenience search that returns items with score included so callers can
 * access match scores if they want to rank/annotate results.
 */
export function searchWithScore<T extends SearchItem>(
	items: T[],
	query: string,
	options?: IFuseOptions<T>
) {
	if (!query || !query.trim()) return items.map((i) => ({ item: i, score: 0 }));
	const fuse = createFuse(items, options);
	return fuse.search(query).map((r) => ({ item: r.item as T, score: r.score ?? 0 }));
}
