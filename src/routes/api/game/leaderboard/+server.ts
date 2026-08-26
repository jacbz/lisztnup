import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { D1Database } from '@cloudflare/workers-types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import {
	ALL_TIME_PERIOD_KEY,
	formatD1TimestampAsGermanDate,
	getMonthPeriodKey,
	getWeekPeriodKey
} from '$lib/utils/date';
import { logger } from '$lib/server/logging';
import { rebuildPlayerRollup } from '$lib/server/leaderboardRollup';
import { TIMELINE_TARGET_OPTIONS } from '$lib/types/game';
import type { LeaderboardCountrySummary, LeaderboardPeriod, LeaderboardScope } from '$lib/types';
import { isCompletedLog } from '$lib/logic/timelineReplayUtils';

const MAX_NAME_LENGTH = 30;
const MAX_SCORE = 1_000_000;
const MAX_CARDS = 100;
const MAX_SCORE_PER_CARD = 6000;
const MAX_SUBMISSIONS_PER_HOUR = 60;
const ALLOWED_TIMELINE_TARGETS = new Set<number>(TIMELINE_TARGET_OPTIONS);
const LEADERBOARD_PERIODS: LeaderboardPeriod[] = ['weekly', 'monthly', 'allTime'];

/**
 * All reads below go through `leaderboard_best`, where "one row per player per
 * config" is the primary key. That is what removes the old ROW_NUMBER() dedup
 * CTE: ranking is now an index-ordered LIMIT against `idx_lb_best_rank`, so a
 * top-10 request reads ~10 rows rather than the whole score history.
 */

const ENTRY_COLUMNS = `player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, country, timestamp, score_id, has_log`;
const ENTRY_ORDER = `score DESC, has_log DESC, timestamp DESC`;

function periodKeyFor(period: LeaderboardPeriod): string {
	if (period === 'weekly') return getWeekPeriodKey();
	if (period === 'monthly') return getMonthPeriodKey();
	return ALL_TIME_PERIOD_KEY;
}

function parseClientTimestamp(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	const now = Date.now();
	if (ms > now + 5 * 60_000) return null;
	if (ms < now - 30 * 24 * 60 * 60_000) return null;
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeCountryCode(value: string | null): string | null {
	if (!value) return null;
	const normalized = value.trim().toUpperCase();
	return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

interface RollupEntryRow extends Record<string, unknown> {
	player_token: string;
	player_name: string;
	score: number;
	country: string | null;
	timestamp: string;
	score_id: number;
	has_log: number;
}

function shapeEntry(row: RollupEntryRow, playerToken: string | null, rank: number) {
	const { player_token, player_name, has_log, ...rest } = row;
	return {
		...rest,
		rank,
		// '' is the rollup's internal spelling of "anonymous"; the API contract is null.
		player_name: player_name === '' ? null : player_name,
		has_log: has_log === 1,
		timestamp: formatD1TimestampAsGermanDate(rest.timestamp) ?? undefined,
		is_me: playerToken ? player_token === playerToken : false
	};
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const rawPeriod = url.searchParams.get('period');
	const requestedPeriod: LeaderboardPeriod = LEADERBOARD_PERIODS.includes(
		rawPeriod as LeaderboardPeriod
	)
		? (rawPeriod as LeaderboardPeriod)
		: 'allTime';

	if (!platform?.env?.DB) {
		return json({
			entries: [],
			period: requestedPeriod,
			requestedPeriod,
			scope: 'global'
		});
	}

	const records = url.searchParams.get('records') === '1';
	const limit = records
		? Math.min(Number(url.searchParams.get('limit')) || 500, 500)
		: Math.min(Number(url.searchParams.get('limit')) || 10, 50);
	const tracklistId = url.searchParams.get('tracklist') || null;
	const target = Number(url.searchParams.get('target')) || null;
	const playerToken = url.searchParams.get('token') || null;
	const requestedCountry = normalizeCountryCode(url.searchParams.get('country'));
	const allowFallback = url.searchParams.get('fallback') !== '0';
	const rawScope = url.searchParams.get('scope');
	const scope: LeaderboardScope =
		rawScope === 'national' || rawScope === 'personal' ? rawScope : 'global';
	const viewerCountry = platform.cf?.country || null;
	const canIncludePlayerRank = scope === 'global' && !!playerToken && !records;
	const canIncludeCountryRank =
		scope === 'global' && !!viewerCountry && viewerCountry !== 'UNKNOWN' && !records;
	const db = platform.env.DB;

	if (scope === 'personal' && !playerToken) {
		return json({
			entries: [],
			viewerCountry,
			period: 'allTime',
			requestedPeriod,
			scope
		});
	}

	try {
		let nationalCountry = requestedCountry ?? viewerCountry;
		let responseViewerCountry = viewerCountry;
		if (scope === 'national') {
			if ((!nationalCountry || nationalCountry === 'UNKNOWN') && playerToken) {
				const savedCountry = await db
					.prepare(
						`SELECT country FROM leaderboard_best
						 WHERE player_token = ?1 AND country IS NOT NULL
						 ORDER BY country <> 'UNKNOWN' DESC, timestamp DESC
						 LIMIT 1`
					)
					.bind(playerToken)
					.first<{ country: string | null }>();
				nationalCountry = savedCountry?.country ?? null;
			}
			responseViewerCountry = nationalCountry;
		}
		if (scope === 'national' && !nationalCountry) {
			return json({
				entries: [],
				viewerCountry: responseViewerCountry,
				period: requestedPeriod,
				requestedPeriod,
				scope
			});
		}

		/** Filters shared by every read, all of them index-seekable. */
		function baseFilter(period: LeaderboardPeriod) {
			const binds: (string | number)[] = [periodKeyFor(period)];
			const conditions = [`period_key = ?1`, `suppressed = 0`];

			if (tracklistId) {
				conditions.push(`tracklist_id = ?${binds.length + 1}`);
				binds.push(tracklistId);
			}
			if (target) {
				conditions.push(`target = ?${binds.length + 1}`);
				binds.push(target);
			}
			if (records) {
				conditions.push(`tracklist_id <> ?${binds.length + 1}`);
				binds.push('custom');
			}
			if (!records && scope === 'national' && nationalCountry) {
				conditions.push(`country = ?${binds.length + 1}`);
				binds.push(nationalCountry);
			}
			if (!records && scope === 'personal' && playerToken) {
				conditions.push(`player_token = ?${binds.length + 1}`);
				binds.push(playerToken);
			}
			return { conditions, binds };
		}

		async function queryCountrySummaries(period: LeaderboardPeriod) {
			if (records || scope === 'personal') return [];

			const { conditions, binds } = baseFilter(period);
			const whereClause = [...conditions, `country IS NOT NULL`, `country <> 'UNKNOWN'`].join(
				' AND '
			);
			const results = await db
				.prepare(
					`SELECT country, COUNT(*) AS count, MAX(score) AS bestScore
					 FROM leaderboard_best
					 WHERE ${whereClause}
					 GROUP BY country
					 ORDER BY count DESC, bestScore DESC, country ASC`
				)
				.bind(...binds)
				.all();

			return (results.results ?? [])
				.map((row: Record<string, unknown>) => ({
					country: String(row.country ?? ''),
					count: Number(row.count ?? 0),
					bestScore: Number(row.bestScore ?? 0)
				}))
				.filter(
					(summary: LeaderboardCountrySummary) =>
						summary.country.length === 2 &&
						Number.isFinite(summary.count) &&
						Number.isFinite(summary.bestScore)
				);
		}

		/** Rank of a row scoring `score` = how many rows beat it, plus one. */
		async function rankOf(period: LeaderboardPeriod, score: number): Promise<number | null> {
			const { conditions, binds } = baseFilter(period);
			const row = await db
				.prepare(
					`SELECT COUNT(*) AS ahead FROM leaderboard_best
					 WHERE ${conditions.join(' AND ')} AND score > ?${binds.length + 1}`
				)
				.bind(...binds, score)
				.first<{ ahead: number }>();
			return row ? Number(row.ahead) + 1 : null;
		}

		/**
		 * A single row outside the top-N that we still want to show: the viewer's
		 * own best, or their country's best. Fetched individually so the main
		 * query stays a clean LIMIT instead of an OR against subqueries.
		 */
		async function queryOutlier(
			period: LeaderboardPeriod,
			column: 'player_token' | 'country',
			value: string
		) {
			const { conditions, binds } = baseFilter(period);
			const row = await db
				.prepare(
					`SELECT ${ENTRY_COLUMNS} FROM leaderboard_best
					 WHERE ${conditions.join(' AND ')} AND ${column} = ?${binds.length + 1}
					 ORDER BY ${ENTRY_ORDER} LIMIT 1`
				)
				.bind(...binds, value)
				.first<RollupEntryRow>();
			return row ?? null;
		}

		async function queryEntries(period: LeaderboardPeriod) {
			const { conditions, binds } = baseFilter(period);

			// Records mode wants the single best run per (tracklist, target). The
			// window function keeps the same tiebreak as everywhere else; the rollup
			// it ranks over is one row per player, and the WHERE is index-seeked.
			const sql = records
				? `WITH ranked AS (
				     SELECT ${ENTRY_COLUMNS},
				       ROW_NUMBER() OVER (PARTITION BY tracklist_id, target ORDER BY ${ENTRY_ORDER}) AS rn
				     FROM leaderboard_best
				     WHERE ${conditions.join(' AND ')}
				   )
				   SELECT ${ENTRY_COLUMNS} FROM ranked WHERE rn = 1
				   ORDER BY timestamp DESC
				   LIMIT ?${binds.length + 1}`
				: `SELECT ${ENTRY_COLUMNS}
				   FROM leaderboard_best
				   WHERE ${conditions.join(' AND ')}
				   ORDER BY ${ENTRY_ORDER}
				   LIMIT ?${binds.length + 1}`;

			const results = await db
				.prepare(sql)
				.bind(...binds, limit)
				.all();
			const rows = (results.results ?? []) as unknown as RollupEntryRow[];

			if (records) {
				return rows.map((row, index) => shapeEntry(row, playerToken, index + 1));
			}

			const entries = rows.map((row, index) => shapeEntry(row, playerToken, index + 1));
			if (entries.length === 0) return entries;

			// Append the viewer's own row and their country's best when either falls
			// below the cut, matching the old query's OR-branches.
			const seen = new Set(rows.map((row) => `${row.player_token}|${row.score_id}`));
			const outliers: Array<{ column: 'player_token' | 'country'; value: string }> = [];
			if (canIncludePlayerRank && playerToken) {
				outliers.push({ column: 'player_token', value: playerToken });
			}
			if (canIncludeCountryRank && viewerCountry) {
				outliers.push({ column: 'country', value: viewerCountry });
			}

			for (const { column, value } of outliers) {
				const row = await queryOutlier(period, column, value);
				if (!row) continue;
				const identity = `${row.player_token}|${row.score_id}`;
				if (seen.has(identity)) continue;
				seen.add(identity);
				const rank = await rankOf(period, row.score);
				entries.push(shapeEntry(row, playerToken, rank ?? entries.length + 1));
			}

			entries.sort((a, b) => a.rank - b.rank);
			return entries;
		}

		const fallbackPeriods: LeaderboardPeriod[] =
			records || scope === 'personal'
				? ['allTime']
				: !allowFallback
					? [requestedPeriod]
					: requestedPeriod === 'weekly'
						? ['weekly', 'monthly', 'allTime']
						: requestedPeriod === 'monthly'
							? ['monthly', 'allTime']
							: ['allTime'];
		const emptyPeriods: LeaderboardPeriod[] = [];
		for (const period of fallbackPeriods) {
			const entries = await queryEntries(period);
			if (entries.length > 0 || period === fallbackPeriods[fallbackPeriods.length - 1]) {
				const effectivePeriod = scope === 'personal' || records ? 'allTime' : period;
				const countries = await queryCountrySummaries(effectivePeriod);
				return json({
					entries,
					countries,
					viewerCountry: responseViewerCountry,
					period: effectivePeriod,
					requestedPeriod,
					scope,
					emptyPeriods
				});
			}
			emptyPeriods.push(period);
		}

		return json({
			entries: [],
			countries: [],
			viewerCountry: responseViewerCountry,
			period: 'allTime',
			requestedPeriod,
			scope
		});
	} catch (err) {
		await logger.error(platform.env.DB, 'Leaderboard GET server error', {
			context: { error: err instanceof Error ? err.message : String(err) }
		});
		return json({ entries: [], period: requestedPeriod, requestedPeriod, scope });
	}
};

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	if (!platform?.env?.DB) {
		return json({ success: false, reason: 'No DB configured' }, { status: 503 });
	}

	const db = platform.env.DB;
	const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';
	const userHash = await hashUser(ip, getCurrentSalt());
	const country = platform.cf?.country || 'UNKNOWN';

	try {
		const body = await request.json();
		const {
			playerToken,
			playerName,
			score,
			target,
			attempts,
			averageTime,
			longestStreak,
			tracklistId,
			sessionId,
			log,
			occurredAt
		} = body;

		// ── Required field validation ──────────────────────
		if (
			!playerToken ||
			typeof score !== 'number' ||
			typeof target !== 'number' ||
			typeof attempts !== 'number'
		) {
			await logger.warn(db, 'Leaderboard: missing/invalid required fields', {
				userHash,
				country,
				sessionId,
				context: { hasToken: !!playerToken, score, target, attempts, log }
			});
		}
		// playerName is optional — null means anonymous submission
		const nameProvided =
			playerName != null && typeof playerName === 'string' && playerName.length > 0;
		if (nameProvided && playerName.length > MAX_NAME_LENGTH) {
			await logger.warn(db, 'Leaderboard: name too long', {
				userHash,
				country,
				sessionId,
				context: { nameLength: playerName.length, log }
			});
		}
		const storedPlayerName = nameProvided ? playerName.slice(0, MAX_NAME_LENGTH) : null;

		// ── Range checks (self-contained, no DB dependency) ─
		if (score < 0 || score > MAX_SCORE) {
			await logger.warn(db, 'Leaderboard: score out of range', {
				userHash,
				country,
				sessionId,
				context: { score, log }
			});
		}
		if (target < 1 || target > MAX_CARDS) {
			await logger.warn(db, 'Leaderboard: target out of range', {
				userHash,
				country,
				sessionId,
				context: { target, log }
			});
		}
		if (!Number.isInteger(target) || !ALLOWED_TIMELINE_TARGETS.has(target)) {
			await logger.warn(db, 'Leaderboard POST rejected: invalid timeline target', {
				userHash,
				country,
				sessionId,
				context: { target, log }
			});
			return json({ success: false, reason: 'Invalid target' }, { status: 400 });
		}
		if (typeof tracklistId !== 'string' || tracklistId.length === 0) {
			await logger.warn(db, 'Leaderboard: invalid tracklist', {
				userHash,
				country,
				sessionId,
				context: { tracklistId, log }
			});
		}
		if (attempts < Math.max(0, target - 1) || attempts > MAX_CARDS * 5) {
			await logger.warn(db, 'Leaderboard: attempts out of range', {
				userHash,
				country,
				sessionId,
				context: { attempts, target, log }
			});
		}
		if (
			typeof averageTime === 'number' &&
			(averageTime < 0 || averageTime > 3600 || !Number.isFinite(averageTime))
		) {
			await logger.warn(db, 'Leaderboard: average time out of range', {
				userHash,
				country,
				sessionId,
				context: { averageTime, log }
			});
		}
		if (typeof longestStreak === 'number' && (longestStreak < 0 || longestStreak > attempts)) {
			await logger.warn(db, 'Leaderboard: streak out of range', {
				userHash,
				country,
				sessionId,
				context: { longestStreak, attempts, log }
			});
		}
		if (score > target * MAX_SCORE_PER_CARD) {
			await logger.warn(db, 'Leaderboard: score implausible', {
				userHash,
				country,
				sessionId,
				context: { score, target, maxPerCard: MAX_SCORE_PER_CARD, log }
			});
		}
		if (!log || !isCompletedLog(log, target)) {
			await logger.warn(db, 'Leaderboard: incomplete replay', {
				userHash,
				country,
				sessionId,
				context: { target, log }
			});
		}

		const timestamp = parseClientTimestamp(occurredAt);
		const logJson = log ? JSON.stringify(log) : null;
		const hasLog = logJson ? 1 : 0;

		// ── Idempotency check: same session + player + exact score payload ──
		// Anonymous submissions can be retried after the server inserted but the client
		// missed the response, so dedupe them too without collapsing local multiplayer rows.
		// Seeks via idx_scores_session; the replay blob is no longer part of the
		// comparison since it now lives in its own table.
		if (sessionId && typeof sessionId === 'string') {
			const duplicateNameCondition = nameProvided ? 'player_name = ?3' : 'player_name IS NULL';
			const duplicatePayload = nameProvided
				? [
						sessionId,
						playerToken,
						storedPlayerName,
						Math.round(score),
						Math.round(target),
						Math.round(attempts),
						tracklistId,
						hasLog
					]
				: [
						sessionId,
						playerToken,
						Math.round(score),
						Math.round(target),
						Math.round(attempts),
						tracklistId,
						hasLog
					];
			const dupCheck = await db
				.prepare(
					`SELECT id FROM timeline_scores
					 WHERE session_id = ?1
					   AND player_token = ?2
					   AND ${duplicateNameCondition}
					   AND score = ?${nameProvided ? 4 : 3}
					   AND target = ?${nameProvided ? 5 : 4}
					   AND attempts = ?${nameProvided ? 6 : 5}
					   AND tracklist_id = ?${nameProvided ? 7 : 6}
					   AND has_log = ?${nameProvided ? 8 : 7}
					 ORDER BY id DESC LIMIT 1`
				)
				.bind(...duplicatePayload)
				.first<{ id: number }>();
			if (dupCheck) {
				return json({ success: true, id: dupCheck.id });
			}
		}

		// ── Rate limit: max submissions per IP per hour (seeks idx_scores_ratelimit) ─
		const rateCheck = await db
			.prepare(
				`SELECT COUNT(*) AS cnt FROM timeline_scores
				 WHERE user_hash = ?1 AND timestamp > datetime('now', '-1 hour')`
			)
			.bind(userHash)
			.first<{ cnt: number }>();
		if (rateCheck && rateCheck.cnt >= MAX_SUBMISSIONS_PER_HOUR) {
			await logger.warn(db, 'Leaderboard POST rejected: rate limit exceeded', {
				userHash,
				country,
				sessionId,
				context: { log }
			});
			return json({ success: false, reason: 'Rate limited' }, { status: 429 });
		}

		// ── Insert ────────────────────────────────────────
		const result = await db
			.prepare(
				`INSERT INTO timeline_scores (timestamp, player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, country, user_hash, session_id, has_log)
			 VALUES (COALESCE(?1, CURRENT_TIMESTAMP), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
			)
			.bind(
				timestamp,
				playerToken,
				storedPlayerName,
				Math.round(score),
				Math.round(attempts),
				Math.round(target),
				typeof averageTime === 'number' ? Math.round(averageTime * 10) / 10 : null,
				longestStreak ?? 0,
				tracklistId,
				country,
				userHash,
				sessionId ?? null,
				hasLog
			)
			.run();

		const scoreId = result.meta.last_row_id;

		if (logJson && scoreId) {
			await db
				.prepare(
					`INSERT INTO timeline_score_logs (score_id, log) VALUES (?1, ?2)
					 ON CONFLICT(score_id) DO UPDATE SET log = ?2`
				)
				.bind(scoreId, logJson)
				.run();
		}

		await rebuildPlayerRollup(db, playerToken);

		return json({ success: true, id: scoreId });
	} catch (err) {
		await logger.error(db, 'Leaderboard POST server error', {
			userHash,
			country,
			context: { error: err instanceof Error ? err.message : String(err) }
		});
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request, platform }) => {
	if (!platform?.env?.DB) {
		return json({ success: false, reason: 'No DB configured' }, { status: 503 });
	}

	try {
		const body = await request.json();
		const { id, playerToken, playerName } = body;

		if (!playerToken) {
			return json({ success: false, reason: 'Invalid payload' }, { status: 400 });
		}
		if (
			typeof playerName !== 'string' ||
			playerName.trim().length === 0 ||
			playerName.trim().length > MAX_NAME_LENGTH
		) {
			return json({ success: false, reason: 'Invalid name' }, { status: 400 });
		}

		const db: D1Database = platform.env.DB;
		const trimmedName = playerName.trim().slice(0, MAX_NAME_LENGTH);
		const numericId = typeof id === 'number' && Number.isFinite(id) ? Math.round(id) : null;

		// Claim all anonymous history for this browser token. When the current row id is known,
		// rename it too so local multiplayer rows can keep their own published names.
		const result = await db
			.prepare(
				`UPDATE timeline_scores SET player_name = ?1
				 WHERE player_token = ?2 AND (player_name IS NULL OR id = ?3)`
			)
			.bind(trimmedName, playerToken, numericId)
			.run();

		if (result.meta.changes === 0) {
			if (numericId == null) {
				return json({ success: false, reason: 'No anonymous scores' }, { status: 404 });
			}

			const existing = await db
				.prepare(`SELECT player_name FROM timeline_scores WHERE id = ?1 AND player_token = ?2`)
				.bind(numericId, playerToken)
				.first<{ player_name: string | null }>();

			if (!existing) {
				return json({ success: false, reason: 'Not found' }, { status: 404 });
			}
			return json({ success: true });
		}

		// Renaming changes both the rollup's key and its suppression flags, so the
		// player's rows are rebuilt wholesale rather than patched in place.
		await rebuildPlayerRollup(db, playerToken);

		return json({ success: true });
	} catch (err) {
		await logger.error(platform.env.DB, 'Leaderboard PATCH server error', {
			context: { error: err instanceof Error ? err.message : String(err) }
		});
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
