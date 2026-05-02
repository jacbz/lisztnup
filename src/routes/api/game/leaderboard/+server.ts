import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

const MAX_NAME_LENGTH = 30;
const MAX_SCORE = 1_000_000;
const MAX_CARDS = 500;

export const GET: RequestHandler = async ({ url, platform }) => {
	if (!platform?.env?.DB) {
		return json({ entries: [] });
	}

	const limit = Math.min(Number(url.searchParams.get('limit')) || 10, 50);
	const tracklistId = url.searchParams.get('tracklist') || null;
	const cardsToWin = Number(url.searchParams.get('cardsToWin')) || null;

	try {
		// Use ROW_NUMBER() to keep only each player's best score per config
		// Partition by token+name to allow multiple entries from local multiplayer
		let innerSql = `SELECT player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp,
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

		const sql = `SELECT player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, timestamp
			FROM (${innerSql}) WHERE rn = 1
			ORDER BY score DESC LIMIT ?${binds.length + 1}`;
		binds.push(limit);

		const results = await platform.env.DB.prepare(sql)
			.bind(...binds)
			.all();

		return json({ entries: results.results ?? [] });
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
			cardsToWin
		} = body;

		// Validate required fields
		if (!playerToken || !playerName || typeof score !== 'number' || typeof cards !== 'number') {
			return json({ success: false, reason: 'Invalid payload' }, { status: 400 });
		}

		// Anti-cheat: basic sanity checks
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

		// Rough score-per-card ceiling: max ~5500 per card (base 1000 + diff 2310 + mastery 500 + speed/streak + efficiency)
		const maxScorePerCard = 6000;
		if (score > cards * maxScorePerCard) {
			return json({ success: false, reason: 'Score implausible' }, { status: 400 });
		}

		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';
		const userHash = await hashUser(ip, getCurrentSalt());
		const country = platform.cf?.country || 'UNKNOWN';

		await platform.env.DB.prepare(
			`INSERT INTO leaderboard (player_token, player_name, score, cards, accuracy, longest_streak, tracklist_id, cards_to_win, country, user_hash)
			 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
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
				userHash
			)
			.run();

		return json({ success: true });
	} catch (err) {
		console.error('Leaderboard POST error:', err);
		return json({ success: false, reason: 'Server error' }, { status: 500 });
	}
};
