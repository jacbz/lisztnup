import { ALL_EDGES, type PlayerEdge } from '$lib/types';

/**
 * Screen edges to occupy for a given player count, used by modes where every
 * player shares a single broadcast display (Classic, Buzzer).
 *
 * 1 player → bottom only; 2 → bottom + top; 3+ → all four edges. This mirrors
 * the seating arrangement of players around a flat tablet.
 */
export function edgesForPlayerCount(count: number): PlayerEdge[] {
	if (count < 2) return ['bottom'];
	if (count < 3) return ['bottom', 'top'];
	return ALL_EDGES;
}
