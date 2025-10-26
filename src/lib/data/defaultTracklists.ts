import { DEFAULT_CATEGORY_WEIGHTS, type Tracklist } from '$lib/types';

/**
 * Default tracklist presets based on difficulty levels
 * Difficulty is determined by minWorkScore (higher score = easier, more popular works)
 */

export const DEFAULT_TRACKLISTS: Tracklist[] = [
	{
		name: 'tracklists.easy.name',
		description: 'tracklists.easy.description',
		isDefault: true,
		config: {
			categoryWeights: DEFAULT_CATEGORY_WEIGHTS, // All categories equally weighted
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 5.3,
			maxTracksFromSingleWork: 1
		}
	},
	{
		name: 'tracklists.medium.name',
		description: 'tracklists.medium.description',
		isDefault: true,
		config: {
			categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 4.5,
			maxTracksFromSingleWork: 2
		}
	},
	{
		name: 'tracklists.hard.name',
		description: 'tracklists.hard.description',
		isDefault: true,
		config: {
			categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 3.5,
			maxTracksFromSingleWork: 3
		}
	},
	{
		name: 'tracklists.extreme.name',
		description: 'tracklists.extreme.description',
		isDefault: true,
		config: {
			categoryWeights: DEFAULT_CATEGORY_WEIGHTS,
			composerFilter: null,
			yearFilter: null,
			minWorkScore: null,
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.piano.name',
		description: 'tracklists.piano.description',
		isDefault: true,
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 100,
				concerto: 0,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: [1800, 2000],
			minWorkScore: 3,
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.concerto.name',
		description: 'tracklists.concerto.description',
		isDefault: true,
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 100,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 3,
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.chamber.name',
		description: 'tracklists.chamber.description',
		isDefault: true,
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 100,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 3,
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.ballet.name',
		description: 'tracklists.ballet.description',
		isDefault: true,
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 100,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 2.3,
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.opera.name',
		description: 'tracklists.opera.description',
		isDefault: true,
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 100,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			minWorkScore: 3.5,
			maxTracksFromSingleWork: 3
		}
	}
];

/**
 * Finds a tracklist by comparing properties (since we removed IDs)
 * Uses deep comparison of config to match tracklists
 */
export function findTracklist(
	targetTracklist: Tracklist,
	customTracklists: Tracklist[] = []
): Tracklist | null {
	// Check custom tracklists first (exact name match)
	const customMatch = customTracklists.find((t) => t.name === targetTracklist.name && !t.isDefault);
	if (customMatch) return customMatch;

	// Check default tracklists (by name key)
	const defaultMatch = DEFAULT_TRACKLISTS.find((t) => t.name === targetTracklist.name);
	if (defaultMatch) return defaultMatch;

	return null;
}

/**
 * Creates a clone of a tracklist with a new name
 * @param tracklist - The tracklist to clone
 * @param customTracklists - List of existing custom tracklists to avoid name collisions
 * @param translatedName - The translated name (for default tracklists)
 * @param translatedDescription - The translated description (for default tracklists)
 */
export function cloneTracklist(
	tracklist: Tracklist,
	customTracklists: Tracklist[],
	translatedName?: string,
	translatedDescription?: string
): Tracklist {
	// Use translated name if provided (for default tracklists), otherwise use original name
	const baseName = translatedName || tracklist.name;
	const baseDescription = translatedDescription || tracklist.description;

	// Generate unique name with " (Copy)" suffix
	let name = `${baseName} (Copy)`;
	let counter = 1;

	while (customTracklists.some((t) => t.name === name)) {
		name = `${baseName} (Copy ${counter})`;
		counter++;
	}

	// Create clone with new name
	return {
		...tracklist,
		name,
		description: baseDescription,
		isDefault: false,
		config: JSON.parse(JSON.stringify(tracklist.config)) // Deep clone config
	};
}
