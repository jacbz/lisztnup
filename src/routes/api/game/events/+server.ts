import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	// Fast exit if no D1 binding
	if (!platform?.env?.DB) {
		return json({ success: false, reason: 'No DB configured' }, { status: 503 });
	}

	try {
		const payload = await request.json();
		const cf = platform.cf;
		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';

		const currentDay = getCurrentSalt();
		const userHash = await hashUser(ip, currentDay);
		const country = cf?.country || 'UNKNOWN';

		// Fire-and-forget the database operations using execution context
		const dbOp = async () => {
			try {
				const db = platform.env!.DB;

				if (payload.type === 'game_start') {
					// Use UPSERT to handle cases where game_end arrives first
					await db
						.prepare(
							`INSERT INTO game_sessions (id, started_at, state, mode, tracklist_id, country, user_hash, locale, game_info) 
						 VALUES (?1, CURRENT_TIMESTAMP, 'started', ?2, ?3, ?4, ?5, ?6, ?7)
						 ON CONFLICT(id) DO UPDATE SET 
						 	started_at = COALESCE(game_sessions.started_at, CURRENT_TIMESTAMP),
						 	mode = ?2,
						 	tracklist_id = ?3,
						 	country = ?4,
						 	user_hash = ?5,
						 	locale = ?6,
						 	game_info = json_patch(COALESCE(game_sessions.game_info, '{}'), ?7)`
						)
						.bind(
							payload.sessionId,
							payload.mode,
							payload.tracklistId,
							country,
							userHash,
							payload.locale,
							payload.gameInfo ? JSON.stringify(payload.gameInfo) : '{}'
						)
						.run();
				} else if (payload.type === 'game_end') {
					// Use UPSERT to handle cases where game_end arrives before game_start
					const gameInfoJson = payload.gameInfo ? JSON.stringify(payload.gameInfo) : '{}';
					const newState = payload.state || 'ended';
					
					await db
						.prepare(
							`INSERT INTO game_sessions (id, ended_at, state, country, user_hash, game_info) 
						 VALUES (?1, CURRENT_TIMESTAMP, ?2, ?3, ?4, ?5)
						 ON CONFLICT(id) DO UPDATE SET 
						 	ended_at = CURRENT_TIMESTAMP,
						 	state = ?2,
						 	game_info = json_patch(COALESCE(game_sessions.game_info, '{}'), ?5)`
						)
						.bind(
							payload.sessionId,
							newState,
							country,
							userHash,
							gameInfoJson
						)
						.run();
				} else if (payload.type === 'game_progress') {
					// Use UPSERT so we don't lose data if progress arrives before game_start
					const gameInfoJson = payload.gameInfo ? JSON.stringify(payload.gameInfo) : '{}';
					await db
						.prepare(
							`INSERT INTO game_sessions (id, state, country, user_hash, game_info) 
							 VALUES (?1, 'in_progress', ?2, ?3, ?4)
							 ON CONFLICT(id) DO UPDATE SET 
								state = CASE WHEN game_sessions.state IN ('completed', 'abandoned') THEN game_sessions.state ELSE 'in_progress' END,
								game_info = json_patch(COALESCE(game_sessions.game_info, '{}'), ?4)`
						)
						.bind(payload.sessionId, country, userHash, gameInfoJson)
						.run();
				} else if (payload.type === 'timeline_placement') {
					await db
						.prepare(
							`INSERT INTO timeline_placements (session_id, work_gid, placed_correctly) 
						 VALUES (?, ?, ?)`
						)
						.bind(payload.sessionId, payload.workGid, payload.placedCorrectly ? 1 : 0)
						.run();
				}
			} catch (e) {
				console.error('Failed to write event to analytics:', e);
			}
		};

		platform.context?.waitUntil(dbOp());

		// Return 200 immediately so the client game loop doesn't block!
		return json({ success: true });
	} catch (e) {
		// Log errors safely without breaking anything
		console.error('Analytics payload error:', e);
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
