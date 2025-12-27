import type { Composer } from '$lib/types';

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
 * Formats a part name by attempting to remove the work title.
 * It first tries to strip the `workName` as a direct prefix.
 * If that fails, it looks for a colon followed by a common movement identifier,
 * but only proceeds if the text before the colon is semantically similar to the work name.
 *
 * @param partName - The full part name, which may include the work title.
 * @param workName - The work name to potentially strip.
 * @returns The formatted part name with the work title removed if applicable.
 */
export function formatPartName(partName: string, workName: string): string {
	// 1. First, try the original logic: strip the exact workName as a prefix.
	const prefixPattern = new RegExp(
		`^${workName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\-,]\\s*`,
		'i'
	);
	const strippedByPrefix = partName.replace(prefixPattern, '').trim();

	if (strippedByPrefix && strippedByPrefix !== partName) {
		return strippedByPrefix;
	}

	// 2. Fallback: Look for a colon followed by a movement pattern.
	// We capture the text BEFORE the colon (Group 1) to check for similarity,
	// and the text AFTER the colon (Group 2) which is the candidate result.
	const splitPattern = /^(.+?):\s*((?:[IVXLCDM]+\.?|(?:(?:No|Nº|Nr|Op)\.?\s*)?\d+\.?)\s*.*)/i;
	const match = partName.match(splitPattern);

	if (match) {
		const potentialPrefix = match[1];
		const movementPart = match[2];

		// Only strip the prefix if it is "similar enough" to the workName.
		// This prevents stripping "Brandenburg Concerto..." when the Work Name is "Six Concerts..."
		if (areTitlesSimilar(workName, potentialPrefix)) {
			return movementPart.trim();
		}
	}

	// 3. No valid pattern or insufficient similarity found.
	return partName;
}

/**
 * Helper to determine if two title strings are semantically similar.
 * Uses a token-based Jaccard Index approach.
 */
function areTitlesSimilar(titleA: string, titleB: string): boolean {
	const tokensA = tokenize(titleA);
	const tokensB = tokenize(titleB);

	// Calculate intersection (common words)
	const intersection = new Set([...tokensA].filter((x) => tokensB.has(x)));

	// Calculate union size
	const unionSize = new Set([...tokensA, ...tokensB]).size;

	if (unionSize === 0) return false;

	// Jaccard Index: Intersection / Union
	const score = intersection.size / unionSize;

	// Threshold: 0.5 allows for significant variations (e.g., missing subtitles,
	// "No. 5" vs "5"), but blocks totally different titles.
	// e.g. "Symphony 5" vs "Symphony No. 5" -> ~0.66 (Pass)
	// e.g. "Brandenburg..." vs "Six Concerts..." -> 0.0 (Fail)
	return score > 0.5;
}

/**
 * Helper to split a string into a set of normalized words.
 * Splits on punctuation/spaces to handle "No.5", "op.35", etc.
 */
function tokenize(str: string): Set<string> {
	return new Set(
		str
			.toLowerCase()
			// Normalize unicode characters if available (optional but good for "Französische")
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			// Split by non-alphanumeric characters (spaces, dots, commas, dashes)
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
	);
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
 * Labels are i18n keys in the format 'eras.{key}'
 */
const PERIODS = [
	{ start: -Infinity, key: 'ancient' },
	{ start: 476, key: 'medieval' },
	{ start: 1400, key: 'earlyRenaissance' },
	{ start: 1470, key: 'middleRenaissance' },
	{ start: 1530, key: 'lateRenaissance' },
	{ start: 1600, key: 'lateRenaissanceEarlyBaroque' },
	{ start: 1620, key: 'earlyBaroque' },
	{ start: 1650, key: 'baroque' },
	{ start: 1730, key: 'lateBaroque' },
	{ start: 1750, key: 'lateBaroqueEarlyClassical' },
	{ start: 1770, key: 'earlyClassical' },
	{ start: 1785, key: 'classical' },
	{ start: 1800, key: 'lateClassical' },
	{ start: 1820, key: 'earlyRomantic' },
	{ start: 1850, key: 'romantic' },
	{ start: 1880, key: 'lateRomantic' },
	{ start: 1900, key: '20thCentury' },
	{ start: 2000, key: 'contemporary' }
];

/**
 * Manual overrides for specific composers whose music fits into
 * specific genres or movements not captured by standard period classification.
 * Values are i18n keys in the format 'eras.{key}'.
 */
const COMPOSER_ERA_OVERRIDES = new Map<string, string>([
	// Ragtime
	['Joplin, Scott', 'ragtime'],

	// Impressionism
	['Satie, Erik', 'impressionism'],
	['Debussy, Claude', 'impressionism'],
	['Ravel, Maurice', 'impressionism'],

	// Second Viennese School
	['Schönberg, Arnold', 'secondVienneseSchool'],
	['Berg, Alban', 'secondVienneseSchool'],
	['Webern, Anton', 'secondVienneseSchool'],

	// Modernism
	['Poulenc, Francis', 'modernism'],
	['Milhaud, Darius', 'modernism'],
	['Gershwin, George', 'modernism'],
	['Stravinsky, Igor Fyodorovitch', 'modernism'],
	['Bartók, Béla', 'modernism'],
	['Prokofiev, Sergei Sergeyevich', 'modernism'],
	['Shostakovich, Dmitri Dmitrievich', 'modernism'],
	['Bernstein, Leonard', 'modernism'],
	['Copland, Aaron', 'modernism'],
	['Ives, Charles', 'modernism'],
	['Barber, Samuel', 'modernism'],
	['Cage, John', 'modernism'],
	['Messiaen, Olivier', 'modernism'],
	['Ligeti, György', 'modernism'],
	['Penderecki, Krzysztof', 'modernism'],

	// Minimalism
	['Adams, John', 'minimalism'],
	['Glass, Philip', 'minimalism'],
	['Reich, Steve', 'minimalism'],
	['Pärt, Arvo', 'minimalism'],

	// Late Romantic
	['Rachmaninoff, Sergei Vasilievich', 'lateRomantic'],
	['Scriabin, Alexander Nikolayevich', 'lateRomantic'],
	['Sibelius, Jean', 'lateRomantic'],
	['Nielsen, Carl', 'lateRomantic'],
	['Elgar, Edward', 'lateRomantic'],
	['Vaughan Williams, Ralph', 'lateRomantic']
]);

/**
 * Gets the musical era/period i18n key for a given year.
 * @param year - The year to get the era for
 * @returns The era i18n key (e.g., 'baroque', 'romantic'), or empty string if year is null/undefined.
 *          Use with 'eras.' prefix for translation (e.g., $t('eras.baroque'))
 */
export function getEra(year: number | null | undefined): string {
	if (year == null) return '';

	// Find the last period whose start is <= year
	for (let i = PERIODS.length - 1; i >= 0; i--) {
		if (year >= PERIODS[i].start) return PERIODS[i].key;
	}
	return '';
}

/**
 * Gets the musical era/period i18n key for a work based on its composition year range
 * and composer. Checks for manual overrides first, then falls back to year-based periods.
 * Uses the end_year if available, otherwise begin_year.
 * @param beginYear - The start year of composition
 * @param endYear - The end year of composition
 * @param composerName - The composer's sort name (e.g., "Joplin, Scott") for override lookup
 * @returns The era i18n key (e.g., 'baroque', 'impressionism'), or empty string if no valid year.
 *          Use with 'eras.' prefix for translation (e.g., $t('eras.baroque'))
 */
export function getWorkEra(
	beginYear: number | null | undefined,
	endYear: number | null | undefined,
	composer: Composer | null | undefined
): string {
	if (composer) {
		const override = COMPOSER_ERA_OVERRIDES.get(composer.name);
		if (override) return override;
	}

	// Fall back to year-based period
	const year = endYear ?? beginYear;
	let era = getEra(year);

	if (!era) {
		// try composer's birth and death years if available and the same
		era = getEra(composer?.death_year);
		if (getEra(composer?.birth_year) === era) {
			return era;
		}
	}

	return era;
}
