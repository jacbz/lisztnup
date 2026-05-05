import { DEFAULT_TRACKLISTS } from '$lib/data/defaultTracklists';
import type { DefaultTracklist } from '$lib/types';
import {
	buildDailyChallengeSchedule,
	type DailyChallengeAnchor,
	type DailyChallengeScheduleEntry
} from './dailyChallengeSchedule';
import { getUtcDateString } from './date';

export { getUtcDateString } from './date';

const EXCLUDED_DAILY_ROTATION_TRACKLIST_IDS: readonly string[] = [
	'beginner',
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
 * These are UTC dates so the schedule is global and serverless.
 */
const DAILY_CHALLENGE_ANCHORS: DailyChallengeAnchor[] = [
	{ month: 1, day: 27, tracklistId: 'mozart', cause: 'birthday' },
	{ month: 3, day: 1, tracklistId: 'chopin', cause: 'birthday' },
	{ month: 3, day: 4, tracklistId: 'vivaldi', cause: 'birthday' },
	{ month: 3, day: 8, tracklistId: 'femalecomposers', cause: 'womensDay' },
	{ month: 3, day: 31, tracklistId: 'bach', cause: 'birthday' },
	{ month: 5, day: 7, tracklistId: 'tchaikovsky', cause: 'birthday' },
	{ month: 6, day: 2, tracklistId: 'italy', cause: 'nationalDay' },
	{ month: 6, day: 12, tracklistId: 'russia', cause: 'nationalDay' },
	{ month: 7, day: 4, tracklistId: 'usa', cause: 'nationalDay' },
	{ month: 7, day: 14, tracklistId: 'france', cause: 'nationalDay' },
	{ month: 10, day: 3, tracklistId: 'germany', cause: 'nationalDay' },
	{ month: 10, day: 12, tracklistId: 'spain', cause: 'nationalDay' },
	{ month: 10, day: 22, tracklistId: 'liszt', cause: 'birthday' },
	{ month: 11, day: 14, tracklistId: 'uk', cause: 'nationalDay' },
	{ month: 12, day: 17, tracklistId: 'beethoven', cause: 'birthday' }
];

/** Backwards-compatible alias for the UTC date string helper. */
export const getTodayDateString = getUtcDateString;

/**
 * Returns the global UTC daily challenge schedule for the month of `date`.
 *
 * Fixed themed dates are reserved first, then the remaining days are filled from the allowed
 * rotation pool. If a long month exhausts that pool, allowed filler tracklists repeat.
 */
export function getDailyChallengeSchedule(date = new Date()): DefaultTracklist[] {
	return buildDailyChallengeSchedule(
		DAILY_ANCHOR_CANDIDATES,
		DAILY_CHALLENGE_ANCHORS,
		date,
		DAILY_ROTATION_CANDIDATES
	).map((entry) => entry.tracklist);
}

/** Returns the global daily challenge entry for `date` in UTC. */
export function getDailyChallengeEntry(
	date = new Date()
): DailyChallengeScheduleEntry<DefaultTracklist> {
	const schedule = buildDailyChallengeSchedule(
		DAILY_ANCHOR_CANDIDATES,
		DAILY_CHALLENGE_ANCHORS,
		date,
		DAILY_ROTATION_CANDIDATES
	);
	return schedule[date.getUTCDate() - 1]!;
}

/**
 * Returns the global daily challenge tracklist for `date` in UTC.
 * Defaults to the current UTC day.
 */
export function getDailyTracklist(date = new Date()): DefaultTracklist {
	return getDailyChallengeEntry(date).tracklist;
}
