export type DailyChallengeCandidate = {
	readonly id: string;
};

export type DailyChallengeAnchor = {
	readonly month: number; // 1-12 in the schedule calendar
	readonly day: number; // 1-31 in the schedule calendar
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

/**
 * Checks the whole anchor table (every month, not just the current one) so a bad entry surfaces
 * immediately instead of when its month arrives. Returns human-readable problems; empty when valid.
 * The same tracklist may be anchored several times (e.g. `germany` for both DE and AT national days).
 */
export function findDailyChallengeAnchorProblems(
	candidates: readonly DailyChallengeCandidate[],
	anchors: readonly DailyChallengeAnchor[]
): string[] {
	const problems: string[] = [];
	const candidateIds = new Set(candidates.map((candidate) => candidate.id));
	const seenDates = new Set<string>();

	for (const { month, day, tracklistId } of anchors) {
		const date = `${month}-${day}`;
		// Leap year so Feb 29 counts as a real date; it is simply skipped in other years.
		if (!Number.isInteger(month) || month < 1 || month > 12) {
			problems.push(`Anchor ${date} (${tracklistId}) has an invalid month`);
		} else if (!Number.isInteger(day) || day < 1 || day > getDaysInUtcMonth(2024, month - 1)) {
			problems.push(`Anchor ${date} (${tracklistId}) has an invalid day`);
		}
		if (!candidateIds.has(tracklistId)) {
			problems.push(`Anchor ${date} references unknown tracklist ${tracklistId}`);
		}
		if (seenDates.has(date)) {
			problems.push(`Multiple anchors on ${date}`);
		}
		seenDates.add(date);
	}

	return problems;
}

/**
 * Builds a deterministic UTC schedule for the month of `date`.
 *
 * Fixed themed dates are reserved first, then the remaining days are filled from the rotation pool
 * (falling back to all candidates if it is empty). If the month has more open days than rotation
 * candidates, filler candidates repeat deterministically.
 */
export function buildDailyChallengeSchedule<T extends DailyChallengeCandidate>(
	candidates: readonly T[],
	anchors: readonly DailyChallengeAnchor[],
	date = new Date(),
	rotationCandidates: readonly T[] = candidates
): DailyChallengeScheduleEntry<T>[] {
	const fillerPool = rotationCandidates.length > 0 ? rotationCandidates : candidates;
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();
	const daysInMonth = getDaysInUtcMonth(year, month);
	const schedule = new Array<DailyChallengeScheduleEntry<T> | null>(daysInMonth).fill(null);
	const usedCandidateIds = new Set<string>();
	const monthNumber = month + 1;

	// Invalid anchors are skipped rather than thrown so a config mistake can never take down the
	// home screen; `findDailyChallengeAnchorProblems` is what reports them.
	for (const anchor of anchors) {
		if (anchor.month !== monthNumber) continue;
		const candidate = candidates.find((item) => item.id === anchor.tracklistId);
		const dayIndex = anchor.day - 1;
		if (!candidate || dayIndex < 0 || dayIndex >= schedule.length) continue;
		if (schedule[dayIndex] !== null) continue;

		schedule[dayIndex] = { tracklist: candidate, cause: anchor.cause };
		usedCandidateIds.add(candidate.id);
	}

	const remainingCandidates = seededShuffle(
		fillerPool.filter((item) => !usedCandidateIds.has(item.id)),
		hashString(`${year}-${String(monthNumber).padStart(2, '0')}`)
	);
	const repeatCandidates = seededShuffle(
		fillerPool,
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
