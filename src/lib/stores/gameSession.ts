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
		 * Starts a new game session with the given mode and players.
		 * @param mode The game mode to start.
		 * @param players An array of players.
		 * @param isSoloMode Whether the game is in solo mode.
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
		 * Records the scores for the current round and updates player totals.
		 * @param roundIndex The index of the round being recorded.
		 * @param playerScores A record of player names to their scores for the round.
		 */
		recordRound: (roundIndex: number, playerScores: Record<string, number>) => {
			update((session) => {
				const updatedPlayers = session.players.map((player) => ({
					...player,
					score: player.score + (playerScores[player.name] || 0)
				}));

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
		 * Resets the game session to its initial state.
		 */
		reset: () => {
			set(initialSession);
		}
	};
}

/**
 * Manages the state of the current game session, including players, rounds, and scores.
 * To access the session data in a Svelte component, use the `$gameSession` syntax.
 */
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
