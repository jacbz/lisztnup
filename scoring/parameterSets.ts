import {
	PRODUCTION_TIMELINE_SCORING,
	type TimelineScoringParameters
} from '../src/lib/logic/timelineScoring';

function preset(
	overrides: Partial<TimelineScoringParameters> & Pick<TimelineScoringParameters, 'id' | 'label'>
): TimelineScoringParameters {
	return {
		...PRODUCTION_TIMELINE_SCORING,
		...overrides
	};
}

export const PARAMETER_SETS: readonly TimelineScoringParameters[] = [
	PRODUCTION_TIMELINE_SCORING,
	preset({
		id: 'less-speed',
		label: 'Less Speed',
		speedBonus: 0.2
	})
	// preset({
	// 	id: 'precision-heavy',
	// 	label: 'Precision Heavy',
	// 	difficultyScale: 4200,
	// 	minimumGap: 20,
	// 	speedBonus: 0.18,
	// 	completionFlawlessMultiplier: 1.15
	// }),
	// preset({
	// 	id: 'comeback-friendly',
	// 	label: 'Comeback Friendly',
	// 	consolationBase: 140,
	// 	consolationFadeEndAttemptsMultiplier: 4.5,
	// 	completionRate: 900,
	// 	completionFlawlessMultiplier: 1.1
	// })
] as const;

export function resolveParameterSets(ids: string[]): TimelineScoringParameters[] {
	const selectedIds = ids.length === 0 ? ['production'] : ids;
	if (selectedIds.includes('all')) return [...PARAMETER_SETS];

	const selected = selectedIds.map((id) => {
		const parameterSet = PARAMETER_SETS.find((candidate) => candidate.id === id);
		if (!parameterSet) {
			throw new Error(`Unknown scoring parameter set: ${id}`);
		}
		return parameterSet;
	});

	return selected;
}
