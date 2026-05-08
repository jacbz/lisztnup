import type { BucketSummary, SummaryStats } from './types';

const MAX_SAMPLE_VALUES = 100_000;

export class NumberSeries {
	readonly values: number[] = [];
	private count = 0;
	private sum = 0;
	private min = Infinity;
	private max = -Infinity;
	private rngState = 0x9e3779b9;

	add(value: number | null | undefined): void {
		if (typeof value !== 'number' || !Number.isFinite(value)) return;
		this.count++;
		this.sum += value;
		if (value < this.min) this.min = value;
		if (value > this.max) this.max = value;

		if (this.values.length < MAX_SAMPLE_VALUES) {
			this.values.push(value);
			return;
		}

		const replacementIndex = this.nextReservoirIndex(this.count);
		if (replacementIndex < MAX_SAMPLE_VALUES) {
			this.values[replacementIndex] = value;
		}
	}

	summary(): SummaryStats {
		if (this.count === 0) {
			return { count: 0, mean: 0, median: 0, p05: 0, p95: 0, min: 0, max: 0 };
		}
		const sorted = [...this.values].sort((a, b) => a - b);
		return {
			count: this.count,
			mean: this.sum / this.count,
			median: quantileSorted(sorted, 0.5),
			p05: quantileSorted(sorted, 0.05),
			p95: quantileSorted(sorted, 0.95),
			min: this.min,
			max: this.max
		};
	}

	private nextReservoirIndex(maxExclusive: number): number {
		this.rngState += 0x6d2b79f5;
		let t = this.rngState;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		const random = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		return Math.floor(random * maxExclusive);
	}
}

export class Bucket {
	count = 0;
	completed = 0;
	wins = 0;
	timeouts = 0;
	attemptsTotal = 0;
	leaderboardRisk = 0;
	readonly score = new NumberSeries();
	readonly attempts = new NumberSeries();
	readonly accuracy = new NumberSeries();
	readonly longestStreak = new NumberSeries();
	readonly completionBonusShare = new NumberSeries();

	add(input: {
		score: number;
		target: number;
		attempts: number;
		accuracy: number;
		reachedTarget: boolean;
		won: boolean;
		completionBonus: number;
		longestStreak: number;
		timeouts: number;
	}): void {
		this.count++;
		if (input.reachedTarget) this.completed++;
		if (input.won) this.wins++;
		if (input.score > input.target * 6000) this.leaderboardRisk++;
		this.timeouts += input.timeouts;
		this.attemptsTotal += input.attempts;
		this.score.add(input.score);
		this.attempts.add(input.attempts);
		this.accuracy.add(input.accuracy);
		this.longestStreak.add(input.longestStreak);
		this.completionBonusShare.add(input.score > 0 ? input.completionBonus / input.score : 0);
	}

	summary(): BucketSummary {
		return {
			count: this.count,
			completionRate: ratio(this.completed, this.count),
			winRate: ratio(this.wins, this.count),
			score: this.score.summary(),
			attempts: this.attempts.summary(),
			accuracy: this.accuracy.summary(),
			longestStreak: this.longestStreak.summary(),
			completionBonusShare: this.completionBonusShare.summary(),
			timeoutRate: ratio(this.timeouts, this.attemptsTotal),
			leaderboardRiskRate: ratio(this.leaderboardRisk, this.count)
		};
	}
}

export function getBucket(map: Map<string, Bucket>, key: string): Bucket {
	const existing = map.get(key);
	if (existing) return existing;
	const bucket = new Bucket();
	map.set(key, bucket);
	return bucket;
}

export function ratio(numerator: number, denominator: number): number {
	return denominator > 0 ? numerator / denominator : 0;
}

function quantileSorted(sorted: readonly number[], q: number): number {
	if (sorted.length === 0) return 0;
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	const next = sorted[base + 1];
	return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}
