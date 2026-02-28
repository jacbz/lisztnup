// Fuse.js based flexible fuzzy search utility

import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';

export interface SearchItem {
	composer: string;
	work: string;
	year?: string;
	workGid: string;
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
	includeMatches: true,
	useExtendedSearch: true
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
 * Conditionally attaches workGid to the search field if the query demands it.
 */
export function createFuse<T extends SearchItem>(
	items: T[],
	options?: IFuseOptions<T>,
	query: string = ''
) {
	const normalizedQuery = normalizeString(query);
	const searchTerms = normalizedQuery.split(' ').filter(Boolean);

	// Find any tokens in the query that could be a GID prefix (>= 8 chars of valid hex)
	const gidPrefixes = searchTerms.filter((t) => t.length >= 8 && /^[a-f0-9]+$/.test(t));

	const itemsWithSearchText = items.map((item) => {
		let searchText = `${normalizeString(item.composer)} ${normalizeString(item.work)} ${normalizeString(item.year)}`;

		// If the user's query contains a valid GID prefix, and this item's GID starts with it,
		// append the GID to the search text. This isolates the GID from shorter fuzzy matches (like "123").
		if (gidPrefixes.length > 0 && item.workGid) {
			const normalizedGid = normalizeString(item.workGid); // Automatically strips hyphens

			if (gidPrefixes.some((prefix) => normalizedGid.startsWith(prefix))) {
				searchText += ` ${normalizedGid}`;
			}
		}

		return {
			...item,
			searchText
		};
	});

	const fuseOptions: IFuseOptions<T> = {
		...defaultFuseOptions,
		...options,
		keys: ['searchText']
	};

	return new Fuse(itemsWithSearchText as T[], fuseOptions as IFuseOptions<T>);
}

/**
 * Creates the search query pattern for Fuse.js.
 * It ensures that every word in the user's query must be found.
 */
function createSearchPattern(query: string): string {
	const normalizedQuery = normalizeString(query);
	const searchTerms = normalizedQuery.split(' ').filter(Boolean);

	// Prefix each term with a single quote to enforce "include" matching.
	return searchTerms.map((term) => `'${term}`).join(' ');
}

/**
 * Filter an array of items using a flexible fuzzy search powered by fuse.js.
 */
export function filterWorks<T extends SearchItem>(
	items: T[],
	query: string,
	options?: IFuseOptions<T>
): T[] {
	if (!query || !query.trim()) return items;

	const fuse = createFuse(items, options, query);
	const searchPattern = createSearchPattern(query);
	const results = fuse.search(searchPattern);

	return results.map((r) => r.item as T);
}

/**
 * Convenience search that returns items with score included
 */
export function searchWithScore<T extends SearchItem>(
	items: T[],
	query: string,
	options?: IFuseOptions<T>
) {
	if (!query || !query.trim()) {
		return items.map((i) => ({ item: i, score: 0, matches: [] }));
	}

	const fuse = createFuse(items, options, query);
	const searchPattern = createSearchPattern(query);
	const results = fuse.search(searchPattern);

	return results.map((r) => ({
		item: r.item as T,
		score: r.score ?? 0,
		matches: r.matches ?? []
	}));
}
