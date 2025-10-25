/**
 * Formats a composer sort name (e.g., "Bach, Johann Sebastian")
 * into a display name (e.g., "Johann Sebastian Bach")
 */
export function formatComposerName(sortName: string): string {
	const parts = sortName.split(',').map((part) => part.trim());
	if (parts.length === 2) {
		return `${parts[1]} ${parts[0]}`;
	}
	return sortName;
}

/**
 * Formats a year range for display
 */
export function formatYearRange(beginYear?: number, endYear?: number): string {
	if (!beginYear && !endYear) return '';
	if (!endYear || beginYear === endYear) return String(beginYear ?? endYear);
	if (!beginYear) return String(endYear);
	return `${beginYear}–${endYear}`;
}

/**
 * Formats a composer's lifespan
 */
export function formatLifespan(birthYear?: number, deathYear?: number): string {
	if (!birthYear && !deathYear) return '';
	if (!deathYear) return `* ${birthYear}`;
	if (!birthYear) return `† ${deathYear}`;
	return `${birthYear}–${deathYear}`;
}
/**
 * Gets the decade from a year (e.g., 1805 -> "1800s")
 */
export function getDecade(year: number): string {
	const decade = Math.floor(year / 10) * 10;
	return `${decade}s`;
}
