import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import { formatD1TimestampAsGermanDate } from '$lib/utils/date';
import { logger } from '$lib/server/logging';

const MAX_NAME_LENGTH = 30;
const MAX_SCORE = 1_000_000;
const MAX_CARDS = 100;
const MAX_SCORE_PER_CARD = 6000;
const MAX_SUBMISSIONS_PER_HOUR = 60;

function parseClientTimestamp(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	const now = Date.now();
	if (ms > now + 5 * 60_000) return null;
	if (ms < now - 30 * 24 * 60 * 60_000) return null;
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

import { isCompletedLog } from '$lib/logic/timelineReplayUtils';

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return json({ entries: [] });
	}

	const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
	const tracklistId = url.searchParams.get('tracklist') || null;
	const target = Number(url.searchParams.get('target')) || null;
	const playerToken = url.searchParams.get('token') || null;
	const records = url.searchParams.get('records') === '1';
	const viewerCountry = platform.cf?.country || null;
	const canIncludeCountryRank = !!viewerCountry && viewerCountry !== 'UNKNOWN' && !records;

	try {
		// Use ROW_NUMBER() to keep only each player's best score per config
		// Partition by token+name to allow multiple entries from local multiplayer
		// NULL player_name entries collapse per token (anonymous best-of-device)
		// We prefer entries with a replay log, then higher scores, then newer entries
		// Anonymous entries are excluded when a named entry for the same token exists
		// with an equal or higher score (if the named entry scores lower, both appear)
		const binds: (string | number)[] = [];
		const conditions: string[] = [];

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

		const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
		const cols = `player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, country, timestamp, log`;
		const sql = records
			? `WITH ranked AS (
					SELECT ${cols},
						ROW_NUMBER() OVER (PARTITION BY tracklist_id, target ORDER BY score DESC, log IS NOT NULL DESC, timestamp DESC) AS rn
					FROM timeline_scores${whereClause}
				)
				SELECT ${cols},
					RANK() OVER (ORDER BY timestamp DESC) as rank
				FROM ranked
				WHERE rn = 1
				ORDER BY timestamp DESC LIMIT ?${binds.length + 1}`
			: `WITH best AS (
					SELECT ${cols},
						ROW_NUMBER() OVER (PARTITION BY player_token, player_name ORDER BY score DESC, log IS NOT NULL DESC, timestamp DESC) AS rn
					FROM timeline_scores${whereClause}
				), deduped AS (
					SELECT ${cols} FROM best WHERE rn = 1
				), max_named AS (
					SELECT player_token, MAX(score) AS max_named_score
					FROM deduped WHERE player_name IS NOT NULL
					GROUP BY player_token
				), final_list AS (
					SELECT d.player_token, d.player_name, d.score, d.attempts, d.target, d.average_time, d.longest_streak, d.tracklist_id, d.country, d.timestamp, d.log,
						RANK() OVER (ORDER BY d.score DESC, d.log IS NOT NULL DESC, d.timestamp DESC) as rank
					FROM deduped d
					LEFT JOIN max_named mn ON d.player_token = mn.player_token
					WHERE d.player_name IS NOT NULL
						OR mn.player_token IS NULL
						OR d.score > mn.max_named_score
				)
				SELECT * FROM final_list
				WHERE rank <= ?${binds.length + 1}
					${playerToken ? `OR rank = (SELECT rank FROM final_list WHERE player_token = ?${binds.length + 2} ORDER BY rank ASC LIMIT 1)` : ''}
					${canIncludeCountryRank ? `OR rank = (SELECT rank FROM final_list WHERE country = ?${binds.length + (playerToken ? 3 : 2)} ORDER BY rank ASC LIMIT 1)` : ''}
				ORDER BY rank ASC`;

		binds.push(limit);
		if (playerToken && !records) {
			binds.push(playerToken);
		}
		if (canIncludeCountryRank) {
			binds.push(viewerCountry);
		}

		const results = await platform.env.DB.prepare(sql)
			.bind(...binds)
			.all();

		// Map results: replace raw token with is_me flag for privacy
		const entries = (results.results ?? []).map((row: Record<string, unknown>) => {
			const { player_token, ...rest } = row;
			return {
				...rest,
				timestamp: formatD1TimestampAsGermanDate(rest.timestamp) ?? undefined,
				is_me: playerToken ? player_token === playerToken : false
			};
		});

		return json({ entries, viewerCountry });
	} catch (err) {
		await logger.error(platform.env.DB, 'Leaderboard GET server error', {
			context: { error: err instanceof Error ? err.message : String(err) }
		});
		return json({ entries: [] });
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

		// ── Idempotency check: same session + player + exact score payload ──
		// Anonymous submissions can be retried after the server inserted but the client
		// missed the response, so dedupe them too without collapsing local multiplayer rows.
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
						logJson
					]
				: [
						sessionId,
						playerToken,
						Math.round(score),
						Math.round(target),
						Math.round(attempts),
						tracklistId,
						logJson
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
					   AND (log = ?${nameProvided ? 8 : 7} OR (log IS NULL AND ?${nameProvided ? 8 : 7} IS NULL))
					 ORDER BY id DESC LIMIT 1`
				)
				.bind(...duplicatePayload)
				.first<{ id: number }>();
			if (dupCheck) {
				return json({ success: true, id: dupCheck.id });
			}
		}

		// ── Rate limit: max submissions per IP per hour ───
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
				`INSERT INTO timeline_scores (timestamp, player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, country, user_hash, session_id, log)
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
				logJson
			)
			.run();

		return json({ success: true, id: result.meta.last_row_id });
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

		const db = platform.env.DB;
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

		return json({ success: true });
	} catch (err) {
		await logger.error(platform.env.DB, 'Leaderboard PATCH server error', {
			context: { error: err instanceof Error ? err.message : String(err) }
		});
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
