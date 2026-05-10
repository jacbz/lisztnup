import type { WorkCategory } from '../../src/lib/models';
import type { TracklistSamplePool } from '../../src/lib/services/TracklistGenerator';
import type { TracklistDifficultyProfile } from './types';

interface WeightedValue {
	value: number;
	weight: number;
}

interface DifficultyCandidate {
	work: TracklistSamplePool['works'][number]['work'];
	year: number;
	weight: number;
}

const EMPTY_DIFFICULTY: TracklistDifficultyProfile = {
	score: 0,
	ambiguity: 0,
	yearSpan: 0,
	medianNearestYearGap: 0,
	worksPerDecade: 0,
	meanYear: 0,
	effectiveComposers: 0,
	effectiveTypes: 0,
	meanWorkScore: 0,
	yearCrowding: 0,
	yearNarrowness: 0,
	composerHomogeneity: 0,
	typeHomogeneity: 0,
	obscurity: 0,
	historicalRemoteness: 0,
	bounds: { min: 1400, max: 2020 }
};

export function calculateTracklistDifficulty(
	pool: TracklistSamplePool
): TracklistDifficultyProfile {
	const candidates: DifficultyCandidate[] = pool.works
		.map((candidate) => ({
			work: candidate.work,
			year: candidate.work.end_year ?? candidate.work.begin_year,
			weight: Math.max(1, candidate.parts.length)
		}))
		.filter((candidate): candidate is DifficultyCandidate => candidate.year != null);

	if (candidates.length === 0) return EMPTY_DIFFICULTY;

	const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);

	// Bounds calculation matching GameScreen.svelte logic
	let min = Infinity;
	let max = -Infinity;
	for (const candidate of pool.works) {
		const work = candidate.work;
		const begin = work.begin_year ?? work.composer.birth_year;
		const end = work.end_year ?? work.composer.death_year ?? new Date().getFullYear();
		if (begin < min) min = begin;
		if (end > max) max = end;
	}
	const bounds = {
		min: min === Infinity ? 1400 : min,
		max: max === -Infinity ? 2020 : max
	};

	const years = candidates.map((candidate) => candidate.year);
	const minYear = Math.min(...years);
	const maxYear = Math.max(...years);
	const yearSpan = Math.max(1, maxYear - minYear);
	const nearestGaps = calculateNearestYearGaps(
		candidates.map((candidate) => ({
			value: candidate.year,
			weight: candidate.weight
		}))
	);
	const medianNearestYearGap = weightedQuantile(nearestGaps, 0.5);
	const effectiveComposers = effectiveCount(
		candidates.map((candidate) => ({
			key: candidate.work.composerGid,
			weight: candidate.weight
		}))
	);
	const effectiveTypes = effectiveCount(
		candidates.map((candidate) => ({
			key: candidate.work.type,
			weight: candidate.weight
		}))
	);
	const meanWorkScore =
		candidates.reduce((sum, candidate) => sum + candidate.work.score * candidate.weight, 0) /
		totalWeight;
	const meanYear =
		candidates.reduce((sum, candidate) => sum + candidate.year * candidate.weight, 0) / totalWeight;
	const worksPerDecade = candidates.length / Math.max(1, yearSpan / 10);
	const yearNarrowness = clamp((160 - yearSpan) / 140, 0, 1);
	const composerHomogeneity = composerHomogeneitySignal(effectiveComposers);
	const typeHomogeneity = typeHomogeneitySignal(effectiveTypes);
	const styleHomogeneity = composerHomogeneity * 0.65 + typeHomogeneity * 0.35;
	const yearCrowding =
		logScale(worksPerDecade, 120) * (0.35 + 0.65 * Math.max(yearNarrowness, styleHomogeneity));
	const obscurity = clamp((5.2 - meanWorkScore) / 3, 0, 1);
	const historicalRemoteness = clamp((1750 - meanYear) / 350, 0, 1);
	const ambiguity = clamp(
		yearCrowding * 0.24 +
			yearNarrowness * 0.2 +
			composerHomogeneity * 0.22 +
			typeHomogeneity * 0.14 +
			obscurity * 0.2 +
			historicalRemoteness * 0.16,
		0,
		1
	);

	return {
		score: Math.round(ambiguity * 100),
		ambiguity,
		yearSpan,
		medianNearestYearGap,
		worksPerDecade,
		meanYear,
		effectiveComposers,
		effectiveTypes,
		meanWorkScore,
		yearCrowding,
		yearNarrowness,
		composerHomogeneity,
		typeHomogeneity,
		obscurity,
		historicalRemoteness,
		bounds
	};
}

function calculateNearestYearGaps(years: readonly WeightedValue[]): WeightedValue[] {
	const sorted = [...years].sort((a, b) => a.value - b.value);
	return sorted.map((entry, index) => {
		const previous = sorted[index - 1];
		const next = sorted[index + 1];
		const previousGap = previous ? Math.abs(entry.value - previous.value) : Infinity;
		const nextGap = next ? Math.abs(next.value - entry.value) : Infinity;
		const gap = Math.min(previousGap, nextGap);
		return {
			value: Number.isFinite(gap) ? gap : 0,
			weight: entry.weight
		};
	});
}

function effectiveCount(
	entries: readonly { key: string | WorkCategory; weight: number }[]
): number {
	const weightsByKey = new Map<string, number>();
	let total = 0;
	for (const entry of entries) {
		const weight = Math.max(0, entry.weight);
		weightsByKey.set(entry.key, (weightsByKey.get(entry.key) ?? 0) + weight);
		total += weight;
	}
	if (total <= 0) return 0;
	let sumSquares = 0;
	for (const weight of weightsByKey.values()) {
		const share = weight / total;
		sumSquares += share * share;
	}
	return sumSquares > 0 ? 1 / sumSquares : 0;
}

function composerHomogeneitySignal(effectiveComposers: number): number {
	return clamp((8 - effectiveComposers) / 7, 0, 1);
}

function typeHomogeneitySignal(effectiveTypes: number): number {
	return clamp((4 - effectiveTypes) / 3, 0, 1);
}

function logScale(value: number, valueAtMax: number): number {
	return clamp(Math.log1p(Math.max(0, value)) / Math.log1p(valueAtMax), 0, 1);
}

function weightedQuantile(values: readonly WeightedValue[], q: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a.value - b.value);
	const total = sorted.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
	if (total <= 0) return sorted[0].value;
	const target = total * q;
	let cumulative = 0;
	for (const entry of sorted) {
		cumulative += Math.max(0, entry.weight);
		if (cumulative >= target) return entry.value;
	}
	return sorted[sorted.length - 1].value;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
