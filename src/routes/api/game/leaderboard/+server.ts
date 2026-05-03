import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

const MAX_NAME_LENGTH = 30;
const MAX_SCORE = 1_000_000;
const MAX_CARDS = 500;
const MAX_SCORE_PER_CARD = 6000;
const MAX_SUBMISSIONS_PER_HOUR = 10;

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
		// We prefer entries with a timeline, then higher scores, then newer entries
		let innerSql = `SELECT player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp, timeline,
			ROW_NUMBER() OVER (PARTITION BY player_token, player_name ORDER BY score DESC, timeline IS NOT NULL DESC, timestamp DESC) AS rn
			FROM scores`;
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

		if (conditions.length > 0) {
			innerSql += ` WHERE ${conditions.join(' AND ')}`;
		}

		const sql = `SELECT player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp, timeline
			FROM (${innerSql}) WHERE rn = 1
			ORDER BY score DESC LIMIT ?${binds.length + 1}`;
		binds.push(limit);

		const results = await platform.env.DB.prepare(sql)
			.bind(...binds)
			.all();

		// Map results: replace raw token with is_me flag for privacy
		const entries = (results.results ?? []).map((row: Record<string, unknown>) => {
			const { player_token, ...rest } = row;
			return { ...rest, is_me: playerToken ? player_token === playerToken : false };
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
			cards,
			accuracy,
			longestStreak,
			tracklistId,
			cardsToWin,
			sessionId,
			timeline
		} = body;

		// ── Required field validation ──────────────────────
		if (!playerToken || typeof score !== 'number' || typeof cards !== 'number') {
			return json({ success: false, reason: 'Invalid payload' }, { status: 400 });
		}
		// playerName is optional — null means anonymous submission
		const nameProvided = playerName != null && typeof playerName === 'string' && playerName.length > 0;
		if (nameProvided && playerName.length > MAX_NAME_LENGTH) {
			return json({ success: false, reason: 'Invalid name' }, { status: 400 });
		}

		// ── Range checks (self-contained, no DB dependency) ─
		if (score < 0 || score > MAX_SCORE) {
			return json({ success: false, reason: 'Score out of range' }, { status: 400 });
		}
		if (cards < 1 || cards > MAX_CARDS) {
			return json({ success: false, reason: 'Cards out of range' }, { status: 400 });
		}
		if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 1) {
			return json({ success: false, reason: 'Invalid accuracy' }, { status: 400 });
		}
		if (typeof longestStreak === 'number' && (longestStreak < 0 || longestStreak > cards)) {
			return json({ success: false, reason: 'Streak out of range' }, { status: 400 });
		}
		if (score > cards * MAX_SCORE_PER_CARD) {
			return json({ success: false, reason: 'Score implausible' }, { status: 400 });
		}

		const db = platform.env.DB;
		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';
		const userHash = await hashUser(ip, getCurrentSalt());
		const country = platform.cf?.country || 'UNKNOWN';

		// ── Duplicate check: same session + player (named submissions only) ──
		// Anonymous auto-submits skip dedup — rate limiter prevents abuse,
		// and GET collapses anonymous entries per token anyway.
		if (nameProvided && sessionId && typeof sessionId === 'string') {
			const dupCheck = await db
				.prepare(
					`SELECT COUNT(*) AS cnt FROM scores
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
				`SELECT COUNT(*) AS cnt FROM scores
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
				`INSERT INTO scores (player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, user_hash, session_id, timeline)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
			)
			.bind(
				playerToken,
				nameProvided ? playerName.slice(0, MAX_NAME_LENGTH) : null,
				Math.round(score),
				cards,
				Math.round(accuracy * 1000) / 1000,
				longestStreak ?? 0,
				tracklistId ?? null,
				cardsToWin ?? 0,
				country,
				userHash,
				sessionId ?? null,
				timeline ? JSON.stringify(timeline) : null
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

		// Only allow naming entries that belong to this player and are still anonymous
		const result = await db
			.prepare(
				`UPDATE scores SET player_name = ?1
				 WHERE id = ?2 AND player_token = ?3 AND player_name IS NULL`
			)
			.bind(trimmedName, id, playerToken)
			.run();

		if (result.meta.changes === 0) {
			// Either entry doesn't exist, wrong token, or already named
			const existing = await db
				.prepare(`SELECT player_name FROM scores WHERE id = ?1 AND player_token = ?2`)
				.bind(id, playerToken)
				.first<{ player_name: string | null }>();
			if (existing && existing.player_name !== null) {
				return json({ success: false, reason: 'Already named' }, { status: 409 });
			}
			return json({ success: false, reason: 'Not found' }, { status: 404 });
		}

		return json({ success: true });
	} catch (err) {
		console.error('Leaderboard PATCH error:', err);
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
