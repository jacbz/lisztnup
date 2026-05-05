export type DailyChallengeCandidate = {
	readonly id: string;
};

export type DailyChallengeAnchor = {
	readonly month: number; // 1-12, UTC
	readonly day: number; // 1-31, UTC
	readonly tracklistId: string;
	readonly cause: 'birthday' | 'nationalDay' | 'womensDay';
};

export type DailyChallengeScheduleEntry<T extends DailyChallengeCandidate> = {
	readonly tracklist: T;
	readonly cause: DailyChallengeAnchor['cause'] | null;
};

/** Mulberry32 seeded PRNG — returns a function that yields [0, 1) on each call. */
function seededRandom(seed: number): () => number {
	let s = seed | 0;
	return () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Fisher-Yates shuffle using a seeded PRNG — deterministic for a given seed. */
function seededShuffle<T>(array: readonly T[], seed: number): T[] {
	const rng = seededRandom(seed);
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}

function hashString(value: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

function getDaysInUtcMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function validateAnchorsForMonth(
	anchors: readonly DailyChallengeAnchor[],
	monthNumber: number
): void {
	const monthlyAnchors = anchors.filter((anchor) => anchor.month === monthNumber);
	const seenDays = new Set<number>();
	const seenTracklists = new Set<string>();

	for (const anchor of monthlyAnchors) {
		if (seenDays.has(anchor.day)) {
			throw new Error(`Daily challenge anchors conflict on day ${monthNumber}-${anchor.day}`);
		}
		if (seenTracklists.has(anchor.tracklistId)) {
			throw new Error(
				`Daily challenge tracklist ${anchor.tracklistId} is anchored more than once in month ${monthNumber}`
			);
		}

		seenDays.add(anchor.day);
		seenTracklists.add(anchor.tracklistId);
	}
}

/**
 * Builds a deterministic UTC schedule for the month of `date`.
 *
 * Fixed themed dates are reserved first, then the remaining days are filled from the rotation pool.
 * If the month has more open days than rotation candidates, filler candidates repeat deterministically.
 */
export function buildDailyChallengeSchedule<T extends DailyChallengeCandidate>(
	candidates: readonly T[],
	anchors: readonly DailyChallengeAnchor[],
	date = new Date(),
	rotationCandidates: readonly T[] = candidates
): DailyChallengeScheduleEntry<T>[] {
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const daysInMonth = getDaysInUtcMonth(year, month);
	const schedule = new Array<DailyChallengeScheduleEntry<T> | null>(daysInMonth).fill(null);
	const usedCandidateIds = new Set<string>();
	const monthNumber = month + 1;
	validateAnchorsForMonth(anchors, monthNumber);

	const monthlyAnchors = anchors.filter((anchor) => anchor.month === monthNumber);

	for (const anchor of monthlyAnchors) {
		const candidate = candidates.find((item) => item.id === anchor.tracklistId);
		if (!candidate) {
			throw new Error(`Daily challenge anchor references unknown tracklist ${anchor.tracklistId}`);
		}

		const dayIndex = anchor.day - 1;
		if (dayIndex < 0 || dayIndex >= schedule.length) continue;
		if (schedule[dayIndex] !== null) {
			throw new Error(`Daily challenge anchor collision on day ${monthNumber}-${anchor.day}`);
		}
		if (usedCandidateIds.has(candidate.id)) {
			throw new Error(
				`Daily challenge tracklist ${anchor.tracklistId} is anchored more than once in month ${monthNumber}`
			);
		}

		schedule[dayIndex] = { tracklist: candidate, cause: anchor.cause };
		usedCandidateIds.add(candidate.id);
	}

	const remainingCandidates = seededShuffle(
		rotationCandidates.filter((item) => !usedCandidateIds.has(item.id)),
		hashString(`${year}-${String(monthNumber).padStart(2, '0')}`)
	);
	const repeatCandidates = seededShuffle(
		rotationCandidates,
		hashString(`${year}-${String(monthNumber).padStart(2, '0')}-repeat`)
	);

	let remainingIndex = 0;
	let repeatIndex = 0;
	for (let i = 0; i < schedule.length; i++) {
		if (schedule[i] !== null) continue;
		const nextCandidate =
			remainingCandidates[remainingIndex++] ??
			repeatCandidates[repeatIndex++ % repeatCandidates.length];
		if (!nextCandidate) {
			throw new Error('Daily challenge schedule ran out of candidates for the current month');
		}
		schedule[i] = { tracklist: nextCandidate, cause: null };
	}

	return schedule.map((candidate, index) => {
		if (!candidate) {
			throw new Error(`Daily challenge schedule is missing day ${index + 1} for the current month`);
		}
		return candidate;
	});
}
