/// These weights are multiplied with the number of works in each category (0-100, default 50)
/// Because ballet has far fewer works, it has a default weight of 100 to compensate
export interface CategoryWeights {
	vocal: number;
	chamber: number;
	orchestral: number;
	piano: number;
	concerto: number;
	opera: number;
	ballet: number;
	other: number;
}

// Composer filter as a discriminated union (OR type)
export type ComposerFilter =
	| { mode: 'include'; composers: string[] }
	| { mode: 'exclude'; composers: string[] }
	| { mode: 'topN'; count: number };

export interface TracklistConfig {
	categoryWeights: CategoryWeights | null;
	composerFilter: ComposerFilter | null;
	yearFilter: [number, number] | null; // [startYear, endYear]
	workScoreRange: [number, number] | null; // [minScore, maxScore]
	maxTracksFromSingleWork: number | null; // Maximum tracks to sample from a single work
}

export interface Tracklist {
	name: string;
	description: string;
	isDefault: boolean; // Whether this is a built-in preset
	icon?: string | null; // Optional SVG icon (as an inline SVG string)
	category?: 'difficulty' | 'categories' | 'composers' | 'custom'; // Category for organization
	config: TracklistConfig;
}

export interface GameSettings {
	numberOfTracks: number;
	selectedTracklist: string; // Name of the currently selected tracklist
	trackLength: number; // Duration in seconds (5-30)
	volume: number; // Volume level (0-100)
}

// Default values for tracklist configuration
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
	vocal: 50,
	chamber: 50,
	orchestral: 50,
	piano: 50,
	concerto: 50,
	opera: 50,
	ballet: 30,
	other: 30
};

// Work score range constants
export const MIN_WORK_SCORE = 2.3;
export const MAX_WORK_SCORE = 6.7;
export const DEFAULT_MIN_WORK_SCORE = 2.3;
export const DEFAULT_MAX_WORK_SCORE = 6.7;

export const DEFAULT_TRACKLIST_CONFIG: TracklistConfig = {
	categoryWeights: null,
	composerFilter: null,
	yearFilter: null,
	workScoreRange: [DEFAULT_MIN_WORK_SCORE, DEFAULT_MAX_WORK_SCORE],
	maxTracksFromSingleWork: null
};

export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 20,
	selectedTracklist: 'tracklists.veryeasy.name',
	trackLength: 25,
	volume: 100
};
