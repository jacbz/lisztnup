/**
 * UUID utilities for efficient short UUID to full UUID mapping.
 * Short UUIDs (first 8 chars) are used in tracklist configs to minimize
 * storage size when sharing tracklists via URL.
 */

const SHORT_UUID_LENGTH = 8;

/**
 * Extracts the first 8 characters of a UUID to create a short UUID.
 */
export function getShortUuid(uuid: string): string {
	return uuid.slice(0, SHORT_UUID_LENGTH);
}

/**
 * Builds a Map from short UUIDs to full UUIDs for O(1) lookups.
 * Should be called once when data is first loaded.
 */
export function buildShortUuidMap(uuids: string[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const uuid of uuids) {
		map.set(getShortUuid(uuid), uuid);
	}
	return map;
}

/**
 * Resolves a single short UUID to its full UUID using the prebuilt map.
 * Returns undefined if not found.
 */
export function resolveShortUuid(
	shortUuid: string,
	map: Map<string, string>
): string | undefined {
	return map.get(shortUuid);
}

/**
 * Resolves an array of short UUIDs to full UUIDs, filtering out any that can't be resolved.
 */
export function resolveShortUuids(
	shortUuids: string[],
	map: Map<string, string>
): string[] {
	const result: string[] = [];
	for (const short of shortUuids) {
		const full = map.get(short);
		if (full) {
			result.push(full);
		}
	}
	return result;
}
