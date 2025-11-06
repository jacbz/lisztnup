import { MAX_WORK_SCORE, MIN_WORK_SCORE, type Tracklist } from '$lib/types';
import difficultyVeryEasy from '$lib/assets/icons/difficulty-veryeasy.svg?raw';
import difficultyEasy from '$lib/assets/icons/difficulty-easy.svg?raw';
import difficultyMedium from '$lib/assets/icons/difficulty-medium.svg?raw';
import difficultyHard from '$lib/assets/icons/difficulty-hard.svg?raw';
import difficultyExtreme from '$lib/assets/icons/difficulty-extreme.svg?raw';
import pianoIcon from '$lib/assets/icons/piano.svg?raw';
import concertoIcon from '$lib/assets/icons/concerto.svg?raw';
import chamberIcon from '$lib/assets/icons/chamber.svg?raw';
import balletIcon from '$lib/assets/icons/ballet.svg?raw';
import operaIcon from '$lib/assets/icons/opera.svg?raw';
import starIcon from '$lib/assets/icons/star.svg?raw';
import violinIcon from '$lib/assets/icons/violin.svg?raw';
import celloIcon from '$lib/assets/icons/cello.svg?raw';
import orchestraIcon from '$lib/assets/icons/orchestra.svg?raw';

/**
 * Default tracklist presets organized by categories
 */

export const DEFAULT_TRACKLISTS: Tracklist[] = [
	// Difficulty-based tracklists
	{
		name: 'tracklists.beginner.name',
		description: 'tracklists.beginner.description',
		isDefault: true,
		icon: difficultyVeryEasy,
		category: 'difficulty',
		config: {
			composerFilter: {
				mode: 'topN',
				count: 30
			},
			workScoreRange: [5.2, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 1
		}
	},
	{
		name: 'tracklists.intermediate.name',
		description: 'tracklists.intermediate.description',
		isDefault: true,
		icon: difficultyEasy,
		category: 'difficulty',
		config: {
			composerFilter: {
				mode: 'topN',
				count: 50
			},
			workScoreRange: [4.8, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 1
		}
	},
	{
		name: 'tracklists.skilled.name',
		description: 'tracklists.skilled.description',
		isDefault: true,
		icon: difficultyMedium,
		category: 'difficulty',
		config: {
			composerFilter: {
				mode: 'topN',
				count: 75
			},
			workScoreRange: [4.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 2
		}
	},
	{
		name: 'tracklists.advanced.name',
		description: 'tracklists.advanced.description',
		isDefault: true,
		icon: difficultyHard,
		category: 'difficulty',
		config: {
			composerFilter: {
				mode: 'topN',
				count: 100
			},
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 3
		}
	},
	{
		name: 'tracklists.expert.name',
		description: 'tracklists.expert.description',
		isDefault: true,
		icon: difficultyExtreme,
		category: 'difficulty',
		config: {
			workScoreRange: [3, MAX_WORK_SCORE],
			enablePopularityWeighting: false
		}
	},
	{
		name: 'tracklists.virtuoso.name',
		description: 'tracklists.virtuoso.description',
		isDefault: true,
		icon: starIcon,
		category: 'difficulty',
		config: {
			enablePopularityWeighting: false
		}
	},
	{
		name: 'tracklists.cadenza.name',
		description: 'tracklists.cadenza.description',
		isDefault: true,
		icon: starIcon,
		category: 'difficulty',
		config: {
			workScoreRange: [MIN_WORK_SCORE, 3],
			enablePopularityWeighting: false
		}
	},
	// Category-based tracklists
	{
		name: 'tracklists.piano.name',
		description: 'tracklists.piano.description',
		isDefault: true,
		icon: pianoIcon,
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
			yearFilter: [1800, 2000],
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.concerto.name',
		description: 'tracklists.concerto.description',
		isDefault: true,
		icon: concertoIcon,
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
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.orchestral.name',
		description: 'tracklists.orchestral.description',
		isDefault: true,
		icon: orchestraIcon,
		category: 'categories',
		config: {
			categoryWeights: {
				vocal: 0,
				chamber: 0,
				orchestral: 10,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				other: 0
			},
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.chamber.name',
		description: 'tracklists.chamber.description',
		isDefault: true,
		icon: chamberIcon,
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
			workScoreRange: [3.5, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.ballet.name',
		description: 'tracklists.ballet.description',
		isDefault: true,
		icon: balletIcon,
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
			workScoreRange: [2.3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.opera.name',
		description: 'tracklists.opera.description',
		isDefault: true,
		icon: operaIcon,
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
			workScoreRange: [3.8, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.pianoconcerto.name',
		description: 'tracklists.pianoconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: pianoIcon,
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
			nameFilter: ['piano', 'klavier'],
			workScoreRange: [3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.violinconcerto.name',
		description: 'tracklists.violinconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: violinIcon,
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
			nameFilter: ['violin', 'violon'],
			workScoreRange: [3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.celloconcerto.name',
		description: 'tracklists.celloconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: celloIcon,
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
			nameFilter: ['cello'],
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},

	// Composer-based tracklists
	{
		name: 'tracklists.liszt.name',
		description: 'tracklists.liszt.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['2cd475bb-1abd-40c4-9904-6d4b691c752c'] },
			workScoreRange: [2.3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.bach.name',
		description: 'tracklists.bach.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['24f1766e-9635-4d58-a4d4-9413f9f98a4c'] },
			workScoreRange: [3.4, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.chopin.name',
		description: 'tracklists.chopin.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['09ff1fe8-d61c-4b98-bb82-18487c74d7b7'] },
			workScoreRange: [2.3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.mozart.name',
		description: 'tracklists.mozart.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['b972f589-fb0e-474e-b64a-803b0364fa75'] },
			workScoreRange: [3, MAX_WORK_SCORE],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.tchaikovsky.name',
		description: 'tracklists.tchaikovsky.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['9ddd7abc-9e1b-471d-8031-583bc6bc8be9'] },
			workScoreRange: [2.3, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.vivaldi.name',
		description: 'tracklists.vivaldi.description',
		isDefault: true,
		icon: starIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['ad79836d-9849-44df-8789-180bbc823f3c'] },
			workScoreRange: [3, MAX_WORK_SCORE]
		}
	},

	// Era-based tracklists
	{
		name: 'tracklists.renaissance.name',
		description: 'tracklists.renaissance.description',
		isDefault: true,
		category: 'eras',
		config: {
			yearFilter: [1400, 1600],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.baroque.name',
		description: 'tracklists.baroque.description',
		isDefault: true,
		category: 'eras',
		config: {
			yearFilter: [1600, 1750],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.classical.name',
		description: 'tracklists.classical.description',
		isDefault: true,
		category: 'eras',
		config: {
			yearFilter: [1750, 1820],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.romantic.name',
		description: 'tracklists.romantic.description',
		isDefault: true,
		category: 'eras',
		config: {
			yearFilter: [1820, 1910],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE]
		}
	},
	{
		name: 'tracklists.20thcentury.name',
		description: 'tracklists.20thcentury.description',
		isDefault: true,
		category: 'eras',
		config: {
			yearFilter: [1900, 1999],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE]
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
