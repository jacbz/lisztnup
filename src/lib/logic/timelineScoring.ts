import { MIN_WORK_YEAR, MAX_WORK_YEAR } from '$lib/types/settings';
import type { TurnScoreBreakdown } from './timelineTypes';

// ─── Constants ─────────────────────────────────────────────

export const BASE_SCORE = 1000;
export const MAX_SPEED_TIME = 20;
export const SPEED_BONUS_COEFFICIENT = 0.25;
export const TOTAL_SPAN = MAX_WORK_YEAR - MIN_WORK_YEAR;

/** Streak multiplier tiers. Index = streak count. */
const STREAK_MULTIPLIERS: Record<number, number> = {
	1: 1.0,
	2: 1.05,
	3: 1.2,
	4: 1.3,
	5: 1.4
};
const STREAK_CAP_MULTIPLIER = 1.5;

// ─── Pure scoring functions ────────────────────────────────

/**
 * Difficulty bonus based on the year gap between adjacent cards.
 * Narrow gaps are dramatically more rewarding.
 */
export function calculateDifficultyBonus(gap: number): number {
	return 2310 * (10 / (gap + 10));
}

/**
 * Speed multiplier based on how quickly the player placed the card.
 * Uses a quadratic curve: sub-3s answers are dramatically more rewarding.
 * Divides by (MAX_SPEED_TIME - 1) so that 1s taken yields the maximum bonus
 * while 0s (instant) is only marginally better. Returns exactly 1.0 for times ≥ 20s.
 */
export function calculateSpeedMultiplier(secondsTaken: number): number {
	const clamped = Math.max(0, MAX_SPEED_TIME - secondsTaken);
	return 1.0 + SPEED_BONUS_COEFFICIENT * (clamped / (MAX_SPEED_TIME - 1)) ** 2;
}

/**
 * Streak multiplier for consecutive correct placements.
 * The streak counter should already be incremented for the current turn.
 */
export function getStreakMultiplier(streakCount: number): number {
	if (streakCount <= 0) return 1.0;
	if (streakCount >= 6) return STREAK_CAP_MULTIPLIER;
	return STREAK_MULTIPLIERS[streakCount] ?? 1.0;
}

/**
 * One-time efficiency bonus awarded when a player reaches the target.
 * Only players who reach the target receive this.
 */
export function calculateEfficiencyBonus(target: number, totalAttempts: number): number {
	if (totalAttempts <= 0) return 0;
	return Math.round((target / totalAttempts) * (target * 500));
}

/**
 * Mastery bonus based on current accuracy (correct / attempts)².
 * Rewards sustained accuracy throughout the game.
 */
export function calculateMasteryBonus(correctSoFar: number, attemptsSoFar: number): number {
	if (attemptsSoFar <= 0) return 0;
	const ratio = correctSoFar / attemptsSoFar;
	return 500 * ratio * ratio;
}

const MIN_GAP = 25;

/**
 * Calculate the year gap between the two neighbours of a newly placed card.
 * For edge placements (one neighbour missing), uses the dataset boundary
 * (MIN_WORK_YEAR / MAX_WORK_YEAR) as the virtual neighbour so that edge
 * cards are scored against a realistic range rather than a mirrored gap.
 * Enforces a minimum gap of MIN_GAP to prevent extreme difficulty bonuses
 * from near-identical placements.
 */
export function calculateGap(
	leftYear: number | null,
	rightYear: number | null
): number {
	const left = leftYear ?? MIN_WORK_YEAR;
	const right = rightYear ?? MAX_WORK_YEAR;

	if (leftYear === null && rightYear === null) {
		// First card on the timeline — use full span
		return TOTAL_SPAN;
	}

	return Math.max(MIN_GAP, right - left);
}

// ─── Composite score calculation ───────────────────────────

export interface TurnScoreInput {
	gap: number;
	secondsTaken: number;
	/** Streak count *after* incrementing for this correct turn. */
	streakCount: number;
	/** True when the card was placed at the start or end of the timeline. */
	isEdgePlacement?: boolean;
	/** Correct placements so far (including this one). */
	correctSoFar: number;
	/** Total attempts so far (including this one). */
	attemptsSoFar: number;
}

/**
 * Calculate the full turn score breakdown for a correct placement.
 * All intermediate values are kept at full precision; round only for display.
 */
export function calculateTurnScore(input: TurnScoreInput): TurnScoreBreakdown {
	const difficultyBonus = Math.round(calculateDifficultyBonus(input.gap));
	const masteryBonus = Math.round(calculateMasteryBonus(input.correctSoFar, input.attemptsSoFar));
	const speedMult = calculateSpeedMultiplier(input.secondsTaken);
	const streakMult = getStreakMultiplier(input.streakCount);

	const rawScore = Math.round((BASE_SCORE + difficultyBonus + masteryBonus) * speedMult);
	const totalScore = Math.round(rawScore * streakMult);

	return {
		baseScore: BASE_SCORE,
		difficultyBonus,
		gap: input.gap,
		isEdgePlacement: input.isEdgePlacement ?? false,
		masteryBonus,
		correctSoFar: input.correctSoFar,
		attemptsSoFar: input.attemptsSoFar,
		speedMult,
		secondsTaken: input.secondsTaken,
		streakMult,
		streakCount: input.streakCount,
		rawScore,
		totalScore
	};
}
