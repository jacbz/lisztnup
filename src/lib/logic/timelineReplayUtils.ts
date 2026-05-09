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

/**
 * Replays a timeline log to verify or recalculate scores using the current game logic.
 * This should be used for both the leaderboard (validation) and migration tools.
 */
export function replayTimelineLog(
	log: TimelineReplayLog,
	target: number,
	tracksMap: (gid: string) => Track | undefined,
	onWarning?: (msg: string) => void
): { log: TimelineReplayLog; score: number; newTurns: TimelineReplayTurn[] } {
	let score = 0;
	let currentStreak = 0;
	let totalPlacements = 0;
	let reachedTarget = false;
	let completionBonus = 0;

	const timeline: Track[] = [];
	const initialTrack = tracksMap(log.initial ?? '');
	if (!initialTrack) {
		throw new Error(`Initial track ${log.initial} not found in map.`);
	}

	const getYear = (t: Track) => t.work.end_year ?? t.work.begin_year;
	timeline.push(initialTrack);

	// Calculate tracklist bounds from all tracks present in the log to approximate the original tracklist range
	const allLogTracks = [initialTrack, ...log.turns.map((t) => tracksMap(t.part))].filter(
		Boolean
	) as Track[];
	let minYear = Infinity;
	let maxYear = -Infinity;
	for (const t of allLogTracks) {
		const y = getYear(t);
		if (y != null) {
			if (y < minYear) minYear = y;
			if (y > maxYear) maxYear = y;
		}
	}
	if (minYear === Infinity) minYear = 1400;
	if (maxYear === -Infinity) maxYear = 2020;

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
			const leftYear = playerIndex > 0 ? getYear(timeline[playerIndex - 1]) : null;
			const rightYear = playerIndex < timeline.length ? getYear(timeline[playerIndex]) : null;

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

			const finalLeftYear = finalIndex > 0 ? getYear(timeline[finalIndex - 1]) : null;
			const finalRightYear = finalIndex < timeline.length ? getYear(timeline[finalIndex]) : null;
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
			timeline.splice(finalIndex, 0, track);

			if (timeline.length >= target && !reachedTarget) {
				reachedTarget = true;
				completionBonus = calculateCompletion(target, totalPlacements);
				score += completionBonus;
			}

			if (Math.abs(score - turn.score) <= 2) {
				score = turn.score;
			}

			const multiplier = turnBreakdown.streakMult;

			newTurns.push({
				part: turn.part,
				index: finalIndex,
				ok: true,
				seconds: turn.seconds,
				points,
				streakMult: multiplier,
				score,
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
					const y = getYear(t);
					if (y !== null) {
						if (y <= turnYear) {
							if (leftYear === null || y > leftYear) leftYear = y;
						}
						if (y >= turnYear) {
							if (rightYear === null || y < rightYear) rightYear = y;
						}
					}
				}

				const placedLeft = turn.index > 0 ? getYear(timeline[turn.index - 1]) : null;
				const placedRight = turn.index < timeline.length ? getYear(timeline[turn.index]) : null;

				const isTimeoutLog = turn.points === 0;
				const isCorrectSlotButMarkedWrong =
					turnYear >= (placedLeft ?? -Infinity) && turnYear <= (placedRight ?? Infinity);

				if (isTimeoutLog || isCorrectSlotButMarkedWrong) {
					points = 0;
				} else {
					const consolation = calculateConsolationScore(
						turnYear,
						leftYear,
						rightYear,
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

			if (Math.abs(score - turn.score) <= 2) {
				score = turn.score;
			}

			const multiplier = calculateStreakMult(currentStreak);

			newTurns.push({
				part: turn.part,
				index: turn.index,
				ok: false,
				seconds: turn.seconds,
				points,
				streakMult: multiplier,
				score,
				year: turnYear
			});
		}
	}

	return {
		log: { ...log, score, completionBonus, turns: newTurns },
		score,
		newTurns
	};
}

function findInsertionIndexForYear(year: number, timeline: Track[]): number {
	const getYear = (t: Track) => t.work.end_year ?? t.work.begin_year;
	let index = 0;
	while (index < timeline.length) {
		const y = getYear(timeline[index]);
		if (y !== null && y > year) break;
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
		Array.isArray(candidate.turns) &&
		candidate.turns.length > 0;

	if (!basic) return false;
	if (target !== undefined && (candidate.turns?.length ?? 0) < target) return false;

	return true;
}
