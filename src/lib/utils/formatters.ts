/**
 * Formats a composer sort name (e.g., "Bach, Johann Sebastian" or "Strauss, Johann, II")
 * into a display name (e.g., "Johann Sebastian Bach" or "Johann Strauss II")
 */
export function formatComposerName(sortName: string): string {
	const parts = sortName.split(',').map((part) => part.trim());
	if (parts.length >= 2) {
		const firstName = parts[1];
		const lastName = parts[0];
		const suffix = parts.length > 2 ? ' ' + parts.slice(2).join(' ') : '';
		return `${firstName} ${lastName}${suffix}`;
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
	return `${beginYear}‑${endYear}`;
}

/**
 * Formats a part name by stripping the work name prefix if present
 * @param partName - The full part name
 * @param workName - The work name to potentially strip from the part
 * @returns The formatted part name with work prefix removed if applicable
 */
export function formatPartName(partName: string, workName: string): string {
	// Check if part starts with work name followed by punctuation
	const prefixPattern = new RegExp(
		`^${workName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\-,]\\s*`,
		'i'
	);
	const strippedName = partName.replace(prefixPattern, '').trim();

	// Return stripped name if it's different and not empty, otherwise return full part name
	return strippedName && strippedName !== partName ? strippedName : partName;
}

/**
 * Formats a composer's lifespan
 */
export function formatLifespan(birthYear: number | null, deathYear: number | null): string {
	if (!birthYear && !deathYear) return '';
	if (!deathYear) return `* ${birthYear}`;
	if (!birthYear) return `† ${deathYear}`;
	return `${birthYear}‑${deathYear}`;
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
 * Manual overrides for specific composers whose music fits into
 * specific genres or movements not captured by standard period classification
 * Key is composer name in sort format (Last, First)
 */
const COMPOSER_ERA_OVERRIDES: Record<string, string> = {
	// Ragtime & Jazz Age
	'Joplin, Scott': 'Ragtime',
	'Gershwin, George': 'American Jazz / Classical Fusion',

	// Impressionism
	'Satie, Erik': 'Impressionism',
	'Debussy, Claude': 'Impressionism',
	'Ravel, Maurice': 'Impressionism',

	// Les Six & Neo-Classical
	'Poulenc, Francis': 'Les Six / Neo-Classical',
	'Milhaud, Darius': 'Les Six / Modernism',

	// Second Viennese School / Atonality
	'Schönberg, Arnold': 'Second Viennese School / Atonality',
	'Berg, Alban': 'Second Viennese School / Atonality',
	'Webern, Anton': 'Second Viennese School / Atonality',

	// Modernism & Neoclassicism
	'Stravinsky, Igor Fyodorovitch': 'Modernism / Neoclassicism',
	'Bartók, Béla': 'Modernism / Ethnomusicology',
	'Prokofiev, Sergei Sergeyevich': 'Russian Modernism',
	'Shostakovich, Dmitri Dmitrievich': 'Soviet Modernism',

	// American Modernism
	'Bernstein, Leonard': 'American Modernism',
	'Copland, Aaron': 'American Modernism',
	'Ives, Charles': 'American Experimental',
	'Barber, Samuel': 'American Neo-Romanticism',
	'Cage, John': 'American Avant-Garde',
	'Adams, John': 'Minimalism / Post-Minimalism',

	// Minimalism
	'Glass, Philip': 'Minimalism',
	'Reich, Steve': 'Minimalism',
	'Pärt, Arvo': 'Holy Minimalism',

	// Avant-Garde & Experimental
	'Messiaen, Olivier': 'Mystical Modernism',
	'Ligeti, György': 'Avant-Garde / Micropolyphony',
	'Penderecki, Krzysztof': 'Polish Avant-Garde',

	// Late Romantic / National Schools
	'Rachmaninoff, Sergei Vasilievich': 'Late Romantic',
	'Scriabin, Alexander Nikolayevich': 'Late Romantic',
	'Sibelius, Jean': 'Late Romantic',
	'Nielsen, Carl': 'Late Romantic',
	'Elgar, Edward': 'Late Romantic',
	'Vaughan Williams, Ralph': 'Late Romantic'
};

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
 * and composer. Checks for manual overrides first, then falls back to year-based periods.
 * Uses the end_year if available, otherwise begin_year
 * @param beginYear - The start year of composition
 * @param endYear - The end year of composition
 * @param composerName - The composer's sort name (e.g., "Joplin, Scott") for override lookup
 * @returns The era label, or empty string if no valid year
 */
export function getWorkEra(
	beginYear: number | null | undefined,
	endYear: number | null | undefined,
	composerName?: string
): string {
	if (composerName && COMPOSER_ERA_OVERRIDES[composerName]) {
		return COMPOSER_ERA_OVERRIDES[composerName];
	}

	// Fall back to year-based period
	const year = endYear ?? beginYear;
	return getEra(year);
}
