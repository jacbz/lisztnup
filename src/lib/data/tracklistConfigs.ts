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
	topWorksCount: 2000,
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
	topWorksCount: 4000,
	categoryAdjustments: {
		vocal: -0.5,
		chamber: 0,
		orchestral: 0,
		piano: -0.3,
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
	workScoreRange: [0, 2.5],
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
	limitWorksFromComposer: 0.1,
	maxTracksFromSingleWork: 2
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
	nameFilter: ['piano', 'klavier', 'keyboard'],
	includeWorks: [
		'155c936d', // Albéniz – Concierto fantástico, op. 78
		'456f270a', // Alkan – 2 concerti da camera, op. 10
		'487b34d5', // Boulanger – Fantaisie variée
		'76d9aed3', // Chopin – Variations in B‐flat major on “Là ci darem la mano”, op. 2
		'907d0a19', // Dohnányi – Variations on a Nursery Song, op. 25
		'60b22df4', // Gershwin – Rhapsody in Blue (orch. Grofé)
		'2f6a2739', // Gubaidulina – Introitus
		'0f84285d', // Hindemith – Kammermusik No. 2, op. 36 no. 1
		'8b5584aa', // Liszt – Malédiction, S. 121
		'32eb27c7', // Liszt – Totentanz, S. 126/2
		'ca139438', // Litolff – Concerto Symphonique no. 4 in D minor, op. 102
		'550b7c98', // McPhee – Tabuh-Tabuhan
		'2c09a562', // Messiaen – Awakening of the Birds
		'c9299e16', // Messiaen – Couleurs de la cité céleste, I/46
		'5028903b', // Messiaen – Oiseaux exotiques, I/41
		'244c5897', // Montsalvatge – Concerto breve
		'67b7d3b4', // Pärt – Lamentate
		'e04dfc83', // Poulenc – Aubade, FP 51
		'17eea09b', // Rachmaninoff – Rhapsody on a Theme of Paganini, op. 43
		'9108faed', // Respighi – Concerto in modo misolidio, P. 145
		'11f16f24', // Saint‐Saëns – Allegro appassionato in C-sharp minor, op. 70
		'21560c8d', // Schumann – Konzertstück (Introduction and Allegro appassionato) in G major, op. 92
		'c77ae8b7', // Sylvestrov – Two Dialogues with Postscript
		'b908a5cf', // Tchaikovsky – Concert Fantasia, op. 56
		'23d2258b', // Turina – Rapsodia sinfónica, op. 66
		'578ccd3a' // Weber – Konzertstück in F minor, op. 79
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
	nameFilter: ['/viol(i|o)n(e|o|i|s)?\\b/'],
	includeWorks: [
		'4cbf3d3e', // Albinoni – 12 Concerti a cinque, op. 10
		'e858c951', // Berlioz – Rêverie et caprice, op. 8, H. 88
		'22393fc2', // Bernstein – Serenade after Plato’s “Symposium”
		'c1882b78', // Bruch – Adagio appassionato, op. 57
		'02f290d4', // Bruch - Scottish Fantasy, op. 46
		'e749559a', // Dutilleux – L'arbre des songes
		'54b5e409', // Dvořák – Romance in F minor, op. 11, B. 39
		'a69778c2', // Glass – Echorus
		'18a32371', // Glazunov – Mazurka-oberek in D major
		'12c9bedf', // Gubaidulina – In tempus praesens
		'b56e0a48', // Hartmann – Concerto funebre
		'4fe606f0', // Holst – A Song of the Night, op. 19 no. 1
		'6f43bf85', // Janáček – The Wandering of a Little Soul
		'9cf137ed', // Lalo – Symphonie espagnole in D minor, op. 21
		'4790c2dd', // Pärt – Darf ich…
		'914919ea', // Pärt – Tabula rasa
		'd6e59d93', // Ravel – Tzigane
		'4b80028e', // Saint‐Saëns – Caprice andalous en sol majeur, op. 122
		'40c9ecdf', // Saint‐Saëns – Morceau de concert, op. 62
		'e0818f8b', // Taneyev – Suite de concert, op. 28
		'c3912d1e', // Tchaikovsky – Sérénade mélancolique in B-flat minor, op. 26
		'862a0871', // Tchaikovsky – Souvenir d’un lieu cher, op. 42 (orch. Glazunov)
		'128dfe93', // Vasks – Distant Light
		'2b2ee1a6', // Vasks – Lonely Angel
		'561b8302', // Vaughan Williams – The Lark Ascending
		'9e283dd5', // Vivaldi – 6 concerti, op. 11
		'c487e7e1', // Vivaldi – 6 concerti, op. 12
		'de81e7e5', // Vivaldi – 6 concerti, op. 6
		'9c946ce9', // Vivaldi – Concerto in A, RV 552 "Per eco in lontano"
		'4045e2a7', // Vivaldi – Concerto in B-flat major, RV 553
		'df225ba0', // Vivaldi – Concerto in C minor, RV 199 "Il sospetto"
		'6f4a5507', // Vivaldi – Concerto in D major, RV 211
		'86298a29', // Vivaldi – Concerto in D minor, RV 243
		'96341344', // Vivaldi – Concerto in D, RV 562
		'f16cfe09', // Vivaldi – Concerto in do maggiore Per la SS. Assunzione di Maria Vergine, RV 581
		'b79443b8', // Vivaldi – Concerto in E major, RV 270
		'd9aee017', // Vivaldi – Concerto in E-flat major, RV 257
		'598ed597', // Vivaldi – Concerto in F major, RV 286
		'161dd98a', // Vivaldi – L’estro armonico, op. 3
		'fe884180', // Vivaldi – La cetra, op. 9
		'bf690cb7', // Vivaldi – La stravaganza, op. 4
		'7044d543', // Vivaldi – The Contest Between Harmony and Invention, op. 8
		'87886dcf', // Vivaldi – The Four Seasons
		'2d3c2e29', // Wieniawski – Capriccio-Valse, op. 7
		'2154dc72', // Wieniawski – Polonaise Brillante en la majeur, op. 21
		'24c323a3', // Ysaÿe – Amitié, op. 26
		'a36e54e5' // Ysaÿe – Poème élégiaque, op. 12
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
	nameFilter: ['violoncello', '/\\bcello/'],
	includeWorks: [
		'0e9d27ec', // Bloch – Schelomo
		'514024f4', // Bruch – Kol Nidrei, op. 47
		'1800c589', // Dun – The Eternal Vow
		'c472459c', // Dutilleux – Tout un monde lointain...
		'99c6d084', // Hindemith – Kammermusik No. 3, op. 36 no. 2
		'65f6580f', // Leo – Concerto no. 1 in A major
		'df1f9625', // Leo – Concerto no. 3 in D minor
		'ddd19c33', // Leo – Concerto no. 4 in A major
		'370dd15d', // Leo – Concerto no. 5 in F minor
		'8709d5f7', // Leo – Sinfonia concertata (Concerto no. 6) in C minor
		'890399dc' // Offenbach – Concerto militaire
	]
};

export const WOODWINDCONCERTO_CONFIG: TracklistConfig = {
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
	nameFilter: [
		'flute',
		'flöte',
		'flûte',
		'flautino',
		'recorder',
		'oboe',
		'hautbois',
		'clarinet',
		'klarinette',
		'bassoon',
		'fagott'
	],
	includeWorks: [
		'caf15212', // Bach – Concerto D-Dur, BWV 1050a
		'c91f280f', // Barber – Capricorn Concerto, op. 21
		'6cc0b61c', // Boismortier – 5 Sonates en trio suivies d'un concerto, op. 37
		'69604c1c', // Holst – A Fugal Concerto, op. 40 no. 2
		'7d9486d7', // Martin – Concerto for 7 Wind Instruments, Percussion & Strings
		'3b515385', // Rodrigo – Concierto pastoral
		'58d19f67', // Rutter – Suite Antique
		'774246e0', // Takemitsu – I Hear the Water Dreaming
		'f3ad1ed9', // Vivaldi – Concerto in A minor, RV 445
		'17d413a2', // Vivaldi – Concerto in C major, RV 444
		'0376374e', // Vivaldi – Concerto in C major, RV 558, “con molti stromenti”
		'f8ef20e6', // Vivaldi – Concerto in D major, op. 10 no. 5, RV 429
		'844601dc', // Vivaldi – Concerto in G minor, RV 577
		'd158f74d' // Wolf‐Ferrari – Suite-Concertino in F major, op. 16
	]
};

export const LISZT_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['2cd475bb-1abd-40c4-9904-6d4b691c752c'] },
	enablePopularityWeighting: true
};

export const BACH_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['24f1766e-9635-4d58-a4d4-9413f9f98a4c'] },
	enablePopularityWeighting: true,
	maxTracksFromSingleWork: 1,
	excludeWorks: [
		'469a9f81' // Mahler arr. of Orchestral Suite no. 2
	]
};

export const MOZART_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['b972f589-fb0e-474e-b64a-803b0364fa75'] },
	enablePopularityWeighting: true,
	maxTracksFromSingleWork: 1
};

export const BEETHOVEN_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['1f9df192-a621-4f54-8850-2c5373b7eac9'] },
	enablePopularityWeighting: true,
	maxTracksFromSingleWork: 1
};

export const CHOPIN_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['09ff1fe8-d61c-4b98-bb82-18487c74d7b7'] },
	enablePopularityWeighting: true
};
export const TCHAIKOVSKY_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['9ddd7abc-9e1b-471d-8031-583bc6bc8be9'] },
	enablePopularityWeighting: true
};

export const VIVALDI_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'include', composers: ['ad79836d-9849-44df-8789-180bbc823f3c'] },
	enablePopularityWeighting: true,
	maxTracksFromSingleWork: 1
};

export const FEMALE_COMPOSERS_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'gender', gender: 'female' }
};

export const RENAISSANCE_CONFIG: TracklistConfig = {
	yearFilter: [MIN_WORK_YEAR, 1600],
	maxTracksFromSingleWork: 2
};

export const BAROQUE_CONFIG: TracklistConfig = {
	yearFilter: [1600, 1750],
	limitWorksFromComposer: 0.25,
	topWorksCount: 1000,
	maxTracksFromSingleWork: 2
};

export const CLASSICAL_CONFIG: TracklistConfig = {
	yearFilter: [1750, 1820],
	limitWorksFromComposer: 0.3,
	maxTracksFromSingleWork: 2
};

export const ROMANTIC_CONFIG: TracklistConfig = {
	yearFilter: [1820, 1910],
	maxTracksFromSingleWork: 2
};

export const MODERNISM_CONFIG: TracklistConfig = {
	yearFilter: [1890, 1945],
	maxTracksFromSingleWork: 2
};

export const CONTEMPORARY_CONFIG: TracklistConfig = {
	yearFilter: [1945, 2050],
	maxTracksFromSingleWork: 2
};

export const GERMANY_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['DE', 'AT'] },
	limitWorksFromComposer: 0.07,
	workScoreRange: [1.8, MAX_WORK_SCORE_ROUNDED],
	categoryAdjustments: {
		vocal: -2.0,
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

export const ITALY_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['IT'] },
	limitWorksFromComposer: 0.05,
	categoryAdjustments: {
		vocal: -0.5,
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

export const FRANCE_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['FR'] },
	limitWorksFromComposer: 0.1,
	workScoreRange: [1.8, MAX_WORK_SCORE_ROUNDED]
};

export const RUSSIA_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['RU'] },
	limitWorksFromComposer: 0.1
};

export const UK_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['GB'] },
	limitWorksFromComposer: 0.1,
	categoryAdjustments: {
		vocal: -1.8,
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

export const USA_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['US'] },
	limitWorksFromComposer: 0.1
};

export const SPAIN_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['ES'] },
	limitWorksFromComposer: 0.1
};

export const SCANDINAVIA_CONFIG: TracklistConfig = {
	composerFilter: { mode: 'country', countries: ['SE', 'NO', 'DK', 'FI', 'IS'] },
	limitWorksFromComposer: 0.1
};
