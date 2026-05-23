import type { TimelineReplayLog, TimelineReplayTurn } from '$lib/types/timelineReplay';
import type { Track } from '$lib/models';
import {
	calculateTurnScore,
	calculateCompletion,
	calculateConsolationScore,
	calculateGap,
	calculateMissStreak,
	calculateStreakMult
} from './timelineScoring';

interface ReplayTimelineEntry {
	year: number;
}

interface TimelineAccessContext {
	turn: TimelineReplayTurn;
	turnNum: number;
	label: string;
}

function asFiniteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readTimelineYear(
	timeline: ReplayTimelineEntry[],
	index: number,
	context: TimelineAccessContext
): number {
	const entry = timeline[index];
	if (!entry) {
		const years = timeline.map((item) => item.year).join(', ');
		const part = context.turn.part || '<missing part>';
		throw new Error(
			`[Turn ${context.turnNum}: ${part}] Invalid timeline index while reading ${context.label}: requested index ${index}, timeline length ${timeline.length}, logged index ${context.turn.index ?? 'null'}, years [${years}]`
		);
	}
	return entry.year;
}

/**
 * Replays a timeline log to verify or recalculate scores using the current game logic.
 * This should be used for both the leaderboard (validation) and migration tools.
 */
export function replayTimelineLog(
	log: TimelineReplayLog,
	target: number,
	tracksMap: (gid: string) => Track | undefined,
	onWarning?: (msg: string) => void,
	explicitMinYear?: number,
	explicitMaxYear?: number
): { log: TimelineReplayLog; score: number; newTurns: TimelineReplayTurn[] } {
	let score = 0;
	let currentStreak = 0;
	let totalPlacements = 0;
	let reachedTarget = false;
	let completionBonus = 0;

	const initialTrack = tracksMap(log.initial);
	if (!initialTrack) {
		throw new Error(`Initial track ${log.initial} not found in map.`);
	}

	const getYear = (t: Track) => t.work.end_year ?? t.work.begin_year ?? null;
	const initialYear = log.initialYear;
	const timeline: ReplayTimelineEntry[] = [{ year: initialYear }];

	// Determine tracklist bounds: explicit values win, then log metadata, then approximation from replay years.
	let minYear = explicitMinYear ?? log.tracklistMin;
	let maxYear = explicitMaxYear ?? log.tracklistMax;

	if (explicitMinYear === undefined || explicitMaxYear === undefined) {
		const replayYears = [initialYear];
		for (const turn of log.turns) {
			const track = tracksMap(turn.part);
			const year = asFiniteNumber(turn.year) ?? (track ? getYear(track) : null);
			if (year !== null && year !== undefined) replayYears.push(year);
		}
		for (const year of replayYears) {
			if (explicitMinYear === undefined && year < minYear) minYear = year;
			if (explicitMaxYear === undefined && year > maxYear) maxYear = year;
		}
		if (minYear === Infinity) minYear = 1400;
		if (maxYear === -Infinity) maxYear = 2020;
	}

	const newTurns: TimelineReplayTurn[] = [];

	for (let i = 0; i < log.turns.length; i++) {
		const turn = log.turns[i];
		const turnNum = i + 1;
		totalPlacements++;
		const track = tracksMap(turn.part);
		if (!track) {
			onWarning?.(`[Turn ${turnNum}: ${turn.part}] Track not found in map.`);
			continue;
		}

		const actualYear = getYear(track) ?? 0;
		// Use historical year if available, otherwise fallback to current dataset truth
		const turnYear = turn.year !== undefined ? turn.year : actualYear;

		if (turn.ok) {
			currentStreak++;

			// If the player was correct, we should use THEIR index to determine the gap.
			const playerIndex = turn.index ?? 0;

			// Verify if the slot chosen was actually correct for this year.
			const leftYear =
				playerIndex > 0
					? readTimelineYear(timeline, playerIndex - 1, {
							turn,
							turnNum,
							label: 'left boundary'
						})
					: null;
			const rightYear =
				playerIndex < timeline.length
					? readTimelineYear(timeline, playerIndex, {
							turn,
							turnNum,
							label: 'right boundary'
						})
					: null;

			const isCorrectSlot =
				(leftYear === null || leftYear <= turnYear) &&
				(rightYear === null || turnYear <= rightYear);

			if (!isCorrectSlot) {
				onWarning?.(
					`[Turn ${turnNum}: ${turn.part}] Log says OK but turn is chronologically incorrect (${turnYear}). Slot [${leftYear ?? '...'}, ${rightYear ?? '...'}] at index ${playerIndex}.`
				);
			}

			// If the logged index is correct, use it. Otherwise find the "ideal" one.
			const finalIndex = isCorrectSlot
				? playerIndex
				: findInsertionIndexForYear(turnYear, timeline);

			const finalLeftYear = finalIndex > 0 ? timeline[finalIndex - 1].year : null;
			const finalRightYear = finalIndex < timeline.length ? timeline[finalIndex].year : null;
			const gap = calculateGap(finalLeftYear, finalRightYear, undefined, minYear, maxYear);

			const isEdgePlacement = finalIndex === 0 || finalIndex === timeline.length;

			const turnBreakdown = calculateTurnScore({
				gap,
				seconds: turn.seconds ?? 0,
				streak: currentStreak,
				isEdgePlacement
			});

			let points = turnBreakdown.score;
			// 2-point jitter suppression
			if (Math.abs(points - turn.points) <= 2) {
				points = turn.points;
			} else {
				const diffValue = points - turn.points;
				onWarning?.(
					`[Turn ${turnNum}: ${turn.part}] Points mismatch: Log: ${turn.points}, Logic: ${points} (${diffValue > 0 ? '+' : ''}${diffValue})`
				);
			}

			score += points;

			// Update timeline immediately using the index we chose
			timeline.splice(finalIndex, 0, { year: turnYear });

			if (timeline.length >= target && !reachedTarget) {
				reachedTarget = true;
				completionBonus = calculateCompletion(target, totalPlacements);
				score += completionBonus;
			}

			const multiplier = turnBreakdown.streakMult;

			newTurns.push({
				part: turn.part,
				index: finalIndex,
				ok: true,
				seconds: turn.seconds,
				points,
				streakMult: multiplier,
				year: turnYear
			});
		} else {
			// Incorrect placement
			currentStreak = calculateMissStreak(currentStreak);

			let points = 0;

			if (turn.index !== null) {
				let leftYear: number | null = null;
				let rightYear: number | null = null;

				// Consolation is based on the CORRECT slot distance, not the misplaced index.
				for (const t of timeline) {
					if (t.year <= turnYear) {
						if (leftYear === null || t.year > leftYear) leftYear = t.year;
					}
					if (t.year >= turnYear) {
						if (rightYear === null || t.year < rightYear) rightYear = t.year;
					}
				}

				const placedLeft =
					turn.index > 0
						? readTimelineYear(timeline, turn.index - 1, {
								turn,
								turnNum,
								label: 'placed left boundary'
							})
						: null;
				const placedRight =
					turn.index < timeline.length
						? readTimelineYear(timeline, turn.index, {
								turn,
								turnNum,
								label: 'placed right boundary'
							})
						: null;

				const isTimeoutLog = turn.points === 0;
				const isCorrectSlotButMarkedWrong =
					turnYear >= (placedLeft ?? -Infinity) && turnYear <= (placedRight ?? Infinity);

				if (isTimeoutLog || isCorrectSlotButMarkedWrong) {
					points = 0;
				} else {
					const consolation = calculateConsolationScore(
						turnYear,
						placedLeft,
						placedRight,
						target,
						totalPlacements,
						undefined,
						minYear,
						maxYear
					);
					points = consolation.consolation;
				}
			}

			if (Math.abs(points - turn.points) <= 2) {
				points = turn.points;
			} else {
				const diffValue = points - turn.points;
				onWarning?.(
					`[Turn ${turnNum}: ${turn.part}] Points mismatch: Log: ${turn.points}, Logic: ${points} (${diffValue > 0 ? '+' : ''}${diffValue})`
				);
			}

			score += points;

			const multiplier = calculateStreakMult(currentStreak);

			newTurns.push({
				part: turn.part,
				index: turn.index,
				ok: false,
				seconds: turn.seconds,
				points,
				streakMult: multiplier,
				year: turnYear
			});
		}
	}

	return {
		log: {
			...log,
			initialYear,
			tracklistMin: minYear,
			tracklistMax: maxYear,
			score,
			completionBonus,
			turns: newTurns
		},
		score,
		newTurns
	};
}

function findInsertionIndexForYear(year: number, timeline: ReplayTimelineEntry[]): number {
	let index = 0;
	while (index < timeline.length) {
		if (timeline[index].year > year) break;
		index++;
	}
	return index;
}

/**
 * Validates that a log is complete and ready for replay.
 */
export function isCompletedLog(log: unknown, target?: number): log is TimelineReplayLog {
	if (!log || typeof log !== 'object') return false;
	const candidate = log as Partial<TimelineReplayLog>;
	const basic =
		candidate.v === 1 &&
		typeof candidate.initial === 'string' &&
		candidate.initial.length > 0 &&
		Array.isArray(candidate.turns) &&
		candidate.turns.length > 0;
	const hasMetadata =
		typeof candidate.initialYear === 'number' &&
		Number.isFinite(candidate.initialYear) &&
		typeof candidate.tracklistMin === 'number' &&
		Number.isFinite(candidate.tracklistMin) &&
		typeof candidate.tracklistMax === 'number' &&
		Number.isFinite(candidate.tracklistMax) &&
		candidate.tracklistMin <= candidate.tracklistMax &&
		candidate.initialYear >= candidate.tracklistMin &&
		candidate.initialYear <= candidate.tracklistMax;

	if (!basic || !hasMetadata) return false;
	if (target !== undefined && (candidate.turns?.length ?? 0) < target - 1) return false;

	return true;
}
