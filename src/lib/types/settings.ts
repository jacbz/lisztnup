/// These adjustments are added to work scores for each category (-DIFF to DIFF, default 0)

import type { GuessCategory } from './game';

/// E.g., piano pieces with +1 adjustment have their scores increased by 1, making them more likely to be selected
export interface CategoryAdjustments {
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
	categoryAdjustments?: CategoryAdjustments;
	composerFilter?: ComposerFilter;
	yearFilter?: [number, number]; // [startYear, endYear]
	workScoreRange?: [number, number]; // [minScore, maxScore]
	limitWorksFromComposer?: number; // Limit works from each composer (0-1, as percentage, e.g., 0.3 = 30%)
	maxTracksFromSingleWork?: number; // Maximum tracks to sample from a single work
	nameFilter?: string[]; // Filter works by name (supports regex when pattern starts and ends with /)
	enablePopularityWeighting?: boolean; // Whether to use work/part scores for weighted sampling (default: true)
}

export interface Tracklist {
	name: string;
	description: string;
	isDefault: boolean; // Whether this is a built-in preset
	icon?: string | null; // Optional SVG icon (as an inline SVG string)
	category?: 'difficulty' | 'categories' | 'composers' | 'eras' | 'custom'; // Category for organization
	config: TracklistConfig;
}

export interface BingoGridCell {
	category: GuessCategory;
	marked: boolean;
}

export interface GameSettings {
	numberOfTracks: number;
	selectedTracklist: string; // Name of the currently selected tracklist
	trackLength: number; // Duration in seconds (5-30)
	volume: number; // Volume level (0-100)
	gameMode: 'classic' | 'buzzer' | 'bingo'; // Game mode
	players: Array<{ name: string; color: string }>; // Saved player configurations
	enableScoring: boolean; // Whether scoring is enabled
	bingoGrid?: BingoGridCell[][]; // 5x5 grid for Bingo mode
	enableAudioNormalization: boolean; // Whether to use Web Audio API with LUFS normalization (defaults to false on WebKit)
	buzzerVolume: number; // Buzzer volume level (0-1)
}

// Default values for tracklist configuration
export const DEFAULT_CATEGORY_ADJUSTMENTS: CategoryAdjustments = {
	vocal: 0,
	chamber: 0,
	orchestral: 0,
	piano: 0,
	concerto: 0,
	opera: 0,
	ballet: 0,
	other: 0
};

// Work score range constants
export const MIN_WORK_SCORE = 1.9;
/// The maximum work score outputed by process_musicbrainz.py
export const MAX_WORK_SCORE = 6.54;

export const MIN_WORK_SCORE_ROUNDED = Math.floor(MIN_WORK_SCORE * 10) / 10;
export const MAX_WORK_SCORE_ROUNDED = Math.ceil(MAX_WORK_SCORE * 10) / 10;

export const CATEGORY_ADJUSTMENT_DIFF = MAX_WORK_SCORE_ROUNDED - MIN_WORK_SCORE_ROUNDED;

export const DEFAULT_TRACKLIST_CONFIG: TracklistConfig = {
	workScoreRange: [MIN_WORK_SCORE_ROUNDED, MAX_WORK_SCORE_ROUNDED],
	enablePopularityWeighting: true
};

// Detect WebKit-based browsers (Safari, iOS Safari, etc.)
const isWebKit =
	typeof window !== 'undefined' &&
	/AppleWebKit/.test(navigator.userAgent) &&
	!/Chrome|Chromium/.test(navigator.userAgent);

export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 10,
	selectedTracklist: 'tracklists.beginner.name',
	trackLength: 30,
	volume: 100,
	gameMode: 'classic',
	players: [],
	enableScoring: true,
	bingoGrid: undefined,
	enableAudioNormalization: !isWebKit, // Default to true, but false on WebKit browsers
	buzzerVolume: 0.75
};
