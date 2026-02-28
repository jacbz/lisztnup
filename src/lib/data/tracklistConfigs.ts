import { MAX_WORK_SCORE_ROUNDED } from '$lib/types';
import type { TracklistConfig } from '$lib/types/settings';
import { COMPOSER_COUNT, MAX_WORK_YEAR, MIN_WORK_YEAR } from '$lib/types/settings';
import { BEGINNER_TRACKLIST } from './beginnerTracklist';

export const BEGINNER_CONFIG: TracklistConfig = {
	enableFilters: false,
	maxTracksFromSingleWork: 1,
	includeWorks: BEGINNER_TRACKLIST
};

export const INTERMEDIATE_CONFIG: TracklistConfig = {
	topWorksCount: 500,
	categoryAdjustments: {
		vocal: -0.2,
		chamber: 0.2,
		orchestral: 0,
		piano: 0,
		concerto: 0,
		opera: 0.1,
		ballet: 0.3,
		organ: -0.3,
		solo: 0
	},
	limitWorksFromComposer: 0.08,
	maxTracksFromSingleWork: 1,
	includeWorks: BEGINNER_TRACKLIST
};

export const SKILLED_CONFIG: TracklistConfig = {
	topWorksCount: 1000,
	categoryAdjustments: {
		vocal: -0.2,
		chamber: 0.1,
		orchestral: 0,
		piano: -0.1,
		concerto: 0,
		opera: 0.1,
		ballet: 0.3,
		organ: -0.3,
		solo: 0
	},
	limitWorksFromComposer: 0.08,
	maxTracksFromSingleWork: 1,
	includeWorks: BEGINNER_TRACKLIST
};

export const ADVANCED_CONFIG: TracklistConfig = {
	topWorksCount: 1750,
	categoryAdjustments: {
		vocal: -0.2,
		chamber: 0.1,
		orchestral: 0,
		piano: -0.1,
		concerto: 0,
		opera: 0.1,
		ballet: 0,
		organ: -0.5,
		solo: 0
	},
	limitWorksFromComposer: 0.08,
	maxTracksFromSingleWork: 2
};

export const EXPERT_CONFIG: TracklistConfig = {
	topWorksCount: 3000,
	categoryAdjustments: {
		vocal: -0.3,
		chamber: 0,
		orchestral: 0,
		piano: -0.1,
		concerto: 0,
		opera: 0.1,
		ballet: 0,
		organ: -0.7,
		solo: 0
	},
	limitWorksFromComposer: 0.1,
	maxTracksFromSingleWork: 3
};

export const VIRTUOSO_CONFIG: TracklistConfig = {};

export const CADENZA_CONFIG: TracklistConfig = {
	workScoreRange: [0, 3],
	categoryAdjustments: {
		vocal: -0.8,
		chamber: 0,
		orchestral: 0,
		piano: 0,
		concerto: 0,
		opera: 0,
		ballet: 0,
		organ: 0,
		solo: 0
	}
};

export const OBSCURE_CONFIG: TracklistConfig = {
	workScoreRange: [0, 3.2],
	composerFilter: {
		mode: 'notabilityRange',
		range: [201, COMPOSER_COUNT]
	}
};

export const PIANO_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: 0,
		concerto: -MAX_WORK_SCORE_ROUNDED,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	yearFilter: [1780, MAX_WORK_YEAR],
	limitWorksFromComposer: 0.1,
	maxTracksFromSingleWork: 5
};

export const CONCERTO_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: 0,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	maxTracksFromSingleWork: 5,
	limitWorksFromComposer: 0.1
};

export const ORCHESTRAL_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: 0,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: -MAX_WORK_SCORE_ROUNDED,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	maxTracksFromSingleWork: 5,
	limitWorksFromComposer: 0.1
};

export const CHAMBER_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: 0,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: -MAX_WORK_SCORE_ROUNDED,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	maxTracksFromSingleWork: 5,
	limitWorksFromComposer: 0.1
};

export const BALLET_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: -MAX_WORK_SCORE_ROUNDED,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: 0,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	limitWorksFromComposer: 0.1
};

export const OPERA_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: -MAX_WORK_SCORE_ROUNDED,
		opera: 0,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	limitWorksFromComposer: 0.1
};

export const PIANOCONCERTO_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: 0,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	limitWorksFromComposer: 0.1,
	nameFilter: ['piano', 'klavier'],
	includeWorks: [
		'60b22df4', // Gershwin - Rhapsody in Blue
		'21560c8d' // Schumann - Konzertstück
	],
	composerFilter: {
		mode: 'exclude',
		composers: ['a65d57ec-36a7-49ad-b99d-79f01cd45478'] // Wieniawski
	}
};

export const VIOLINCONCERTO_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: 0,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	limitWorksFromComposer: 0.1,
	nameFilter: ['/viol(i|o)n\\b/'],
	includeWorks: [
		'561b8302', // Vaughan Williams - The Lark Ascending
		'24c323a3' // Ysaÿe - Amitié
	]
};

export const CELLOCONCERTO_CONFIG: TracklistConfig = {
	categoryAdjustments: {
		vocal: -MAX_WORK_SCORE_ROUNDED,
		chamber: -MAX_WORK_SCORE_ROUNDED,
		orchestral: -MAX_WORK_SCORE_ROUNDED,
		piano: -MAX_WORK_SCORE_ROUNDED,
		concerto: 0,
		opera: -MAX_WORK_SCORE_ROUNDED,
		ballet: -MAX_WORK_SCORE_ROUNDED,
		organ: -MAX_WORK_SCORE_ROUNDED,
		solo: -MAX_WORK_SCORE_ROUNDED
	},
	limitWorksFromComposer: 0.1,
	nameFilter: ['cello'],
	includeWorks: [
		'0e9d27ec', // Bloch - Schemolo
		'514024f4', // Bruch - Kol Nidrei
		'942499a7' // Tchaikovsky - Variations on a Rococo Theme
	]
};

export const LISZT_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['2cd475bb-1abd-40c4-9904-6d4b691c752c'] },
	workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
};

export const BACH_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['24f1766e-9635-4d58-a4d4-9413f9f98a4c'] },
	workScoreRange: [3.4, MAX_WORK_SCORE_ROUNDED],
	maxTracksFromSingleWork: 5
};

export const CHOPIN_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['09ff1fe8-d61c-4b98-bb82-18487c74d7b7'] },
	workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
};

export const MOZART_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['b972f589-fb0e-474e-b64a-803b0364fa75'] },
	workScoreRange: [3, MAX_WORK_SCORE_ROUNDED],
	maxTracksFromSingleWork: 5
};

export const TCHAIKOVSKY_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['9ddd7abc-9e1b-471d-8031-583bc6bc8be9'] },
	workScoreRange: [2.3, MAX_WORK_SCORE_ROUNDED]
};

export const VIVALDI_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['ad79836d-9849-44df-8789-180bbc823f3c'] },
	workScoreRange: [3, MAX_WORK_SCORE_ROUNDED]
};

export const RENAISSANCE_CONFIG: TracklistConfig = {
	yearFilter: [MIN_WORK_YEAR, 1600]
};

export const BAROQUE_CONFIG: TracklistConfig = {
	yearFilter: [1600, 1750]
};

export const CLASSICAL_CONFIG: TracklistConfig = {
	yearFilter: [1750, 1820]
};

export const ROMANTIC_CONFIG: TracklistConfig = {
	yearFilter: [1820, 1910]
};

export const TWENTIETH_CENTURY_CONFIG: TracklistConfig = {
	yearFilter: [1900, 1999]
};
