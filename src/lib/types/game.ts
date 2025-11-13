export type GuessCategory = 'composer' | 'decade' | 'era' | 'work' | 'type';
export const ALL_CATEGORIES: GuessCategory[] = ['composer', 'decade', 'era', 'work', 'type'];

export type GameMode = 'classic' | 'buzzer' | 'bingo';

export type GameState = 'loading' | 'home' | 'settings' | 'generating' | 'game';

// Player color palette
export const PLAYER_COLORS = [
	'#ef4444', // red-500
	'#3b82f6', // blue-500
	'#10b981', // green-500
	'#f59e0b', // amber-500
	'#8b5cf6', // violet-500
	'#ec4899', // pink-500
	'#06b6d4', // cyan-500
	'#f97316', // orange-500
	'#14b8a6', // teal-500
	'#a855f7' // purple-500
];

// Category scoring points
export const CATEGORY_POINTS: Record<GuessCategory, number> = {
	work: 15,
	decade: 20,
	composer: 9,
	era: 4,
	type: 2
};

// Buzzer mode time percentages (of track duration)
// Takes first n elements and normalizes them based on number of categories
export const BUZZER_TIME_PERCENTAGES = [2, 1];

export interface Player {
	name: string; // name is now the unique identifier
	color: string;
	score: number;
}

export interface RoundState {
	currentTrackIndex: number;
	category: GuessCategory | null;
	isSpinning: boolean;
	isPlaying: boolean;
	playbackEnded: boolean;
	isRevealed: boolean;
}

export interface RoundScore {
	roundIndex: number;
	playerScores: Record<string, number>; // playerId -> score for this round
}

export interface GameSession {
	mode: GameMode;
	players: Player[];
	rounds: RoundScore[];
	isSoloMode: boolean;
}
