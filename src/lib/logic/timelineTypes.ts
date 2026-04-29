import type { Player, Track } from '$lib/types';

// ─── Data types ────────────────────────────────────────────

/** A single entry in a player's timeline. */
export interface TimelineEntry {
	id: string;
	track: Track;
	confirmed: boolean;
	correct: boolean | null;
	isDiscarding?: boolean;
}

/** A card on the visual center stack. Sub-cards reuse the top card's track as a placeholder. */
export interface StackItem {
	track: Track;
	id: string;
}

/** A player's timeline row (player + their entries). */
export interface TimelineRow {
	player: Player;
	entries: TimelineEntry[];
	totalPlacements: number;
	correctPlacements: number;
}

// ─── Enumerations ──────────────────────────────────────────

/** Drag-and-drop flavours. */
export type DragKind = 'none' | 'center' | 'pending';

/** Turn-phase progression: idle → playing → locked (after drag starts). */
export type TurnPhase = 'idle' | 'playing' | 'locked';
