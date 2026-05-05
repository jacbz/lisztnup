const GERMAN_TIME_ZONE = 'Europe/Berlin';

function twoDigit(value: number): string {
	return String(value).padStart(2, '0');
}

export function getUtcDateString(date = new Date()): string {
	return `${date.getUTCFullYear()}-${twoDigit(date.getUTCMonth() + 1)}-${twoDigit(date.getUTCDate())}`;
}

export function getDateStringInTimeZone(date = new Date(), timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(date);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function getGermanDateString(date = new Date()): string {
	return getDateStringInTimeZone(date, GERMAN_TIME_ZONE);
}

export function parseD1Timestamp(value: unknown): Date | null {
	if (typeof value !== 'string') return null;
	const normalized = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
	const date = new Date(normalized);
	return Number.isFinite(date.getTime()) ? date : null;
}

export function formatD1TimestampAsGermanDate(value: unknown): string | null {
	const date = parseD1Timestamp(value);
	return date ? getGermanDateString(date) : null;
}

export function parseDateString(value: unknown): Date | null {
	if (typeof value !== 'string') return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return parseD1Timestamp(value);

	const [, year, month, day] = match;
	const yearNumber = Number(year);
	const monthNumber = Number(month);
	const dayNumber = Number(day);
	const date = new Date(yearNumber, monthNumber - 1, dayNumber);
	if (
		date.getFullYear() !== yearNumber ||
		date.getMonth() !== monthNumber - 1 ||
		date.getDate() !== dayNumber
	) {
		return null;
	}
	return date;
}

export function formatDateString(value: unknown, locale: string): string {
	const date = parseDateString(value);
	return date
		? date.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })
		: '';
}
