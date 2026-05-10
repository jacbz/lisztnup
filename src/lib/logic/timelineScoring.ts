/**
 * Implements the scoring logic as specified in SCORING.md.
 * It must be kept in sync (including variable names) with the formulas and descriptions in that document, which is the source of truth for how scoring works.
 */
import { MIN_WORK_YEAR, MAX_WORK_YEAR } from '$lib/types/settings';
import type { TurnScoreBreakdown, ConsolationBreakdown } from './timelineTypes';

export interface TimelineScoringParameters {
	readonly id: string;
	readonly label: string;
	readonly base: number;
	readonly difficultyMax: number;
	readonly difficultyDecayRate: number;
	readonly minimumGap: number;
	readonly speedBonus: number;
	readonly speedWindowSeconds: number;
	readonly speedMaxBonusAtSeconds: number;
	readonly streakMultiplierTiers: readonly { streak: number; multiplier: number }[];
	readonly maxStreakMultiplier: number;
	readonly maxStreakMultiplierAt: number;
	readonly missStreakDivisor: number;
	readonly missStreakSubtract: number;
	readonly completionRate: number;
	readonly completionFlawlessMultiplier: number;
	readonly consolationBase: number;
	readonly consolationHalfLifeYears: number;
	readonly consolationFadeStartAttemptsMultiplier: number;
	readonly consolationFadeEndAttemptsMultiplier: number;
}

export const PRODUCTION_TIMELINE_SCORING = {
	id: 'production',
	label: 'Production',
	base: 1000,
	difficultyMax: 1000,
	difficultyDecayRate: 0.0115,
	minimumGap: 0,
	speedBonus: 0.25,
	speedWindowSeconds: 20,
	speedMaxBonusAtSeconds: 1,
	streakMultiplierTiers: [
		{ streak: 2, multiplier: 1.1 },
		{ streak: 3, multiplier: 1.35 },
		{ streak: 4, multiplier: 1.55 },
		{ streak: 5, multiplier: 1.75 }
	],
	maxStreakMultiplier: 2.0,
	maxStreakMultiplierAt: 6,
	missStreakDivisor: 2,
	missStreakSubtract: 3,
	completionRate: 1000,
	completionFlawlessMultiplier: 1.2,
	consolationBase: 100,
	consolationHalfLifeYears: 20,
	consolationFadeStartAttemptsMultiplier: 3,
	consolationFadeEndAttemptsMultiplier: 4
} as const satisfies TimelineScoringParameters;

export const base = PRODUCTION_TIMELINE_SCORING.base;
export const difficultyMax = PRODUCTION_TIMELINE_SCORING.difficultyMax;
export const minimumGap = PRODUCTION_TIMELINE_SCORING.minimumGap;
export const speedBonus = PRODUCTION_TIMELINE_SCORING.speedBonus;
export const completionRate = PRODUCTION_TIMELINE_SCORING.completionRate;
export const completionFlawlessMultiplier =
	PRODUCTION_TIMELINE_SCORING.completionFlawlessMultiplier;

/**
 * Difficulty bonus based on chronological window size.
 * Uses an exponential decay curve to reward precision.
 */
export function calculateDiff(
	gap: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): number {
	return parameters.difficultyMax * Math.exp(-parameters.difficultyDecayRate * gap);
}

/**
 * Speed multiplier based on how quickly the player placed the card.
 * Uses a quadratic curve: sub-3s answers are dramatically more rewarding.
 * Divides by 19 so that 1s taken yields the maximum bonus
 * while 0s (instant) is only marginally better. Returns exactly 1.0 for times ≥ 20s.
 */
export function calculateSpeed(
	seconds: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): number {
	const denominator = Math.max(
		1,
		parameters.speedWindowSeconds - parameters.speedMaxBonusAtSeconds
	);
	return (
		1.0 +
		parameters.speedBonus *
			(Math.max(0, parameters.speedWindowSeconds - seconds) / denominator) ** 2
	);
}

/**
 * Streak multiplier for consecutive correct placements.
 * The streak counter should already be incremented for the current turn.
 */
export function calculateStreakMult(
	streak: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): number {
	if (streak <= 1) return 1.0;
	if (streak >= parameters.maxStreakMultiplierAt) return parameters.maxStreakMultiplier;

	const tier = parameters.streakMultiplierTiers.find((candidate) => candidate.streak === streak);
	if (tier) return tier.multiplier;

	return 1.0;
}

export function calculateMissStreak(
	streak: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): number {
	return Math.max(
		0,
		Math.min(
			Math.floor(streak / parameters.missStreakDivisor),
			streak - parameters.missStreakSubtract
		)
	);
}

/**
 * One-time completion bonus awarded when a player reaches the target.
 * Only players who reach the target receive this.
 */
export function calculateCompletion(
	target: number,
	attempts: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): number {
	if (attempts <= 0) return 0;
	const cardsNeeded = Math.max(0, target - 1);
	if (cardsNeeded <= 0) return 0;

	const flawlessMult = attempts === cardsNeeded ? parameters.completionFlawlessMultiplier : 1.0;
	return Math.round(
		(cardsNeeded / attempts) ** 2 * (cardsNeeded * parameters.completionRate) * flawlessMult
	);
}

/**
 * Calculate the year gap between the two neighbours of a newly placed card.
 * For edge placements (one neighbour missing), uses the dataset boundary
 * (MIN_WORK_YEAR / MAX_WORK_YEAR) as the virtual neighbour so that edge
 * cards are scored against a realistic range rather than a mirrored gap.
 * Enforces a minimum gap of 25 years to prevent extreme difficulty bonuses
 * from near-identical placements.
 */
export function calculateGap(
	leftYear: number | null,
	rightYear: number | null,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING,
	minYear: number = MIN_WORK_YEAR,
	maxYear: number = MAX_WORK_YEAR
): number {
	const left = leftYear ?? minYear;
	const right = rightYear ?? maxYear;

	if (leftYear === null && rightYear === null) {
		// First card on the timeline — use full span
		return maxYear - minYear;
	}

	return Math.max(parameters.minimumGap, right - left);
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
export function calculateTurnScore(
	input: TurnScoreInput,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING
): TurnScoreBreakdown {
	const diff = Math.round(calculateDiff(input.gap, parameters));
	const speed = calculateSpeed(input.seconds, parameters);
	const streakMult = calculateStreakMult(input.streak, parameters);

	const scoreBeforeStreak = Math.round((parameters.base + diff) * speed);
	const score = Math.round(scoreBeforeStreak * streakMult);

	return {
		base: parameters.base,
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
	attempts: number,
	parameters: TimelineScoringParameters = PRODUCTION_TIMELINE_SCORING,
	minYear: number = MIN_WORK_YEAR,
	maxYear: number = MAX_WORK_YEAR
): ConsolationBreakdown {
	const left = leftYear ?? minYear;
	const right = rightYear ?? maxYear;
	const dErr = Math.min(Math.abs(cardYear - left), Math.abs(cardYear - right));
	const cardsNeeded = Math.max(0, target - 1);
	const fadeStart = parameters.consolationFadeStartAttemptsMultiplier * cardsNeeded;
	const fadeEnd = parameters.consolationFadeEndAttemptsMultiplier * cardsNeeded;
	const timeF =
		cardsNeeded <= 0
			? 0
			: attempts <= fadeStart
				? 1
				: Math.max(0, Math.min(1, (fadeEnd - attempts) / Math.max(1, fadeEnd - fadeStart)));

	const baseConsolation = Math.round(
		parameters.consolationBase * 0.5 ** (dErr / parameters.consolationHalfLifeYears)
	);
	const consolation = Math.round(baseConsolation * timeF);

	return { consolation, dErr, timeF };
}
