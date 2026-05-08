export type RandomSource = () => number;

export interface SeededRandom {
	readonly seed: string;
	next: RandomSource;
	fork: (...parts: Array<string | number>) => SeededRandom;
}

function xmur3(input: string): () => number {
	let h = 1779033703 ^ input.length;
	for (let i = 0; i < input.length; i++) {
		h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return (h ^= h >>> 16) >>> 0;
	};
}

function mulberry32(seed: number): RandomSource {
	let state = seed >>> 0;
	return () => {
		state += 0x6d2b79f5;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function createSeededRandom(seed: string): SeededRandom {
	const nextSeed = xmur3(seed)();
	const next = mulberry32(nextSeed);
	return {
		seed,
		next,
		fork: (...parts) => createSeededRandom([seed, ...parts].join(':'))
	};
}

export function randomInt(
	random: RandomSource,
	minInclusive: number,
	maxInclusive: number
): number {
	const min = Math.ceil(minInclusive);
	const max = Math.floor(maxInclusive);
	return Math.floor(random() * (max - min + 1)) + min;
}

export function randomNormal(random: RandomSource, mean = 0, standardDeviation = 1): number {
	let u = 0;
	let v = 0;
	while (u === 0) u = random();
	while (v === 0) v = random();
	const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
	return mean + z * standardDeviation;
}

export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

/**
 * Performs a weighted random selection from an array of items
 * @param items Array of items to select from
 * @param weightFn Function that returns the weight for each item
 * @returns A randomly selected item based on weights
 */
export function weightedRandom<T>(
	items: T[],
	weightFn: (item: T) => number,
	random: RandomSource = Math.random
): T {
	if (items.length === 0) {
		throw new Error('Cannot select from empty array');
	}

	const weights = items.map(weightFn);
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

	if (totalWeight === 0) {
		// If all weights are 0, select randomly
		return items[Math.floor(random() * items.length)];
	}

	let randomValue = random() * totalWeight;

	for (let i = 0; i < items.length; i++) {
		randomValue -= weights[i];
		if (randomValue <= 0) {
			return items[i];
		}
	}

	// Fallback (should never reach here)
	return items[items.length - 1];
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
export function shuffle<T>(array: T[], random: RandomSource = Math.random): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
