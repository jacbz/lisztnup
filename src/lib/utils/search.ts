// MiniSearch based flexible fuzzy search utility
import MiniSearch, { type SearchOptions } from 'minisearch';

export interface SearchItem {
	composer: string;
	work: string;
	year?: string;
	workGid: string;
}

interface CacheEntry<T extends SearchItem> {
	ms: MiniSearch<T>;
	itemMap: Map<string, T>;
}

// Cache prevents rebuilding the index on every render.
const indexCache = new WeakMap<object, unknown>();

/**
 * Creates or retrieves a cached MiniSearch instance optimized for classical music.
 */
function getMiniSearch<T extends SearchItem>(items: T[]): CacheEntry<T> {
	if (indexCache.has(items)) {
		return indexCache.get(items) as CacheEntry<T>;
	}

	const ms = new MiniSearch<T>({
		fields: ['composer', 'work', 'year', 'workGid'],
		idField: 'workGid', // Assumes workGid is unique per item

		// Removes diacritics and punctuation from terms without altering document IDs.
		processTerm: (term) => {
			const normalized = term
				.normalize('NFD')
				.replace(/\p{Diacritic}/gu, '')
				.toLowerCase()
				.replace(/[^\p{L}\p{N}]/gu, ''); // Keep only letters and numbers

			return normalized || null; // Return null to discard empty punctuation tokens
		},
		searchOptions: {
			combineWith: 'AND', // "chopin 9" -> both terms MUST match
			prefix: (term) => {
				// Pure numbers must match exactly (e.g. '194' won't prefix-match '1947')
				if (/^\d+$/.test(term)) return false;
				return true;
			},
			fuzzy: (term) => {
				// No fuzziness for numbers (prevents "Op 5" from matching "Op 6")
				if (/^\d+$/.test(term)) return false;
				// No fuzziness for very short words
				if (term.length <= 3) return false;
				// 20% Levenshtein fuzziness for longer strings (tolerates typos in composer names)
				return 0.2;
			},
			// Rank exact hits on Composer and Work higher than Year hits
			boost: { composer: 2, work: 1.5, year: 1 }
		}
	});

	// Build an O(1) lookup map to retrieve original objects
	const itemMap = new Map<string, T>();
	for (const item of items) {
		itemMap.set(item.workGid, item);
	}

	ms.addAll(items);

	const cacheEntry: CacheEntry<T> = { ms, itemMap };
	indexCache.set(items, cacheEntry);

	return cacheEntry;
}

/**
 * Parses the query to determine which fields MiniSearch should target.
 */
function getSearchConfiguration(query: string, options?: SearchOptions) {
	// Detect if any term looks like a GID (>= 8 valid hex chars, with optional hyphens)
	const rawTerms = query.split(/\s+/).filter(Boolean);
	const hasGidPrefix = rawTerms.some((t) => t.length >= 8 && /^[a-fA-F0-9-]+$/.test(t));

	// Always search these core fields
	const fields = ['composer', 'work', 'year'];

	// Only include workGid in the target fields if the query explicitly demands it
	if (hasGidPrefix) {
		fields.push('workGid');
	}

	return {
		fields,
		...options
	};
}

/**
 * Filter an array of items using MiniSearch.
 * Returns the original item type array (preserves generics).
 */
export function filterWorks<T extends SearchItem>(
	items: T[],
	query: string,
	options?: SearchOptions
): T[] {
	if (!query || !query.trim()) return items;

	const { ms, itemMap } = getMiniSearch(items);
	const searchConfig = getSearchConfiguration(query, options);

	const results = ms.search(query, searchConfig);

	// Map results back to original objects, safely filtering out undefined
	return results.map((r) => itemMap.get(r.id) as T).filter(Boolean);
}

/**
 * Convenience search that returns items with score included so callers can
 * access match scores if they want to rank/annotate results.
 */
export function searchWithScore<T extends SearchItem>(
	items: T[],
	query: string,
	options?: SearchOptions
) {
	if (!query || !query.trim()) {
		return items.map((i) => ({ item: i, score: 0, matches: {} }));
	}

	const { ms, itemMap } = getMiniSearch(items);
	const searchConfig = getSearchConfiguration(query, options);

	const results = ms.search(query, searchConfig);

	return results
		.map((r) => ({
			item: itemMap.get(r.id) as T,
			score: r.score,
			// MiniSearch 'match' object details which terms hit which fields
			matches: r.match
		}))
		.filter((r) => r.item);
}
