import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import { formatD1TimestampAsGermanDate } from '$lib/utils/date';

const MAX_NAME_LENGTH = 30;
const MAX_SCORE = 1_000_000;
const MAX_CARDS = 500;
const MAX_SCORE_PER_CARD = 6000;
const MAX_SUBMISSIONS_PER_HOUR = 10;

function parseClientTimestamp(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	const now = Date.now();
	if (ms > now + 5 * 60_000) return null;
	if (ms < now - 30 * 24 * 60 * 60_000) return null;
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function isCompletedLog(log: unknown, cardsToWin: unknown): boolean {
	if (!log || typeof log !== 'object') return false;
	const replay = log as { v?: unknown; initial?: unknown; turns?: unknown };
	if (replay.v !== 1 || !Array.isArray(replay.turns)) return false;
	if (typeof cardsToWin !== 'number' || !Number.isFinite(cardsToWin) || cardsToWin <= 0) {
		return false;
	}
	const initialCount = typeof replay.initial === 'string' && replay.initial.length > 0 ? 1 : 0;
	const correctTurns = replay.turns.filter(
		(turn) => !!turn && typeof turn === 'object' && (turn as { ok?: unknown }).ok === true
	).length;
	return initialCount + correctTurns >= cardsToWin;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return json({ entries: [] });
	}

	const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
	const tracklistId = url.searchParams.get('tracklist') || null;
	const cardsToWin = Number(url.searchParams.get('cardsToWin')) || null;
	const playerToken = url.searchParams.get('token') || null;

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
		if (cardsToWin) {
			conditions.push(`cards_to_win = ?${binds.length + 1}`);
			binds.push(cardsToWin);
		}

		const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
		const cols = `player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, cards_to_win, country, timestamp, log`;

		const sql = `WITH best AS (
				SELECT ${cols},
					ROW_NUMBER() OVER (PARTITION BY player_token, player_name ORDER BY score DESC, log IS NOT NULL DESC, timestamp DESC) AS rn
				FROM timeline_scores${whereClause}
			), deduped AS (
				SELECT ${cols} FROM best WHERE rn = 1
			), max_named AS (
				SELECT player_token, MAX(score) AS max_named_score
				FROM deduped WHERE player_name IS NOT NULL
				GROUP BY player_token
			)
			SELECT d.player_token, d.player_name, d.score, d.attempts, d.target, d.average_time, d.longest_streak, d.tracklist_id, d.cards_to_win, d.country, d.timestamp, d.log
			FROM deduped d
			LEFT JOIN max_named mn ON d.player_token = mn.player_token
			WHERE d.player_name IS NOT NULL
				OR mn.player_token IS NULL
				OR d.score > mn.max_named_score
			ORDER BY d.score DESC LIMIT ?${binds.length + 1}`;
		binds.push(limit);

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

		return json({ entries });
	} catch (err) {
		console.error('Leaderboard GET error:', err);
		return json({ entries: [] });
	}
};

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	if (!platform?.env?.DB) {
		return json({ success: false, reason: 'No DB configured' }, { status: 503 });
	}

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
			cardsToWin,
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
			return json({ success: false, reason: 'Invalid payload' }, { status: 400 });
		}
		// playerName is optional — null means anonymous submission
		const nameProvided =
			playerName != null && typeof playerName === 'string' && playerName.length > 0;
		if (nameProvided && playerName.length > MAX_NAME_LENGTH) {
			return json({ success: false, reason: 'Invalid name' }, { status: 400 });
		}

		// ── Range checks (self-contained, no DB dependency) ─
		if (score < 0 || score > MAX_SCORE) {
			return json({ success: false, reason: 'Score out of range' }, { status: 400 });
		}
		if (target < 1 || target > MAX_CARDS) {
			return json({ success: false, reason: 'Target out of range' }, { status: 400 });
		}
		if (typeof tracklistId !== 'string' || tracklistId.length === 0) {
			return json({ success: false, reason: 'Invalid tracklist' }, { status: 400 });
		}
		if (typeof cardsToWin !== 'number' || cardsToWin < 1 || cardsToWin > MAX_CARDS) {
			return json({ success: false, reason: 'Invalid cards to win' }, { status: 400 });
		}
		if (attempts < Math.max(0, target - 1) || attempts > MAX_CARDS * 5) {
			return json({ success: false, reason: 'Attempts out of range' }, { status: 400 });
		}
		if (
			typeof averageTime === 'number' &&
			(averageTime < 0 || averageTime > 3600 || !Number.isFinite(averageTime))
		) {
			return json({ success: false, reason: 'Average time out of range' }, { status: 400 });
		}
		if (typeof longestStreak === 'number' && (longestStreak < 0 || longestStreak > attempts)) {
			return json({ success: false, reason: 'Streak out of range' }, { status: 400 });
		}
		if (score > target * MAX_SCORE_PER_CARD) {
			return json({ success: false, reason: 'Score implausible' }, { status: 400 });
		}
		if (log && !isCompletedLog(log, cardsToWin)) {
			return json({ success: false, reason: 'Incomplete replay' }, { status: 400 });
		}

		const db = platform.env.DB;
		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';
		const userHash = await hashUser(ip, getCurrentSalt());
		const country = platform.cf?.country || 'UNKNOWN';
		const timestamp = parseClientTimestamp(occurredAt);

		// ── Duplicate check: same session + player (named submissions only) ──
		// Anonymous auto-submits skip dedup — rate limiter prevents abuse,
		// and GET collapses anonymous entries per token anyway.
		if (nameProvided && sessionId && typeof sessionId === 'string') {
			const dupCheck = await db
				.prepare(
					`SELECT COUNT(*) AS cnt FROM timeline_scores
					 WHERE session_id = ?1 AND player_token = ?2 AND player_name IS NOT NULL`
				)
				.bind(sessionId, playerToken)
				.first<{ cnt: number }>();
			if (dupCheck && dupCheck.cnt > 0) {
				return json({ success: false, reason: 'Already submitted' }, { status: 409 });
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
			return json({ success: false, reason: 'Rate limited' }, { status: 429 });
		}

		// ── Insert ────────────────────────────────────────
		const result = await db
			.prepare(
				`INSERT INTO timeline_scores (timestamp, player_token, player_name, score, attempts, target, average_time, longest_streak, tracklist_id, cards_to_win, country, user_hash, session_id, log)
			 VALUES (COALESCE(?1, CURRENT_TIMESTAMP), ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`
			)
			.bind(
				timestamp,
				playerToken,
				nameProvided ? playerName.slice(0, MAX_NAME_LENGTH) : null,
				Math.round(score),
				Math.round(attempts),
				Math.round(target),
				typeof averageTime === 'number' ? Math.round(averageTime * 10) / 10 : null,
				longestStreak ?? 0,
				tracklistId,
				Math.round(cardsToWin),
				country,
				userHash,
				sessionId ?? null,
				log ? JSON.stringify(log) : null
			)
			.run();

		return json({ success: true, id: result.meta.last_row_id });
	} catch (err) {
		console.error('Leaderboard POST error:', err);
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

		if (!id || !playerToken) {
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

		// Only allow naming entries that belong to this player, are still anonymous,
		// AND were created in the last hour.
		const result = await db
			.prepare(
				`UPDATE timeline_scores SET player_name = ?1
				 WHERE id = ?2 AND player_token = ?3 AND player_name IS NULL
				 AND timestamp > datetime('now', '-1 hour')`
			)
			.bind(trimmedName, id, playerToken)
			.run();

		if (result.meta.changes === 0) {
			// Either entry doesn't exist, wrong token, already named, incomplete, or expired (> 1h)
			const existing = await db
				.prepare(
					`SELECT player_name, timestamp > datetime('now', '-1 hour') AS is_recent, cards_to_win, log
					 FROM timeline_scores WHERE id = ?1 AND player_token = ?2`
				)
				.bind(id, playerToken)
				.first<{
					player_name: string | null;
					is_recent: number;
					cards_to_win: number;
					log: string | null;
				}>();

			if (!existing) {
				return json({ success: false, reason: 'Not found' }, { status: 404 });
			}
			if (existing.player_name !== null) {
				return json({ success: false, reason: 'Already named' }, { status: 409 });
			}

			const log = (() => {
				try {
					return JSON.parse(existing.log ?? 'null');
				} catch {
					return null;
				}
			})();
			if (!isCompletedLog(log, existing.cards_to_win)) {
				return json({ success: false, reason: 'Incomplete timeline' }, { status: 403 });
			}
			if (!existing.is_recent) {
				return json({ success: false, reason: 'Expired' }, { status: 403 });
			}

			return json({ success: false, reason: 'Already named' }, { status: 409 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Leaderboard PATCH error:', err);
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
