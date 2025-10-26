export type Preset = 'default' | 'piano' | 'concerto' | 'chamber' | 'ballet' | 'opera' | 'custom';

export interface CategoryWeights {
	vocal: number;
	chamber: number;
	orchestral: number;
	piano: number;
	concerto: number;
	opera: number;
	ballet: number;
	unknown: number;
}

export interface GameSettings {
	numberOfTracks: number;
	preset: Preset;
	trackLength: number; // Duration in seconds (5-30)
	volume: number; // Volume level (0-100)
	// Custom filter options
	categoryWeights: CategoryWeights;
	composerFilter: string[]; // Array of composer GIDs to include
	yearFilter: [number, number] | null; // [startYear, endYear]
	topNComposers: number | null; // Only include top N composers
}

export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 20,
	preset: 'default',
	trackLength: 20,
	volume: 100,
	categoryWeights: {
		vocal: 1,
		chamber: 1,
		orchestral: 1,
		piano: 1,
		concerto: 1,
		opera: 1,
		ballet: 1,
		unknown: 1
	},
	composerFilter: [],
	yearFilter: null,
	topNComposers: null
};
