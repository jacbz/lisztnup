import type { Track } from '$lib/models';
import type { Player } from '$lib/types';
import type { TimelineReplayTurn } from '$lib/types/timelineReplay';

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
	currentStreak: number;
	absoluteStreak: number;
	longestStreak: number;
	score: number;
	reachedTarget: boolean;
	completionBonus: number;
	initialPartGid: string;
	replayTurns: TimelineReplayTurn[];
}

/** Full breakdown of a single turn's score computation. */
export interface TurnScoreBreakdown {
	base: number;
	diff: number;
	gap: number;
	/** True when the card was placed at the start or end of the timeline. */
	isEdgePlacement: boolean;
	speed: number;
	seconds: number;
	streakMult: number;
	streak: number;
	scoreBeforeStreak: number;
	score: number;
}

/** Breakdown of consolation points awarded on an incorrect placement. */
export interface ConsolationBreakdown {
	consolation: number;
	dErr: number;
	timeF: number;
}

// ─── Enumerations ──────────────────────────────────────────

/** Drag-and-drop flavours. */
export type DragKind = 'none' | 'center' | 'pending';

/** Turn-phase progression: idle → playing → locked (after drag starts). */
export type TurnPhase = 'idle' | 'playing' | 'locked';
