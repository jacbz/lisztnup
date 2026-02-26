import { MAX_WORK_SCORE_ROUNDED } from '$lib/types';
import type { TracklistConfig } from '$lib/types/settings';
import { COMPOSER_COUNT, MAX_WORK_YEAR, MIN_WORK_YEAR } from '$lib/types/settings';

// List of manually curated works to always include in tracklists, regardless of their score
export const WORKS_TO_INCLUDE = [
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
	'c3b8d09b', // Shostakovich 5
	'd3229859', // Shostakovich - Waltz No. 2
	'fec1c6a5', // Strauss - Also sprach Zarathustra
	'5983b48e', // Prokofiev 1
	'0294f5e0' // Prokofiev - Romeo and Juliet - Dance of the Knights
];

export const BEGINNER_CONFIG: TracklistConfig = {
	topWorksCount: 250,
	categoryAdjustments: {
		vocal: 0,
		chamber: 0.4,
		orchestral: -0.2,
		piano: -0.1,
		concerto: 0,
		opera: 0.1,
		ballet: 0.5,
		organ: -0.3,
		solo: 0
	},
	limitWorksFromComposer: 0.075,
	maxTracksFromSingleWork: 1,
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
		'1dd56ba3', // Parry - Jerusalem
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
	limitWorksFromComposer: 0.075,
	maxTracksFromSingleWork: 1,
	includeWorks: WORKS_TO_INCLUDE
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
	limitWorksFromComposer: 0.1,
	maxTracksFromSingleWork: 1,
	includeWorks: WORKS_TO_INCLUDE
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
	limitWorksFromComposer: 0.15,
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
	maxTracksFromSingleWork: 3
};

export const VIRTUOSO_CONFIG: TracklistConfig = {
	includeWorks: WORKS_TO_INCLUDE
};

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
	nameFilter: ['/viol(i|o)n\b/'],
	includeWorks: [
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
	maxTracksFromSingleWork: 5,
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
	yearFilter: [MIN_WORK_YEAR, 1600],
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED]
};

export const BAROQUE_CONFIG: TracklistConfig = {
	yearFilter: [1600, 1750],
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED]
};

export const CLASSICAL_CONFIG: TracklistConfig = {
	yearFilter: [1750, 1820],
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED]
};

export const ROMANTIC_CONFIG: TracklistConfig = {
	yearFilter: [1820, 1910],
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED]
};

export const TWENTIETH_CENTURY_CONFIG: TracklistConfig = {
	yearFilter: [1900, 1999],
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED]
};
