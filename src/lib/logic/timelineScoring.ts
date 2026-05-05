/**
 * Implements the scoring logic as specified in SCORING.md.
 * It must be kept in sync (including variable names) with the formulas and descriptions in that document, which is the source of truth for how scoring works.
 */
import { MIN_WORK_YEAR, MAX_WORK_YEAR } from '$lib/types/settings';
import type { TurnScoreBreakdown, ConsolationBreakdown } from './timelineTypes';

export const base = 1000;
export const masteryCap = 500;
export const speedBonus = 0.25;
export const completionRate = 750;

/**
 * Difficulty bonus based on total slot density.
 */
export function calculateDiff(gap: number): number {
	return 2310 * (10 / (gap + 10));
}

/**
 * Speed multiplier based on how quickly the player placed the card.
 * Uses a quadratic curve: sub-3s answers are dramatically more rewarding.
 * Divides by 19 so that 1s taken yields the maximum bonus
 * while 0s (instant) is only marginally better. Returns exactly 1.0 for times ≥ 20s.
 */
export function calculateSpeed(seconds: number): number {
	return 1.0 + speedBonus * (Math.max(0, 20 - seconds) / 19) ** 2;
}

/**
 * Streak multiplier for consecutive correct placements.
 * The streak counter should already be incremented for the current turn.
 */
export function calculateStreakMult(streak: number): number {
	if (streak <= 1) return 1.0;
	if (streak === 2) return 1.1;
	if (streak === 3) return 1.35;
	if (streak === 4) return 1.55;
	if (streak === 5) return 1.75;
	if (streak >= 6) return 2.0;
	return 1.0;
}

/**
 * One-time completion bonus awarded when a player reaches the target.
 * Only players who reach the target receive this.
 */
export function calculateCompletion(target: number, attempts: number): number {
	if (attempts <= 0) return 0;
	return Math.round((target / attempts) ** 2 * (target * completionRate));
}

/**
 * Mastery bonus based on accuracy with a one-mistake grace.
 * Mastery = masteryCap × min(1, correct / max(correct, attempts - 1))²
 */
export function calculateMastery(correct: number, attempts: number): number {
	if (attempts <= 0) return 0;
	const acc = Math.min(1, correct / Math.max(correct, attempts - 1));
	return masteryCap * acc * acc;
}

/**
 * Calculate the year gap between the two neighbours of a newly placed card.
 * For edge placements (one neighbour missing), uses the dataset boundary
 * (MIN_WORK_YEAR / MAX_WORK_YEAR) as the virtual neighbour so that edge
 * cards are scored against a realistic range rather than a mirrored gap.
 * Enforces a minimum gap of 25 years to prevent extreme difficulty bonuses
 * from near-identical placements.
 */
export function calculateGap(leftYear: number | null, rightYear: number | null): number {
	const left = leftYear ?? MIN_WORK_YEAR;
	const right = rightYear ?? MAX_WORK_YEAR;

	if (leftYear === null && rightYear === null) {
		// First card on the timeline — use full span
		return MAX_WORK_YEAR - MIN_WORK_YEAR;
	}

	return Math.max(25, right - left);
}

// ─── Composite score calculation ───────────────────────────

export interface TurnScoreInput {
	gap: number;
	seconds: number;
	/** Streak count *after* incrementing for this correct turn. */
	streak: number;
	/** True when the card was placed at the start or end of the timeline. */
	isEdgePlacement?: boolean;
	/** Correct placements so far (including this one). */
	correct: number;
	/** Total attempts so far (including this one). */
	attempts: number;
}

/**
 * Calculate the full turn score breakdown for a correct placement.
 * All intermediate values are kept at full precision; round only for display.
 */
export function calculateTurnScore(input: TurnScoreInput): TurnScoreBreakdown {
	const diff = Math.round(calculateDiff(input.gap));
	const mastery = Math.round(calculateMastery(input.correct, input.attempts));
	const speed = calculateSpeed(input.seconds);
	const streakMult = calculateStreakMult(input.streak);

	const scoreBeforeStreak = Math.round((base + diff + mastery) * speed);
	const score = Math.round(scoreBeforeStreak * streakMult);

	return {
		base,
		diff,
		gap: input.gap,
		isEdgePlacement: input.isEdgePlacement ?? false,
		mastery,
		correct: input.correct,
		attempts: input.attempts,
		speed,
		seconds: input.seconds,
		streakMult,
		streak: input.streak,
		scoreBeforeStreak,
		score
	};
}

// ─── Consolation score for incorrect placements ────────────

/**
 * Small consolation bonus for incorrect placements, scaled by how
 * genuinely difficult the correct slot was.
 *
 * Formula: round(max(1, round(75 × gapF × edgeF)) × timeF)
 *   gapF  = max(0, (150 - gap) / 150)
 *   edgeF = max(0, (50 - dErr) / 50)
 *   timeF = max(0, min(1, (4 × target - attempts) / target))
 *
 * @param gap        Year distance between the two boundary cards of the correct slot.
 * @param cardYear   The true year of the placed card.
 * @param leftYear   Year of the left boundary card (null if card belongs at far left).
 * @param rightYear  Year of the right boundary card (null if card belongs at far right).
 * @param target     Target card count for the game.
 * @param attempts   Player attempts so far, including this miss.
 */
export function calculateConsolationScore(
	gap: number,
	cardYear: number,
	leftYear: number | null,
	rightYear: number | null,
	target: number,
	attempts: number
): ConsolationBreakdown {
	const left = leftYear ?? MIN_WORK_YEAR;
	const right = rightYear ?? MAX_WORK_YEAR;
	const dErr = Math.min(cardYear - left, right - cardYear);

	const isEdgeSlot = leftYear === null || rightYear === null;
	const boundaryYear = leftYear ?? rightYear ?? cardYear;
	const consolationGap = isEdgeSlot ? Math.abs(boundaryYear - cardYear) * 4 : gap;

	const gapF = Math.max(0, (150 - consolationGap) / 150);
	const edgeF = Math.max(0, (50 - dErr) / 50);
	const timeF = target > 0 ? Math.max(0, Math.min(1, (4 * target - attempts) / target)) : 0;

	const baseConsolation = Math.max(1, Math.round(75 * gapF * edgeF));
	const consolation = Math.round(baseConsolation * timeF);

	return { consolation, gap: consolationGap, gapF, dErr, edgeF, timeF };
}
