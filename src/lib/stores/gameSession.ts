import { writable, derived } from 'svelte/store';
import type { GameMode, Player, RoundScore, GameSession } from '$lib/types';

function createGameSessionStore() {
	const initialSession: GameSession = {
		mode: 'bingo',
		players: [],
		rounds: [],
		isSoloMode: false
	};

	const { subscribe, set, update } = writable<GameSession>(initialSession);

	return {
		subscribe,

		/**
		 * Start a new game session
		 */
		startSession: (mode: GameMode, players: Player[], isSoloMode: boolean = false) => {
			set({
				mode,
				players: players.map((p) => ({ ...p, score: 0 })),
				rounds: [],
				isSoloMode
			});
		},

		/**
		 * Record scores for the current round
		 */
		recordRound: (roundIndex: number, playerScores: Record<string, number>) => {
			update((session) => {
				// Update player total scores (using name as identifier)
				const updatedPlayers = session.players.map((player) => ({
					...player,
					score: player.score + (playerScores[player.name] || 0)
				}));

				// Add round to history
				const newRound: RoundScore = {
					roundIndex,
					playerScores
				};

				return {
					...session,
					players: updatedPlayers,
					rounds: [...session.rounds, newRound]
				};
			});
		},

		/**
		 * Reset the game session
		 */
		reset: () => {
			set(initialSession);
		},

		/**
		 * Get current session state (for reading in components)
		 */
		get: (): GameSession => {
			let session: GameSession = initialSession;
			subscribe((s) => (session = s))();
			return session;
		}
	};
}

export const gameSession = createGameSessionStore();

// Derived store for the current leader
export const currentLeader = derived(gameSession, ($session) => {
	if ($session.players.length === 0) return null;

	return $session.players.reduce(
		(leader, player) => (player.score > leader.score ? player : leader),
		$session.players[0]
	);
});

// Derived store for sorted players (by score, descending)
export const sortedPlayers = derived(gameSession, ($session) => {
	return [...$session.players].sort((a, b) => b.score - a.score);
});
