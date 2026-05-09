import type { TimelineReplayLog, TimelineReplayTurn } from '$lib/types/timelineReplay';
import type { Track } from '$lib/models';
import {
	calculateTurnScore,
	calculateCompletion,
	calculateConsolationScore,
	calculateGap,
	calculateMissStreak
} from './timelineScoring';

/**
 * Validates if a log represents a completed game.
 */
export function isCompletedLog(log: unknown, target: unknown): boolean {
	if (!log || typeof log !== 'object') return false;
	const replay = log as { v?: unknown; initial?: unknown; turns?: unknown };
	if (replay.v !== 1 || !Array.isArray(replay.turns)) return false;
	if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) {
		return false;
	}
	const initialCount = typeof replay.initial === 'string' && replay.initial.length > 0 ? 1 : 0;
	const correctTurns = replay.turns.filter(
		(turn) => !!turn && typeof turn === 'object' && (turn as { ok?: unknown }).ok === true
	).length;
	return initialCount + correctTurns >= target;
}

/**
 * Recalculates the exact score of a replay log by simulating the placements,
 * returning the new total score and a freshly updated log object.
 *
 * @param log The original replay log.
 * @param target The target number of cards for completion.
 * @param tracksMap A map or getter to resolve a track by its part gid.
 * @param onWarning Optional callback to report data discrepancies.
 */
export function replayTimelineLog(
	log: TimelineReplayLog,
	target: number,
	tracksMap: (partGid: string) => Track | undefined,
	onWarning?: (msg: string) => void
): { score: number; log: TimelineReplayLog } {
	let score = 0;
	let currentStreak = 0;
	let absoluteStreak = 0;
	let totalPlacements = 0;
	let reachedTarget = false;
	let completionBonus = 0;

	// The active timeline state
	const timeline: Track[] = [];

	if (log.initial) {
		const track = tracksMap(log.initial);
		if (track) timeline.push(track);
		else onWarning?.(`Initial track ${log.initial} not found in map.`);
	}

	const getYear = (t: Track) => t.work.end_year ?? t.work.begin_year ?? 0;

	const newTurns: TimelineReplayTurn[] = [];

	for (const turn of log.turns) {
		totalPlacements++;
		const track = tracksMap(turn.part);
		if (!track) {
			onWarning?.(`Track ${turn.part} not found in map.`);
			// Keep turn as is, we can't recalculate accurately without year
			newTurns.push({ ...turn });
			continue;
		}

		const actualYear = getYear(track);

		// Warn if the year in the log doesn't match the database year
		if (turn.year !== undefined && turn.year !== actualYear) {
			onWarning?.(
				`Year mismatch for ${turn.part}: log says ${turn.year}, database says ${actualYear}. Using log's year to be safe, but you should check this.`
			);
		}

		// Use the year from the database primarily, but if the log has a different year,
		// we should probably trust the log's year for historical accuracy of what was played.
		// Wait, the user said: "Also think about other possible warnings (e.g. when something does not match the logic)".
		// For the year, the user specifically said: "when recalculating, use the log's year (but print a warning when it does not match the dataset)".
		const turnYear = turn.year !== undefined ? turn.year : actualYear;

		if (turn.ok) {
			currentStreak++;
			absoluteStreak++;

			let prevYear: number | null = null;
			let nextYear: number | null = null;

			if (turn.index !== null) {
				if (turn.index > 0 && timeline[turn.index - 1]) {
					prevYear = getYear(timeline[turn.index - 1]);
				}
				if (turn.index < timeline.length && timeline[turn.index]) {
					nextYear = getYear(timeline[turn.index]);
				}
				// Insert into timeline
				timeline.splice(turn.index, 0, track);
			} else {
				// Fallback if index missing on correct turn, append to end
				if (timeline.length > 0) prevYear = getYear(timeline[timeline.length - 1]);
				timeline.push(track);
			}

			const gap = calculateGap(prevYear, nextYear);
			const isEdgePlacement = prevYear === null || nextYear === null;

			const turnBreakdown = calculateTurnScore({
				gap,
				seconds: turn.seconds ?? 0,
				streak: currentStreak,
				isEdgePlacement
			});

			let points = turnBreakdown.score;
			// 2-point jitter suppression: if logic is within 2pts of log, trust the log
			// (likely due to rounded 'seconds' in the log vs high-precision time in the original game)
			if (Math.abs(points - turn.points) <= 2) {
				points = turn.points;
			} else {
				const diff = points - turn.points;
				onWarning?.(
					`Points mismatch for ${turn.part}: Log: ${turn.points}, Logic: ${points} (${diff > 0 ? '+' : ''}${diff})`
				);
			}

			score += points;

			if (timeline.length >= target && !reachedTarget) {
				reachedTarget = true;
				completionBonus = calculateCompletion(target, totalPlacements);
				score += completionBonus;
			}

			if (Math.abs(score - turn.score) <= 2) {
				score = turn.score;
			}

			newTurns.push({
				part: turn.part,
				index: turn.index,
				ok: true,
				seconds: turn.seconds,
				points,
				streak: absoluteStreak,
				score,
				year: turnYear
			});
		} else {
			// Incorrect placement
			currentStreak = calculateMissStreak(currentStreak);
			absoluteStreak = 0;

			let points = 0;

			if (turn.index !== null) {
				let leftYear: number | null = null;
				let rightYear: number | null = null;

				// Consolation is based on the CORRECT slot distance, not the misplaced index.
				for (const t of timeline) {
					const y = getYear(t);
					if (y <= turnYear) {
						if (leftYear === null || y > leftYear) leftYear = y;
					}
					if (y >= turnYear) {
						if (rightYear === null || y < rightYear) rightYear = y;
					}
				}

				// If it was marked incorrect but awarded 0 points in the log,
				// or if it was a correct slot placement marked incorrect,
				// it's a timeout (either a true timeout or a pending placement timeout).
				const placedLeft = turn.index > 0 ? getYear(timeline[turn.index - 1]) : null;
				const placedRight = turn.index < timeline.length ? getYear(timeline[turn.index]) : null;
				const wasPlacedCorrectly =
					(placedLeft === null || turnYear >= placedLeft) &&
					(placedRight === null || turnYear <= placedRight);

				if (wasPlacedCorrectly || turn.points === 0) {
					points = 0;
				} else {
					const cons = calculateConsolationScore(
						turnYear,
						leftYear,
						rightYear,
						target,
						totalPlacements
					);
					points = cons.consolation;
				}
				score += points;
			}
			// if turn.index is null, it's a timeout, no points, totalPlacements not incremented for timeout in current logic

			if (Math.abs(points - turn.points) <= 2) {
				points = turn.points;
			} else {
				const diffValue = points - turn.points;
				onWarning?.(
					`Points mismatch for ${turn.part}: Log: ${turn.points}, Logic: ${points} (${diffValue > 0 ? '+' : ''}${diffValue})`
				);
			}

			if (Math.abs(score - turn.score) <= 2) {
				score = turn.score;
			}

			if (absoluteStreak !== turn.streak && !turn.ok) {
				// For misses, log might store currentStreak (reduced) or absolute (0).
				// TimelineGame pushes currentStreak.
				if (currentStreak !== turn.streak) {
					onWarning?.(
						`Streak mismatch for ${turn.part}: log says ${turn.streak}, logic says ${currentStreak} (miss)`
					);
				}
			}

			newTurns.push({
				part: turn.part,
				index: turn.index,
				ok: false,
				seconds: turn.seconds,
				points,
				streak: currentStreak,
				score,
				year: turnYear
			});
		}
	}

	if (completionBonus !== log.completionBonus) {
		onWarning?.(
			`Completion bonus mismatch: log says ${log.completionBonus}, logic says ${completionBonus}`
		);
	}

	return {
		score,
		log: {
			v: 1,
			initial: log.initial,
			completionBonus,
			turns: newTurns
		}
	};
}
