import { MAX_WORK_SCORE, type Tracklist } from '$lib/types';

/**
 * Default tracklist presets organized by categories
 */

export const DEFAULT_TRACKLISTS: Tracklist[] = [
	// Difficulty-based tracklists
	{
		name: 'tracklists.veryeasy.name',
		description: 'tracklists.veryeasy.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 30 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="20" width="2.8" height="4" rx="0.4" fill="currentColor"/><rect x="7" y="16" width="2.8" height="8" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="11" y="12" width="2.8" height="12" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="15" y="8" width="2.8" height="16" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="19" y="4" width="2.8" height="20" rx="0.4" fill="currentColor" opacity="0.25"/></svg>`,
		category: 'difficulty',
		config: {
			categoryWeights: null,
			composerFilter: {
				mode: 'topN',
				count: 30
			},
			yearFilter: null,
			workScoreRange: [5.4, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 1
		}
	},
	{
		name: 'tracklists.easy.name',
		description: 'tracklists.easy.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 30 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="20" width="2.8" height="4" rx="0.4" fill="currentColor"/><rect x="7" y="16" width="2.8" height="8" rx="0.4" fill="currentColor"/><rect x="11" y="12" width="2.8" height="12" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="15" y="8" width="2.8" height="16" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="19" y="4" width="2.8" height="20" rx="0.4" fill="currentColor" opacity="0.25"/></svg>`,
		category: 'difficulty',
		config: {
			categoryWeights: null,
			composerFilter: {
				mode: 'topN',
				count: 50
			},
			yearFilter: null,
			workScoreRange: [4.8, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 1
		}
	},
	{
		name: 'tracklists.medium.name',
		description: 'tracklists.medium.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 30 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="20" width="2.8" height="4" rx="0.4" fill="currentColor"/><rect x="7" y="16" width="2.8" height="8" rx="0.4" fill="currentColor"/><rect x="11" y="12" width="2.8" height="12" rx="0.4" fill="currentColor"/><rect x="15" y="8" width="2.8" height="16" rx="0.4" fill="currentColor" opacity="0.25"/><rect x="19" y="4" width="2.8" height="20" rx="0.4" fill="currentColor" opacity="0.25"/></svg>`,
		category: 'difficulty',
		config: {
			categoryWeights: null,
			composerFilter: {
				mode: 'topN',
				count: 75
			},
			yearFilter: null,
			workScoreRange: [4.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 2
		}
	},
	{
		name: 'tracklists.hard.name',
		description: 'tracklists.hard.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 30 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="20" width="2.8" height="4" rx="0.4" fill="currentColor"/><rect x="7" y="16" width="2.8" height="8" rx="0.4" fill="currentColor"/><rect x="11" y="12" width="2.8" height="12" rx="0.4" fill="currentColor"/><rect x="15" y="8" width="2.8" height="16" rx="0.4" fill="currentColor"/><rect x="19" y="4" width="2.8" height="20" rx="0.4" fill="currentColor" opacity="0.25"/></svg>`,
		category: 'difficulty',
		config: {
			categoryWeights: null,
			composerFilter: {
				mode: 'topN',
				count: 100
			},
			yearFilter: null,
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 3
		}
	},
	{
		name: 'tracklists.extreme.name',
		description: 'tracklists.extreme.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 30 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="20" width="2.8" height="4" rx="0.4" fill="currentColor"/><rect x="7" y="16" width="2.8" height="8" rx="0.4" fill="currentColor"/><rect x="11" y="12" width="2.8" height="12" rx="0.4" fill="currentColor"/><rect x="15" y="8" width="2.8" height="16" rx="0.4" fill="currentColor"/><rect x="19" y="4" width="2.8" height="20" rx="0.4" fill="currentColor"/></svg>`,
		category: 'difficulty',
		config: {
			categoryWeights: null,
			composerFilter: null,
			yearFilter: null,
			workScoreRange: null,
			maxTracksFromSingleWork: null
		}
	},
	// Category-based tracklists
	{
		name: 'tracklists.piano.name',
		description: 'tracklists.piano.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M3 8c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V8zm2 0v8h3v-4h1v4h2v-4h1v4h2v-4h1v4h2v-4h1v4h3V8H5z"/></svg>`,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 10,
				concerto: 0,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: [1800, 2000],
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.concerto.name',
		description: 'tracklists.concerto.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="7" r="1.5"/><circle cx="6" cy="10" r="1"/><circle cx="8" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="14" cy="10" r="1"/><circle cx="16" cy="10" r="1"/><circle cx="18" cy="10" r="1"/><circle cx="5" cy="13" r="1"/><circle cx="7" cy="13" r="1"/><circle cx="9" cy="13" r="1"/><circle cx="11" cy="13" r="1"/><circle cx="13" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><circle cx="17" cy="13" r="1"/><circle cx="19" cy="13" r="1"/><circle cx="6" cy="16" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="10" cy="16" r="1"/><circle cx="14" cy="16" r="1"/><circle cx="16" cy="16" r="1"/><circle cx="18" cy="16" r="1"/></svg>`,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 10,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.chamber.name',
		description: 'tracklists.chamber.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="6" cy="8" r="1.8"/><circle cx="18" cy="8" r="1.8"/><circle cx="8" cy="16" r="1.8"/><circle cx="16" cy="16" r="1.8"/></svg>`,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 10,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.ballet.name',
		description: 'tracklists.ballet.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="6" r="1.5"/><path d="M11 8.5c0-.3.2-.5.5-.5h1c.3 0 .5.2.5.5v2c0 .3-.2.5-.5.5h-1c-.3 0-.5-.2-.5-.5v-2z"/><path d="M9 11l3 .5 3-.5c1 2 2 4 1.5 6.5-.3 1.5-1.2 2.5-2 2.5-.5 0-.8-.3-1-.8-.2-.5-.3-1.2-.3-2.2 0-.5-.2-.8-.5-.8s-.5.3-.5.8c0 1-.1 1.7-.3 2.2-.2.5-.5.8-1 .8-.8 0-1.7-1-2-2.5C8.5 15 9 13 10 11z"/><path d="M8.5 10.5c-.8-.3-1.5-.5-2-.5-.5 0-.8.2-.8.5s.3.5.8.5c.5 0 1.2.2 2 .5z"/><path d="M15.5 10.5c.8-.3 1.5-.5 2-.5.5 0 .8.2.8.5s-.3.5-.8.5c-.5 0-1.2.2-2 .5z"/></svg>`,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 10,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			workScoreRange: [2.3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.opera.name',
		description: 'tracklists.opera.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 6c2 2 2 6 0 8l-2-1c1-1.33 1-3.67 0-5l2-2m-2 3c1 0 1 2 0 2l-2-1c-.5-1.5 1-1.5 2-1m-1-1L11 11c-1 2-3 2-4-1s-1-4 1-5c2-1 3.5 1 3 3.5c-.5 2.5-2.5 5.5-2.5 8.5"/></svg>`,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 10,
				ballet: 0,
				other: 0
			},
			composerFilter: null,
			yearFilter: null,
			workScoreRange: [3.8, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 3
		}
	},
	// Composer-based tracklists
	{
		name: 'tracklists.liszt.name',
		description: 'tracklists.liszt.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['2cd475bb-1abd-40c4-9904-6d4b691c752c'] },
			yearFilter: null,
			workScoreRange: [2.3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.bach.name',
		description: 'tracklists.bach.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['24f1766e-9635-4d58-a4d4-9413f9f98a4c'] },
			yearFilter: null,
			workScoreRange: [3.4, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.chopin.name',
		description: 'tracklists.chopin.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['09ff1fe8-d61c-4b98-bb82-18487c74d7b7'] },
			yearFilter: null,
			workScoreRange: [2.3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.mozart.name',
		description: 'tracklists.mozart.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['b972f589-fb0e-474e-b64a-803b0364fa75'] },
			yearFilter: null,
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.tchaikovsky.name',
		description: 'tracklists.tchaikovsky.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['9ddd7abc-9e1b-471d-8031-583bc6bc8be9'] },
			yearFilter: null,
			workScoreRange: [2.3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: null
		}
	},
	{
		name: 'tracklists.vivaldi.name',
		description: 'tracklists.vivaldi.description',
		isDefault: true,
		icon: `<svg width="24" height="24" viewBox="0 0 26 26" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
		category: 'composers',
		config: {
			categoryWeights: null,
			composerFilter: { mode: 'include', composers: ['ad79836d-9849-44df-8789-180bbc823f3c'] },
			yearFilter: null,
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: null
		}
	}
];

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
		category: 'custom', // Custom clones always go in custom category
		config: JSON.parse(JSON.stringify(tracklist.config)) // Deep clone config
	};
}
