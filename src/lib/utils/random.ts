/**
 * Performs a weighted random selection from an array of items
 * @param items Array of items to select from
 * @param weightFn Function that returns the weight for each item
 * @returns A randomly selected item based on weights
 */
export function weightedRandom<T>(items: T[], weightFn: (item: T) => number): T {
	if (items.length === 0) {
		throw new Error('Cannot select from empty array');
	}

	const weights = items.map(weightFn);
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

	if (totalWeight === 0) {
		// If all weights are 0, select randomly
		return items[Math.floor(Math.random() * items.length)];
	}

	let random = Math.random() * totalWeight;

	for (let i = 0; i < items.length; i++) {
		random -= weights[i];
		if (random <= 0) {
			return items[i];
		}
	}

	// Fallback (should never reach here)
	return items[items.length - 1];
}

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
export function shuffle<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
