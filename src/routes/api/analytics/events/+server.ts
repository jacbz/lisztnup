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

				if (payload.type === 'session_start') {
					await db
						.prepare(
							`INSERT INTO game_sessions (id, timestamp, state, mode, tracklist_id, country, user_hash) 
						 VALUES (?, CURRENT_TIMESTAMP, 'started', ?, ?, ?, ?)`
						)
						.bind(payload.sessionId, payload.mode, payload.tracklistId, country, userHash)
						.run();
				} else if (payload.type === 'session_end') {
					await db
						.prepare(`UPDATE game_sessions SET state = 'ended' WHERE id = ? AND user_hash = ?`)
						.bind(payload.sessionId, userHash)
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
