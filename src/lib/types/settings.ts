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
	organ: number;
	solo: number;
}

// Composer filter as a discriminated union (OR type)
export type ComposerFilter =
	| { mode: 'include'; composers: string[] }
	| { mode: 'exclude'; composers: string[] }
	| { mode: 'notabilityRange'; range: [number, number] }
	| { mode: 'country'; countries: string[] }
	| { mode: 'countryExclude'; countries: string[] }
	| { mode: 'gender'; gender: 'male' | 'female' };

export interface TracklistConfig {
	categoryAdjustments?: CategoryAdjustments;
	composerFilter?: ComposerFilter;
	yearFilter?: [number, number]; // [startYear, endYear]
	workScoreRange?: [number, number]; // [minScore, maxScore]
	topWorksCount?: number; // Limit to the top N works sorted by (adjusted) popularity score
	limitWorksFromComposer?: number; // Limit works from each composer (0-1, as percentage, e.g., 0.3 = 30%)
	maxTracksFromSingleWork?: number; // Maximum tracks to sample from a single work
	nameFilter?: string[]; // Filter works by name (supports regex when pattern starts and ends with /)
	enablePopularityWeighting?: boolean; // Whether to use work/part scores for weighted sampling (default: false)
	enableFilters?: boolean; // Whether filters are applied (default: true). When false, only manual curation is used.
	includeWorks?: string[]; // Short UUIDs (first 8 chars) of works to always include
	excludeWorks?: string[]; // Short UUIDs (first 8 chars) of works to always exclude
}

interface TracklistBase {
	readonly id: string;
	readonly icon?: string | null;
	config: TracklistConfig;
}

/** A built-in preset tracklist. Display name/description are derived from `id` via i18n keys. */
export interface DefaultTracklist extends TracklistBase {
	readonly kind: 'default';
	readonly category: 'difficulty' | 'categories' | 'composers' | 'eras' | 'countries';
}

/** A user-created tracklist stored in localStorage. */
export interface CustomTracklist extends TracklistBase {
	kind: 'custom';
	name: string;
	description: string;
	category?: 'custom';
}

export type Tracklist = DefaultTracklist | CustomTracklist;

export interface BingoGridCell {
	category: GuessCategory;
	marked: boolean;
}

export interface GameSettings {
	numberOfTracks: number;
	/// Timeline mode only: number of cards a player needs in their timeline to win.
	timelineTarget: number;
	selectedTracklist: string; // id of the currently selected tracklist
	trackLength: number; // Duration in seconds (5-30)
	volume: number; // Volume level (0-100)
	gameMode: 'timeline' | 'classic' | 'buzzer' | 'bingo'; // Game mode
	players: Array<{ name: string; color: string; edge?: 'bottom' | 'left' | 'top' | 'right' }>; // Saved player configurations
	enableScoring: boolean; // Whether scoring is enabled
	bingoGrid?: BingoGridCell[][]; // 5x5 grid for Bingo mode
	enableAudioNormalization: boolean; // Whether to use Web Audio API with LUFS normalization (defaults to false on WebKit)
	buzzerVolume: number; // Buzzer volume level (0-1)
	gamesPlayed: number; // Total number of games started (used to detect new users)
	dailyChallengePlayedDate: string | null; // UTC YYYY-MM-DD when the daily challenge was last started
	leaderboardPublishing: {
		allowedNames: string[];
		deniedNames: string[];
	};
}

/**
 * The default values for the category adjustments.
 */
export const DEFAULT_CATEGORY_ADJUSTMENTS: CategoryAdjustments = {
	vocal: 0,
	chamber: 0,
	orchestral: 0,
	piano: 0,
	concerto: 0,
	opera: 0,
	ballet: 0,
	organ: 0,
	solo: 0
};

/**
 * The minimum work score, configured in process_musicbrainz.py.
 */
export const MIN_WORK_SCORE = 1.4;
/**
 * The maximum work score outputted by process_musicbrainz.py
 */
export const MAX_WORK_SCORE = 6.55;
/**
 * The minimum part score (dynamic threshold), configured in process_musicbrainz.py.
 */
export const MIN_PART_SCORE = 75;

/**
 * The approximate number of composers in the database.
 */
export const COMPOSER_COUNT = 910;
/**
 * The minimum work score, rounded to one decimal place.
 */
export const MIN_WORK_SCORE_ROUNDED = Math.floor(MIN_WORK_SCORE * 10) / 10;
/**
 * The maximum work score, rounded to one decimal place.
 */
export const MAX_WORK_SCORE_ROUNDED = Math.ceil(MAX_WORK_SCORE * 10) / 10;
/**
 * The minimum work year in the database.
 */
export const MIN_WORK_YEAR = 1400;

/**
 * The maximum work year in the database.
 */
export const MAX_WORK_YEAR = 2020;

/**
 * The default values for the tracklist configuration.
 */
export const DEFAULT_TRACKLIST_CONFIG: TracklistConfig = {
	workScoreRange: [0, MAX_WORK_SCORE_ROUNDED],
	enablePopularityWeighting: false
};

// Detect WebKit-based browsers (Safari, iOS Safari, etc.)
const isWebKit =
	typeof window !== 'undefined' &&
	/AppleWebKit/.test(navigator.userAgent) &&
	!/Chrome|Chromium/.test(navigator.userAgent);

/**
 * The default values for the game settings.
 */
export const DEFAULT_SETTINGS: GameSettings = {
	numberOfTracks: 10,
	timelineTarget: 6,
	selectedTracklist: 'beginner',
	trackLength: 30,
	volume: 100,
	gameMode: 'timeline',
	players: [],
	enableScoring: true,
	bingoGrid: undefined,
	enableAudioNormalization: !isWebKit, // Default to true, but false on WebKit browsers
	buzzerVolume: 0.75,
	gamesPlayed: 0,
	dailyChallengePlayedDate: null,
	leaderboardPublishing: {
		allowedNames: [],
		deniedNames: []
	}
};
