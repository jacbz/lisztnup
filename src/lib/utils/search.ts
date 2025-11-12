// Fuse.js based flexible fuzzy search utility

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';

export interface SearchItem {
	composer: string;
	work: string;
	year?: string;
}

const defaultFuseOptions: IFuseOptions<SearchItem> = {
	// 0.35 allows for some misspellings
	// but prevents wildly different words from matching. 0.0 is perfect match.
	threshold: 0.35,
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

/**
 * Normalizes a string for searching.
 * - Removes accents (diacritics).
 * - Converts to lowercase.
 * - Removes all characters that are not letters, numbers, or spaces.
 * - Collapses multiple spaces into a single space.
 */
export const normalizeString = (s?: string): string =>
	s
		? s
				.normalize('NFD') // Separate accents from letters
				.replace(/\p{Diacritic}/gu, '') // Remove the accents
				.toLowerCase() // Convert to lowercase
				.replace(/[^\p{L}\p{N}\s]/gu, '') // Remove all non-letter, non-number, non-space characters
				.replace(/\s+/g, ' ') // Collapse multiple spaces into one
				.trim() // Remove leading/trailing spaces
		: '';

/**
 * Creates a Fuse instance with a pre-processed and combined search field.
 * This is the core of making multi-field search work correctly.
 */
export function createFuse<T extends SearchItem>(items: T[], options?: IFuseOptions<T>) {
	// Create a derived list where each item has a new `searchText` property.
	// This property combines the normalized content of composer, work, and year,
	// allowing Fuse to find terms across these original fields.
	const itemsWithSearchText = items.map((item) => ({
		...item,
		searchText: `${normalizeString(item.composer)} ${normalizeString(item.work)} ${normalizeString(item.year)}`
	}));

	// Create the final Fuse options, overriding the 'keys' to search our new field.
	const fuseOptions: IFuseOptions<T> = {
		...defaultFuseOptions,
		...options, // Allow user-provided options to override defaults
		keys: ['searchText'] // IMPORTANT: We now search ONLY on the combined field
	};

	// Initialize Fuse with the enhanced items and new options.
	return new Fuse(itemsWithSearchText as T[], fuseOptions as IFuseOptions<T>);
}

/**
 * Creates the search query pattern for Fuse.js.
 * It ensures that every word in the user's query must be found.
 * Example: "chopin 9" -> "'chopin '9"
 */
function createSearchPattern(query: string): string {
	const normalizedQuery = normalizeString(query);
	const searchTerms = normalizedQuery.split(' ').filter(Boolean);

	// Prefix each term with a single quote to enforce "include" matching.
	// This tells Fuse that all terms must be present in the result.
	return searchTerms.map((term) => `'${term}`).join(' ');
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
	const searchPattern = createSearchPattern(query);
	const results = fuse.search(searchPattern);

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
	if (!query || !query.trim()) {
		return items.map((i) => ({ item: i, score: 0, matches: [] }));
	}

	const fuse = createFuse(items, options);
	const searchPattern = createSearchPattern(query);
	const results = fuse.search(searchPattern);

	return results.map((r) => ({
		item: r.item as T,
		score: r.score ?? 0,
		matches: r.matches ?? []
	}));
}
