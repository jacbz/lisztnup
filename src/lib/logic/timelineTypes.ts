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
	currentStreak: number;
	longestStreak: number;
	score: number;
	reachedTarget: boolean;
	efficiencyBonus: number;
}

/** Full breakdown of a single turn's score computation. */
export interface TurnScoreBreakdown {
	baseScore: number;
	difficultyBonus: number;
	gap: number;
	boundaryDistance: number;
	/** True when the card was placed at the start or end of the timeline. */
	isEdgePlacement: boolean;
	masteryBonus: number;
	correctSoFar: number;
	attemptsSoFar: number;
	speedMult: number;
	secondsTaken: number;
	streakMult: number;
	streakCount: number;
	rawScore: number;
	totalScore: number;
}

/** Breakdown of consolation points awarded on an incorrect placement. */
export interface ConsolationBreakdown {
	consolationScore: number;
	gap: number;
	gapFactor: number;
	edgeDist: number;
	edgeFactor: number;
	timeMultiplier: number;
}

// ─── Enumerations ──────────────────────────────────────────

/** Drag-and-drop flavours. */
export type DragKind = 'none' | 'center' | 'pending';

/** Turn-phase progression: idle → playing → locked (after drag starts). */
export type TurnPhase = 'idle' | 'playing' | 'locked';
