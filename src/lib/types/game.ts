export type GuessCategory = 'composer' | 'decade' | 'era' | 'composition' | 'form';

export type GameState = 'loading' | 'home' | 'settings' | 'generating' | 'game';

export interface RoundState {
	currentTrackIndex: number;
	category: GuessCategory | null;
	isSpinning: boolean;
	isPlaying: boolean;
	playbackEnded: boolean;
	isRevealed: boolean;
}
