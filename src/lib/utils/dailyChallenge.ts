import { DEFAULT_TRACKLISTS } from '$lib/data/defaultTracklists';
import type { DefaultTracklist } from '$lib/types';
import {
	buildDailyChallengeSchedule,
	type DailyChallengeAnchor,
	type DailyChallengeScheduleEntry
} from './dailyChallengeSchedule';
import { getGermanDateString } from './date';

export { getGermanDateString, getUtcDateString } from './date';

const EXCLUDED_DAILY_ROTATION_TRACKLIST_IDS: readonly string[] = [
	'beginner',
	'intermediate',
	'skilled',
	'advanced',
	'expert',
	'virtuoso',
	'contemporary',
	'baroque',
	'renaissance'
];

/** Tracklists eligible for fixed challenge dates. */
const DAILY_ANCHOR_CANDIDATES: DefaultTracklist[] = DEFAULT_TRACKLISTS;

/** Tracklists eligible for the monthly filler rotation. */
const DAILY_ROTATION_CANDIDATES: DefaultTracklist[] = DEFAULT_TRACKLISTS.filter(
	(t) => t.category !== 'composers' && !EXCLUDED_DAILY_ROTATION_TRACKLIST_IDS.includes(t.id)
);

/**
 * Fixed daily challenge anchors with a semantic cause for the banner copy.
 * These are German calendar dates so the schedule flips globally at midnight in Berlin.
 */
const DAILY_CHALLENGE_ANCHORS: DailyChallengeAnchor[] = [
	{ month: 1, day: 27, tracklistId: 'mozart', cause: 'birthday' },
	{ month: 3, day: 1, tracklistId: 'chopin', cause: 'birthday' },
	{ month: 3, day: 4, tracklistId: 'vivaldi', cause: 'birthday' },
	{ month: 3, day: 8, tracklistId: 'femalecomposers', cause: 'womensDay' },
	{ month: 3, day: 31, tracklistId: 'bach', cause: 'birthday' },
	{ month: 5, day: 7, tracklistId: 'tchaikovsky', cause: 'birthday' },
	{ month: 5, day: 17, tracklistId: 'scandinavia', cause: 'nationalDay' }, // NO
	{ month: 6, day: 2, tracklistId: 'italy', cause: 'nationalDay' }, // IT
	{ month: 6, day: 6, tracklistId: 'scandinavia', cause: 'nationalDay' }, // SE (DK ommitted on day before)
	{ month: 6, day: 12, tracklistId: 'russia', cause: 'nationalDay' }, // RU
	{ month: 7, day: 4, tracklistId: 'usa', cause: 'nationalDay' }, // US
	{ month: 7, day: 14, tracklistId: 'france', cause: 'nationalDay' }, // FR
	{ month: 10, day: 3, tracklistId: 'germany', cause: 'nationalDay' }, // DE
	{ month: 10, day: 12, tracklistId: 'spain', cause: 'nationalDay' }, // ES
	{ month: 10, day: 22, tracklistId: 'liszt', cause: 'birthday' },
	{ month: 10, day: 26, tracklistId: 'germany', cause: 'nationalDay' }, // AT
	{ month: 11, day: 14, tracklistId: 'uk', cause: 'nationalDay' }, // UK
	{ month: 12, day: 6, tracklistId: 'scandinavia', cause: 'nationalDay' }, // FI
	{ month: 12, day: 17, tracklistId: 'beethoven', cause: 'birthday' }
];

/** Backwards-compatible alias for the daily challenge calendar date helper. */
export const getTodayDateString = getGermanDateString;

function getGermanScheduleDate(date: Date): { scheduleDate: Date; dayIndex: number } {
	const [year, month, day] = getGermanDateString(date).split('-').map(Number);
	return {
		scheduleDate: new Date(Date.UTC(year, month - 1, day)),
		dayIndex: day - 1
	};
}

/**
 * Returns the global German-calendar daily challenge schedule for the month of `date`.
 *
 * Fixed themed dates are reserved first, then the remaining days are filled from the allowed
 * rotation pool. If a long month exhausts that pool, allowed filler tracklists repeat.
 */
export function getDailyChallengeSchedule(date = new Date()): DefaultTracklist[] {
	const { scheduleDate } = getGermanScheduleDate(date);
	return buildDailyChallengeSchedule(
		DAILY_ANCHOR_CANDIDATES,
		DAILY_CHALLENGE_ANCHORS,
		scheduleDate,
		DAILY_ROTATION_CANDIDATES
	).map((entry) => entry.tracklist);
}

/** Returns the global daily challenge entry for `date` in German calendar time. */
export function getDailyChallengeEntry(
	date = new Date()
): DailyChallengeScheduleEntry<DefaultTracklist> {
	const { scheduleDate, dayIndex } = getGermanScheduleDate(date);
	const schedule = buildDailyChallengeSchedule(
		DAILY_ANCHOR_CANDIDATES,
		DAILY_CHALLENGE_ANCHORS,
		scheduleDate,
		DAILY_ROTATION_CANDIDATES
	);
	return schedule[dayIndex]!;
}

/**
 * Returns the global daily challenge tracklist for `date` in German calendar time.
 * Defaults to the current German day.
 */
export function getDailyTracklist(date = new Date()): DefaultTracklist {
	return getDailyChallengeEntry(date).tracklist;
}
