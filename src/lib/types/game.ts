export type GuessCategory = 'composer' | 'decade' | 'year' | 'composition' | 'type';

export type GameState = 'loading' | 'home' | 'settings' | 'game';

export interface RoundState {
	currentTrackIndex: number;
	category: GuessCategory | null;
	isRevealed: boolean;
	isPlaying: boolean;
}
