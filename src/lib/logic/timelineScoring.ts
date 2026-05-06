/**
 * Implements the scoring logic as specified in SCORING.md.
 * It must be kept in sync (including variable names) with the formulas and descriptions in that document, which is the source of truth for how scoring works.
 */
import { MIN_WORK_YEAR, MAX_WORK_YEAR } from '$lib/types/settings';
import type { TurnScoreBreakdown, ConsolationBreakdown } from './timelineTypes';

export const base = 1000;
export const speedBonus = 0.25;
export const completionRate = 1000;

/**
 * Difficulty bonus based on total slot density.
 */
export function calculateDiff(gap: number): number {
	return 3500 * (10 / (gap + 10));
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
	const cardsNeeded = Math.max(0, target - 1);
	if (cardsNeeded <= 0) return 0;

	const flawlessMult = attempts === cardsNeeded ? 1.2 : 1.0;
	return Math.round((cardsNeeded / attempts) ** 2 * (target * completionRate) * flawlessMult);
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
}

/**
 * Calculate the full turn score breakdown for a correct placement.
 * All intermediate values are kept at full precision; round only for display.
 */
export function calculateTurnScore(input: TurnScoreInput): TurnScoreBreakdown {
	const diff = Math.round(calculateDiff(input.gap));
	const speed = calculateSpeed(input.seconds);
	const streakMult = calculateStreakMult(input.streak);

	const scoreBeforeStreak = Math.round((base + diff) * speed);
	const score = Math.round(scoreBeforeStreak * streakMult);

	return {
		base,
		diff,
		gap: input.gap,
		isEdgePlacement: input.isEdgePlacement ?? false,
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
 * Small consolation bonus for incorrect placements, scaled by chronological
 * distance from the nearest boundary of the correct slot.
 *
 * Formula: round(round(100 × 0.5^(dErr / 20)) × timeF)
 *   cardsNeeded = target - 1
 *   timeF = max(0, min(1, (4 × cardsNeeded - attempts) / cardsNeeded))
 *
 * @param cardYear   The true year of the placed card.
 * @param leftYear   Year of the left boundary card (null if card belongs at far left).
 * @param rightYear  Year of the right boundary card (null if card belongs at far right).
 * @param target     Target card count for the game.
 * @param attempts   Player attempts so far, including this miss.
 */
export function calculateConsolationScore(
	cardYear: number,
	leftYear: number | null,
	rightYear: number | null,
	target: number,
	attempts: number
): ConsolationBreakdown {
	const left = leftYear ?? MIN_WORK_YEAR;
	const right = rightYear ?? MAX_WORK_YEAR;
	const dErr = Math.min(cardYear - left, right - cardYear);
	const cardsNeeded = Math.max(0, target - 1);
	const timeF =
		cardsNeeded > 0 ? Math.max(0, Math.min(1, (4 * cardsNeeded - attempts) / cardsNeeded)) : 0;

	const baseConsolation = Math.round(100 * 0.5 ** (dErr / 20));
	const consolation = Math.round(baseConsolation * timeF);

	return { consolation, dErr, timeF };
}
