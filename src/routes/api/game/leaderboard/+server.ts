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
		let innerSql = `SELECT player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp,
			ROW_NUMBER() OVER (PARTITION BY player_token, player_name ORDER BY score DESC) AS rn
			FROM leaderboard`;
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

		const sql = `SELECT player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp
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
			sessionId
		} = body;

		// ── Required field validation ──────────────────────
		if (!playerToken || !playerName || typeof score !== 'number' || typeof cards !== 'number') {
			return json({ success: false, reason: 'Invalid payload' }, { status: 400 });
		}

		// ── Range checks ──────────────────────────────────
		if (score < 0 || score > MAX_SCORE) {
			return json({ success: false, reason: 'Score out of range' }, { status: 400 });
		}
		if (cards < 1 || cards > MAX_CARDS) {
			return json({ success: false, reason: 'Cards out of range' }, { status: 400 });
		}
		if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 1) {
			return json({ success: false, reason: 'Invalid accuracy' }, { status: 400 });
		}
		if (
			typeof playerName !== 'string' ||
			playerName.length === 0 ||
			playerName.length > MAX_NAME_LENGTH
		) {
			return json({ success: false, reason: 'Invalid name' }, { status: 400 });
		}
		if (typeof longestStreak === 'number' && (longestStreak < 0 || longestStreak > cards)) {
			return json({ success: false, reason: 'Streak out of range' }, { status: 400 });
		}
		if (typeof cardsToWin === 'number' && (cardsToWin < 1 || cardsToWin > cards)) {
			return json({ success: false, reason: 'Cards-to-win out of range' }, { status: 400 });
		}
		if (score > cards * MAX_SCORE_PER_CARD) {
			return json({ success: false, reason: 'Score implausible' }, { status: 400 });
		}

		const db = platform.env.DB;
		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';
		const userHash = await hashUser(ip, getCurrentSalt());
		const country = platform.cf?.country || 'UNKNOWN';

		// ── Rate limit: max submissions per IP per hour ───
		const rateCheck = await db
			.prepare(
				`SELECT COUNT(*) AS cnt FROM leaderboard
				 WHERE user_hash = ?1 AND timestamp > datetime('now', '-1 hour')`
			)
			.bind(userHash)
			.first<{ cnt: number }>();
		if (rateCheck && rateCheck.cnt >= MAX_SUBMISSIONS_PER_HOUR) {
			return json({ success: false, reason: 'Rate limited' }, { status: 429 });
		}

		// ── Session cross-checks (when sessionId provided) ─
		if (sessionId && typeof sessionId === 'string') {
			// Prevent duplicate submissions for the same session
			const dupCheck = await db
				.prepare(`SELECT COUNT(*) AS cnt FROM leaderboard WHERE session_id = ?1`)
				.bind(sessionId)
				.first<{ cnt: number }>();
			if (dupCheck && dupCheck.cnt > 0) {
				return json({ success: false, reason: 'Already submitted' }, { status: 409 });
			}

			// Verify session exists, is completed, and is timeline mode
			const session = await db
				.prepare(`SELECT state, mode, user_hash FROM game_sessions WHERE id = ?1`)
				.bind(sessionId)
				.first<{ state: string; mode: string; user_hash: string }>();
			if (session) {
				if (session.state !== 'completed') {
					return json({ success: false, reason: 'Session not completed' }, { status: 400 });
				}
				if (session.mode !== 'timeline') {
					return json({ success: false, reason: 'Not a timeline session' }, { status: 400 });
				}
				// Verify same origin (IP hash matches)
				if (session.user_hash !== userHash) {
					return json({ success: false, reason: 'Session mismatch' }, { status: 403 });
				}

				// Cross-check placement data
				const placements = await db
					.prepare(
						`SELECT COUNT(*) AS total,
						        SUM(CASE WHEN placed_correctly = 1 THEN 1 ELSE 0 END) AS correct,
						        SUM(CASE WHEN turn_score IS NOT NULL THEN turn_score ELSE 0 END) AS score_sum
						 FROM timeline_placements WHERE session_id = ?1`
					)
					.bind(sessionId)
					.first<{ total: number; correct: number; score_sum: number }>();

				if (placements && placements.total > 0) {
					// Placement count should be reasonable relative to claimed cards
					// (total placements includes wrong answers, cards = correct placements only)
					if (cards > placements.total) {
						return json(
							{ success: false, reason: 'Cards exceed placements' },
							{ status: 400 }
						);
					}

					// If we have per-turn scores, verify the total is plausible
					// Allow generous tolerance for efficiency bonus (one-time, up to ~cards*500)
					if (placements.score_sum > 0) {
						const maxEfficiencyBonus = cards * 500;
						if (score > placements.score_sum + maxEfficiencyBonus) {
							return json(
								{ success: false, reason: 'Score exceeds tracked total' },
								{ status: 400 }
							);
						}
					}
				}
			}
			// If session doesn't exist yet (analytics event delayed), allow submission
			// but still store the session_id for later audit
		}

		await db
			.prepare(
				`INSERT INTO leaderboard (player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, user_hash, session_id)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
			)
			.bind(
				playerToken,
				playerName.slice(0, MAX_NAME_LENGTH),
				Math.round(score),
				cards,
				Math.round(accuracy * 1000) / 1000,
				longestStreak ?? 0,
				tracklistId ?? null,
				cardsToWin ?? 0,
				country,
				userHash,
				sessionId ?? null
			)
			.run();

		return json({ success: true });
	} catch (err) {
		console.error('Leaderboard POST error:', err);
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
