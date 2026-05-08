import type { ParameterSetSummary, PersonaSummary, SuiteReport, SuiteWarning } from './types';

const SKILL_MEAN_TOLERANCE = 250;
const LEADERBOARD_RISK_THRESHOLD = 0.001;
const FARMER_TO_CASUAL_MEAN_LIMIT = 0.8;
const SKILL_LADDER = ['random', 'new-listener', 'casual', 'careful-casual', 'enthusiast', 'expert'];

interface PersonaOrderViolation {
	lowerSkill: PersonaSummary;
	higherSkill: PersonaSummary;
	margin: number;
}

export function buildWarnings(report: SuiteReport): SuiteWarning[] {
	const warnings: SuiteWarning[] = [];
	for (const parameterSet of report.parameterSets) {
		const personas =
			report.soloPersonasBySet[parameterSet.id] ?? report.personasBySet[parameterSet.id] ?? [];
		warnings.push(...buildPersonaOrderingWarnings(parameterSet, personas));
		const leaderboardRisk = buildLeaderboardRiskWarning(parameterSet);
		if (leaderboardRisk) warnings.push(leaderboardRisk);
		const randomTail = buildRandomTailWarning(parameterSet, personas);
		if (randomTail) warnings.push(randomTail);
		const farmerMean = buildFarmerMeanWarning(parameterSet, personas);
		if (farmerMean) warnings.push(farmerMean);
	}
	return warnings;
}

export function countPersonaMeanOrderViolations(personas: readonly PersonaSummary[]): number {
	return findPersonaOrderViolations(personas).length;
}

function buildPersonaOrderingWarnings(
	parameterSet: ParameterSetSummary,
	personas: readonly PersonaSummary[]
): SuiteWarning[] {
	return findPersonaOrderViolations(personas).map(({ lowerSkill, higherSkill, margin }) => ({
		code: 'persona-ordering',
		severity: 'warn',
		scope: 'solo',
		parameterSetId: parameterSet.id,
		parameterSetLabel: parameterSet.label,
		title: `${lowerSkill.label} mean beats ${higherSkill.label} mean by ${formatScore(margin)}.`,
		observed: `Solo ${lowerSkill.label} mean ${formatScore(lowerSkill.score.mean)} > solo ${higherSkill.label} mean ${formatScore(higherSkill.score.mean)}.`,
		expected: `${higherSkill.label} should be no more than ${formatScore(SKILL_MEAN_TOLERANCE)} points below ${lowerSkill.label}, and ideally above it.`,
		explanation:
			'Mean score should generally rise with the modeled skill ladder. An inversion means the scoring formula or persona model is rewarding lower-skill behavior too much.',
		recommendation:
			'Compare their accuracy, completion, speed, and streak metrics; then tune easy-placement value, speed rewards, completion rewards, or the weaker persona model.',
		metrics: {
			lowerSkillPersona: lowerSkill.id,
			higherSkillPersona: higherSkill.id,
			lowerSkillMean: round(lowerSkill.score.mean),
			higherSkillMean: round(higherSkill.score.mean),
			margin: round(margin),
			tolerance: SKILL_MEAN_TOLERANCE,
			lowerSkillAccuracy: round(lowerSkill.accuracy.mean),
			higherSkillAccuracy: round(higherSkill.accuracy.mean),
			lowerSkillCompletionRate: round(lowerSkill.completionRate),
			higherSkillCompletionRate: round(higherSkill.completionRate)
		}
	}));
}

function buildLeaderboardRiskWarning(parameterSet: ParameterSetSummary): SuiteWarning | null {
	if (parameterSet.leaderboardRiskRate <= LEADERBOARD_RISK_THRESHOLD) return null;
	return {
		code: 'leaderboard-risk',
		severity: 'critical',
		scope: 'all',
		parameterSetId: parameterSet.id,
		parameterSetLabel: parameterSet.label,
		title: `${formatPercent(parameterSet.leaderboardRiskRate)} of scores exceed the plausibility ceiling.`,
		observed: `${parameterSet.label} has ${formatPercent(parameterSet.leaderboardRiskRate)} of simulated player scores above target * 6000.`,
		expected: `Leaderboard risk should stay at or below ${formatPercent(LEADERBOARD_RISK_THRESHOLD)}.`,
		explanation:
			'Scores above the server-side plausibility ceiling can be rejected or can signal that normal play is approaching anti-cheat limits.',
		recommendation:
			'Lower high-end multipliers or raise the server ceiling only after inspecting max-score traces and leaderboard validation rules.',
		metrics: {
			leaderboardRiskRate: round(parameterSet.leaderboardRiskRate),
			threshold: LEADERBOARD_RISK_THRESHOLD,
			mean: round(parameterSet.score.mean),
			p95: round(parameterSet.score.p95),
			max: round(parameterSet.score.max)
		}
	};
}

function buildRandomTailWarning(
	parameterSet: ParameterSetSummary,
	personas: readonly PersonaSummary[]
): SuiteWarning | null {
	const random = personas.find((persona) => persona.id === 'random');
	const casual = personas.find((persona) => persona.id === 'casual');
	if (!random || !casual || random.score.p95 <= casual.score.median) return null;
	const margin = random.score.p95 - casual.score.median;
	return {
		code: 'random-tail-overlap',
		severity: 'warn',
		scope: 'solo',
		parameterSetId: parameterSet.id,
		parameterSetLabel: parameterSet.label,
		title: `Random p95 beats Casual median by ${formatScore(margin)}.`,
		observed: `Solo Random Guesser p95 ${formatScore(random.score.p95)} > solo Casual Fan median ${formatScore(casual.score.median)}.`,
		expected: 'The lucky tail for random guessing should stay below a typical Casual Fan game.',
		explanation:
			'When low-skill p95 exceeds casual median, occasional guessing runs can look better than ordinary informed play, which weakens skill readability.',
		recommendation:
			'Reduce rewards for easy or early lucky placements, lower speed amplification for guesses, or recalibrate the random persona if it is meant to be truly blind.',
		metrics: {
			randomP95: round(random.score.p95),
			casualMedian: round(casual.score.median),
			margin: round(margin),
			randomAccuracy: round(random.accuracy.mean),
			casualAccuracy: round(casual.accuracy.mean),
			randomCompletionRate: round(random.completionRate),
			casualCompletionRate: round(casual.completionRate)
		}
	};
}

function buildFarmerMeanWarning(
	parameterSet: ParameterSetSummary,
	personas: readonly PersonaSummary[]
): SuiteWarning | null {
	const farmer = personas.find((persona) => persona.id === 'farmer');
	const casual = personas.find((persona) => persona.id === 'casual');
	if (!farmer || !casual) return null;
	const limit = casual.score.mean * FARMER_TO_CASUAL_MEAN_LIMIT;
	if (farmer.score.mean <= limit) return null;
	return {
		code: 'farmer-mean',
		severity: 'critical',
		scope: 'solo',
		parameterSetId: parameterSet.id,
		parameterSetLabel: parameterSet.label,
		title: `Farmer mean is ${formatPercent(farmer.score.mean / casual.score.mean)} of Casual mean.`,
		observed: `Solo Adversarial Farmer mean ${formatScore(farmer.score.mean)} is above the ${formatScore(limit)} limit.`,
		expected: `Farmer mean should stay below ${formatPercent(FARMER_TO_CASUAL_MEAN_LIMIT)} of Casual Fan mean.`,
		explanation:
			'The farmer intentionally seeks near misses. A high farmer mean suggests consolation points or long-game behavior may be exploitable.',
		recommendation:
			'Reduce consolation size, shorten consolation fade, or inspect near-miss scoring traces before shipping the parameter set.',
		metrics: {
			farmerMean: round(farmer.score.mean),
			casualMean: round(casual.score.mean),
			limit: round(limit),
			farmerToCasualRatio: round(farmer.score.mean / casual.score.mean),
			farmerAccuracy: round(farmer.accuracy.mean),
			farmerCompletionRate: round(farmer.completionRate)
		}
	};
}

function findPersonaOrderViolations(personas: readonly PersonaSummary[]): PersonaOrderViolation[] {
	const byId = new Map(
		personas.filter((persona) => persona.count > 0).map((persona) => [persona.id, persona])
	);
	const violations: PersonaOrderViolation[] = [];
	for (let i = 1; i < SKILL_LADDER.length; i++) {
		const lowerSkill = byId.get(SKILL_LADDER[i - 1]);
		const higherSkill = byId.get(SKILL_LADDER[i]);
		if (!lowerSkill || !higherSkill) continue;
		const margin = lowerSkill.score.mean - higherSkill.score.mean;
		if (margin > SKILL_MEAN_TOLERANCE) {
			violations.push({ lowerSkill, higherSkill, margin });
		}
	}
	return violations;
}

function formatScore(value: number): string {
	return Math.round(value).toLocaleString('en-US');
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function round(value: number): number {
	return Math.round(value * 10000) / 10000;
}
