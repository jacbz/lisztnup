import { MIN_WORK_YEAR, MAX_WORK_YEAR } from '$lib/types/settings';
import type { TurnScoreBreakdown, ConsolationBreakdown } from './timelineTypes';

// ─── Constants ─────────────────────────────────────────────

export const BASE_SCORE = 1000;
export const MAX_SPEED_TIME = 20;
export const SPEED_BONUS_COEFFICIENT = 0.25;
export const TOTAL_SPAN = MAX_WORK_YEAR - MIN_WORK_YEAR;
export const DIFFICULTY_EDGE_WEIGHT = 0.15;

/** Streak multiplier tiers. Index = streak count. */
const STREAK_MULTIPLIERS: Record<number, number> = {
	1: 1.0,
	2: 1.1,
	3: 1.35,
	4: 1.55,
	5: 1.75
};
const STREAK_CAP_MULTIPLIER = 2.0;

// ─── Pure scoring functions ────────────────────────────────

/**
 * Difficulty bonus based on total slot gap, blended toward boundary closeness.
 * Close calls near an existing card are more rewarding than centered placements.
 */
export function calculateDifficultyBonus(
	totalGap: number,
	boundaryDistance: number,
	edgeWeight = DIFFICULTY_EDGE_WEIGHT
): number {
	const basePts = 2310 * (10 / (totalGap + 10));
	const edgePts = 2310 * (10 / (boundaryDistance * 2 + 10));
	return basePts + edgeWeight * (edgePts - basePts);
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
	return Math.round((target / totalAttempts) ** 2 * (target * 750));
}

/**
 * Mastery bonus based on accuracy with a one-mistake grace.
 * Mastery_Acc = min(1, correct / max(correct, attempts - 1))
 * Mastery_Bonus = 500 × Mastery_Acc²
 */
export function calculateMasteryBonus(correctSoFar: number, attemptsSoFar: number): number {
	if (attemptsSoFar <= 0) return 0;
	const acc = Math.min(1, correctSoFar / Math.max(correctSoFar, attemptsSoFar - 1));
	return 500 * acc * acc;
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
export function calculateGap(leftYear: number | null, rightYear: number | null): number {
	const left = leftYear ?? MIN_WORK_YEAR;
	const right = rightYear ?? MAX_WORK_YEAR;

	if (leftYear === null && rightYear === null) {
		// First card on the timeline — use full span
		return TOTAL_SPAN;
	}

	return Math.max(MIN_GAP, right - left);
}

/**
 * Distance from the placed card to the nearest real boundary card.
 * Edge placements have one boundary card; the first card has none and falls
 * back to the total slot gap to keep its difficulty near the minimum.
 */
export function calculateBoundaryDistance(
	cardYear: number,
	leftYear: number | null,
	rightYear: number | null,
	totalGap: number
): number {
	const distances: number[] = [];
	if (leftYear !== null) distances.push(Math.abs(cardYear - leftYear));
	if (rightYear !== null) distances.push(Math.abs(rightYear - cardYear));

	return distances.length > 0 ? Math.max(0, Math.min(...distances)) : totalGap;
}

// ─── Composite score calculation ───────────────────────────

export interface TurnScoreInput {
	gap: number;
	boundaryDistance: number;
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
	const difficultyBonus = Math.round(calculateDifficultyBonus(input.gap, input.boundaryDistance));
	const masteryBonus = Math.round(calculateMasteryBonus(input.correctSoFar, input.attemptsSoFar));
	const speedMult = calculateSpeedMultiplier(input.secondsTaken);
	const streakMult = getStreakMultiplier(input.streakCount);

	const rawScore = Math.round((BASE_SCORE + difficultyBonus + masteryBonus) * speedMult);
	const totalScore = Math.round(rawScore * streakMult);

	return {
		baseScore: BASE_SCORE,
		difficultyBonus,
		gap: input.gap,
		boundaryDistance: input.boundaryDistance,
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

// ─── Consolation score for incorrect placements ────────────

/**
 * Small consolation bonus for incorrect placements, scaled by how
 * genuinely difficult the correct slot was.
 *
 * Formula: round(max(1, round(75 × gapFactor × edgeFactor)) × timeMult)
 *   gapFactor  = max(0, (150 - gap) / 150)
 *   edgeFactor = max(0, (50 - edgeDist) / 50)
 *   timeMult   = max(0, min(1, (3 × target - attempts) / target))
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
	const edgeDist = Math.min(cardYear - left, right - cardYear);

	const isEdgeSlot = leftYear === null || rightYear === null;
	const boundaryYear = leftYear ?? rightYear ?? cardYear;
	const effectiveGap = isEdgeSlot ? Math.abs(boundaryYear - cardYear) * 4 : gap;

	const gapFactor = Math.max(0, (150 - effectiveGap) / 150);
	const edgeFactor = Math.max(0, (50 - edgeDist) / 50);
	const timeMultiplier =
		target > 0 ? Math.max(0, Math.min(1, (3 * target - attempts) / target)) : 0;

	const baseConsolation = Math.max(1, Math.round(75 * gapFactor * edgeFactor));
	const consolationScore = Math.round(baseConsolation * timeMultiplier);

	return { consolationScore, gap: effectiveGap, gapFactor, edgeDist, edgeFactor, timeMultiplier };
}
