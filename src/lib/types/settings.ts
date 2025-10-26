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
	minWorkScore: number | null; // Minimum work score threshold
	maxTracksFromSingleWork: number | null; // Maximum tracks to sample from a single work
}

export interface Tracklist {
	name: string;
	description: string;
	isDefault: boolean; // Whether this is a built-in preset
	config: TracklistConfig;
}

export interface GameSettings {
	numberOfTracks: number;
	selectedTracklist: Tracklist; // Currently selected tracklist
	trackLength: number; // Duration in seconds (5-30)
	volume: number; // Volume level (0-100)
}

// Default values for tracklist configuration
export const DEFAULT_CATEGORY_WEIGHTS: CategoryWeights = {
	vocal: 20,
	chamber: 50,
	orchestral: 50,
	piano: 50,
	concerto: 50,
	opera: 50,
	ballet: 100,
	other: 40
};

export const DEFAULT_TRACKLIST_CONFIG: TracklistConfig = {
	categoryWeights: null,
	composerFilter: null,
	yearFilter: null,
	minWorkScore: 2.3,
	maxTracksFromSingleWork: null
};

export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 20,
	selectedTracklist: {
		name: 'tracklists.medium.name',
		description: 'tracklists.medium.description',
		isDefault: true,
		config: { ...DEFAULT_TRACKLIST_CONFIG, minWorkScore: 4.5 }
	},
	trackLength: 20,
	volume: 100
};
