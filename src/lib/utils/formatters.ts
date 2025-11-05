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
export function formatYearRange(
	beginYear: number | null | undefined,
	endYear: number | null | undefined
): string {
	if (!beginYear && !endYear) return '';
	if (!endYear || beginYear === endYear) return String(beginYear ?? endYear);
	if (!beginYear) return String(endYear);
	return `${beginYear}–${endYear}`;
}

/**
 * Formats a composer's lifespan
 */
export function formatLifespan(birthYear: number | null, deathYear: number | null): string {
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

/**
 * Musical periods defined by their starting year.
 * The end of a period is implicitly the start of the next period minus 1.
 */
const PERIODS = [
	{ start: -Infinity, label: 'Ancient' },
	{ start: 476, label: 'Medieval' },
	{ start: 1400, label: 'Early Renaissance' },
	{ start: 1470, label: 'Middle Renaissance' },
	{ start: 1530, label: 'Late Renaissance' },
	{ start: 1600, label: 'Late Renaissance / Early Baroque' },
	{ start: 1620, label: 'Early Baroque' },
	{ start: 1650, label: 'Baroque' },
	{ start: 1730, label: 'Late Baroque' },
	{ start: 1750, label: 'Late Baroque / Early Classical' },
	{ start: 1770, label: 'Early Classical' },
	{ start: 1785, label: 'Classical' },
	{ start: 1800, label: 'Late Classical' },
	{ start: 1820, label: 'Early Romantic' },
	{ start: 1850, label: 'Romantic' },
	{ start: 1880, label: 'Late Romantic' },
	{ start: 1900, label: '20th-century' },
	{ start: 2000, label: 'Contemporary' }
];

/**
 * Gets the musical era/period label for a given year
 * @param year - The year to get the era for
 * @returns The era label, or empty string if year is null/undefined
 */
export function getEra(year: number | null | undefined): string {
	if (year == null) return '';

	// Find the last period whose start is <= year
	for (let i = PERIODS.length - 1; i >= 0; i--) {
		if (year >= PERIODS[i].start) return PERIODS[i].label;
	}
	return '';
}

/**
 * Gets the musical era/period label for a work based on its composition year range
 * Uses the begin_year if available, otherwise end_year
 * @param beginYear - The start year of composition
 * @param endYear - The end year of composition
 * @returns The era label, or empty string if no valid year
 */
export function getWorkEra(
	beginYear: number | null | undefined,
	endYear: number | null | undefined
): string {
	const year = endYear ?? beginYear;
	return getEra(year);
}
