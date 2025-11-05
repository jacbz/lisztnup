/// These weights are multiplied with the number of works in each category (0-10, default 1)
/// E.g., 20 piano pieces (weight=1) vs 10 ballet (weight=1) -> piano is 2x as likely to be selected
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
	categoryWeights?: CategoryWeights;
	composerFilter?: ComposerFilter;
	yearFilter?: [number, number]; // [startYear, endYear]
	workScoreRange?: [number, number]; // [minScore, maxScore]
	maxTracksFromSingleWork?: number; // Maximum tracks to sample from a single work
	nameFilter?: string[]; // Filter works by name (supports regex when pattern starts and ends with /)
	enablePopularityWeighting?: boolean; // Whether to use work/part scores for weighted sampling (default: true)
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
	vocal: 0.8,
	chamber: 1,
	orchestral: 1,
	piano: 1,
	concerto: 1,
	opera: 1,
	ballet: 1.2,
	other: 0.8
};

// Work score range constants
export const MIN_WORK_SCORE = 2.3;
export const MAX_WORK_SCORE = 6.3;
export const DEFAULT_MIN_WORK_SCORE = 2.3;
export const DEFAULT_MAX_WORK_SCORE = 6.3;

export const DEFAULT_TRACKLIST_CONFIG: TracklistConfig = {
	workScoreRange: [DEFAULT_MIN_WORK_SCORE, DEFAULT_MAX_WORK_SCORE],
	enablePopularityWeighting: true
};

export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 20,
	selectedTracklist: 'tracklists.veryeasy.name',
	trackLength: 25,
	volume: 100
};
