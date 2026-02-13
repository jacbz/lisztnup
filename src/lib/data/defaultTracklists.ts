import {
	MAX_WORK_SCORE_ROUNDED,
	MIN_WORK_SCORE,
	CATEGORY_ADJUSTMENT_DIFF,
	type Tracklist
} from '$lib/types';
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
import composerIcon from '$lib/assets/icons/composer.svg?raw';
import eraIcon from '$lib/assets/icons/era.svg?raw';
import { COMPOSER_COUNT } from '$lib/types/settings';

// List of specific works to always include in tracklists, regardless of their score
const WORKS_TO_INCLUDE = [
	'87281f3c', // Beethoven - Kreutzer Sonata
	'6ec79e92', // Bizet - L'Arlésienne Suite No. 1 - Farandole
	'45efd8f4', // Bizet - Carmen
	'3f13a790', // Brahms - Hungarian Dance No. 5
	'1c0cb34d', // Bruckner 7
	'f9ee7f5f', // Elgar - Pomp and Circumstance March No. 1
	'2a3bf259', // Massenet - Meditation from Thais
	'e208c5f5', // Mozart - Magic Flute
	'19da23f4', // Puccini - O mio babbino caro
	'1659508c', // Rachmaninoff - Vocalise
	'1ce190e3', // Rossini - Guillaume Tell Overture
	'640d92c6', // Saint-Saens - Danse macabre
	'f8f24282', // Schubert - Auf dem Wasser zu singen
	'd783dab0', // Schubert - Erlkönig
	'fec1c6a5', // Strauss - Also sprach Zarathustra
	'5983b48e', // Prokofiev 1
	'0294f5e0' // Prokofiev - Romeo and Juliet - Dance of the Knights
];

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
			workScoreRange: [4.7, MAX_WORK_SCORE_ROUNDED],
			categoryAdjustments: {
				vocal: 0,
				chamber: 0.3,
				orchestral: -0.2,
				piano: -0.1,
				concerto: 0,
				opera: 0.1,
				ballet: 0.5,
				solo: 0
			},
			limitWorksFromComposer: 0.075,
			maxTracksFromSingleWork: 1,
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE,
			excludeWorks: [
				'937fff7e', // Bach - Nun komm, der Heiden Heiland
				'0a633962', // Bach - Violin Sonata in E major
				'c324226d', // Bach - Violin Sonata in C minor
				'3c9a74de', // Beethoven 1
				'273fea50', // Beethoven 4
				'256f32ec', // Beethoven 8
				'8f8c2b3e', // Debussy - L'Isle joyeuse
				'df86a927', // Debussy - Préludes Book II
				'937f3282', // Debussy - Syrinx
				'26ea58b3', // De Falla - El amor brujo
				'085103a5', // Holst - In the Bleak Midwinter,
				'4344e777', // Rodrigo - Concierto de Aranjuez
				'676bdcd4', // Rossini - La gazza ladra Overture
				'62308818', // Strauss - Annen-Polka
				'a26cbcf8', // Strauss - Perpetuum mobile
				'71f4fb64', // Strauss - Künstlerleben
				'85be26e9', // Strauss - Unter Donner und Blitz
				'2eb55386', // Strauss - Rosen aus dem Süden
				'6237af8b', // Strauss - Wein, Weib und Gesang
				'b42a2d27', // Strauss - Frühlingsstimmen
				'9b1bd955' // Wagner - Tannhäuser Pilgerchor
			]
		}
	},
	{
		name: 'tracklists.intermediate.name',
		description: 'tracklists.intermediate.description',
		isDefault: true,
		icon: difficultyEasy,
		category: 'difficulty',
		config: {
			workScoreRange: [4.3, MAX_WORK_SCORE_ROUNDED],
			categoryAdjustments: {
				vocal: 0,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0.3,
				solo: 0
			},
			limitWorksFromComposer: 0.075,
			maxTracksFromSingleWork: 1,
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE
		}
	},
	{
		name: 'tracklists.skilled.name',
		description: 'tracklists.skilled.description',
		isDefault: true,
		icon: difficultyMedium,
		category: 'difficulty',
		config: {
			workScoreRange: [3.9, MAX_WORK_SCORE_ROUNDED],
			limitWorksFromComposer: 0.1,
			maxTracksFromSingleWork: 1,
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE
		}
	},
	{
		name: 'tracklists.advanced.name',
		description: 'tracklists.advanced.description',
		isDefault: true,
		icon: difficultyHard,
		category: 'difficulty',
		config: {
			workScoreRange: [3.6, MAX_WORK_SCORE_ROUNDED],
			categoryAdjustments: {
				vocal: -0.2,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				solo: 0
			},
			limitWorksFromComposer: 0.15,
			maxTracksFromSingleWork: 2,
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE
		}
	},
	{
		name: 'tracklists.expert.name',
		description: 'tracklists.expert.description',
		isDefault: true,
		icon: difficultyExtreme,
		category: 'difficulty',
		config: {
			workScoreRange: [3, MAX_WORK_SCORE_ROUNDED],
			categoryAdjustments: {
				vocal: -0.3,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				solo: 0
			},
			maxTracksFromSingleWork: 3,
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE
		}
	},
	{
		name: 'tracklists.virtuoso.name',
		description: 'tracklists.virtuoso.description',
		isDefault: true,
		icon: starIcon,
		category: 'difficulty',
		config: {
			enablePopularityWeighting: false,
			includeWorks: WORKS_TO_INCLUDE
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
			categoryAdjustments: {
				vocal: -0.8,
				chamber: 0,
				orchestral: 0,
				piano: 0,
				concerto: 0,
				opera: 0,
				ballet: 0,
				solo: 0
			},
			enablePopularityWeighting: false
		}
	},
	{
		name: 'tracklists.obscure.name',
		description: 'tracklists.obscure.description',
		isDefault: true,
		icon: composerIcon,
		category: 'difficulty',
		config: {
			workScoreRange: [MIN_WORK_SCORE, 3.2],
			composerFilter: {
				mode: 'notabilityRange',
				range: [201, COMPOSER_COUNT]
			},
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
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: 0,
				concerto: -CATEGORY_ADJUSTMENT_DIFF,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			yearFilter: [1800, 2000],
			workScoreRange: [3, MAX_WORK_SCORE_ROUNDED],
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
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: 0,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			workScoreRange: [3.4, MAX_WORK_SCORE_ROUNDED],
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
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: 0,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: -CATEGORY_ADJUSTMENT_DIFF,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			workScoreRange: [3.4, MAX_WORK_SCORE_ROUNDED],
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
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: 0,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: -CATEGORY_ADJUSTMENT_DIFF,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			workScoreRange: [3.4, MAX_WORK_SCORE_ROUNDED],
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
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: -CATEGORY_ADJUSTMENT_DIFF,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: 0,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.opera.name',
		description: 'tracklists.opera.description',
		isDefault: true,
		icon: operaIcon,
		category: 'categories',
		config: {
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: -CATEGORY_ADJUSTMENT_DIFF,
				opera: 0,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			workScoreRange: [3.8, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.pianoconcerto.name',
		description: 'tracklists.pianoconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: pianoIcon,
		config: {
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: 0,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			nameFilter: ['piano', 'klavier']
		}
	},
	{
		name: 'tracklists.violinconcerto.name',
		description: 'tracklists.violinconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: violinIcon,
		config: {
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: 0,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			nameFilter: ['violin', 'violon']
		}
	},
	{
		name: 'tracklists.celloconcerto.name',
		description: 'tracklists.celloconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: celloIcon,
		config: {
			categoryAdjustments: {
				vocal: -CATEGORY_ADJUSTMENT_DIFF,
				chamber: -CATEGORY_ADJUSTMENT_DIFF,
				orchestral: -CATEGORY_ADJUSTMENT_DIFF,
				piano: -CATEGORY_ADJUSTMENT_DIFF,
				concerto: 0,
				opera: -CATEGORY_ADJUSTMENT_DIFF,
				ballet: -CATEGORY_ADJUSTMENT_DIFF,
				solo: -CATEGORY_ADJUSTMENT_DIFF
			},
			nameFilter: ['cello'],
			maxTracksFromSingleWork: 5
		}
	},

	// Composer-based tracklists
	{
		name: 'tracklists.liszt.name',
		description: 'tracklists.liszt.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['2cd475bb-1abd-40c4-9904-6d4b691c752c'] },
			workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.bach.name',
		description: 'tracklists.bach.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['24f1766e-9635-4d58-a4d4-9413f9f98a4c'] },
			workScoreRange: [3.4, MAX_WORK_SCORE_ROUNDED],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.chopin.name',
		description: 'tracklists.chopin.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['09ff1fe8-d61c-4b98-bb82-18487c74d7b7'] },
			workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.mozart.name',
		description: 'tracklists.mozart.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['b972f589-fb0e-474e-b64a-803b0364fa75'] },
			workScoreRange: [3, MAX_WORK_SCORE_ROUNDED],
			maxTracksFromSingleWork: 5
		}
	},
	{
		name: 'tracklists.tchaikovsky.name',
		description: 'tracklists.tchaikovsky.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['9ddd7abc-9e1b-471d-8031-583bc6bc8be9'] },
			workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.vivaldi.name',
		description: 'tracklists.vivaldi.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: {
			composerFilter: { mode: 'include', composers: ['ad79836d-9849-44df-8789-180bbc823f3c'] },
			workScoreRange: [3, MAX_WORK_SCORE_ROUNDED]
		}
	},

	// Era-based tracklists
	{
		name: 'tracklists.renaissance.name',
		description: 'tracklists.renaissance.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: {
			yearFilter: [1400, 1600],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.baroque.name',
		description: 'tracklists.baroque.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: {
			yearFilter: [1600, 1750],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.classical.name',
		description: 'tracklists.classical.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: {
			yearFilter: [1750, 1820],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.romantic.name',
		description: 'tracklists.romantic.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: {
			yearFilter: [1820, 1910],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE_ROUNDED]
		}
	},
	{
		name: 'tracklists.20thcentury.name',
		description: 'tracklists.20thcentury.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: {
			yearFilter: [1900, 1999],
			workScoreRange: [MIN_WORK_SCORE, MAX_WORK_SCORE_ROUNDED]
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
