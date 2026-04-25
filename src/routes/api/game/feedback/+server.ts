import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
	if (!platform?.env?.DB) {
		return json({ success: false, reason: 'No DB configured' }, { status: 503 });
	}

	try {
		const payload = await request.json();

		// Server-side length validation
		if (!payload.message || payload.message.length < 5 || payload.message.length > 1000) {
			return json({ success: false, error: 'Invalid message length' }, { status: 400 });
		}

		const cf = platform.cf;
		const ip = getClientAddress() || request.headers.get('cf-connecting-ip') || '0.0.0.0';

		const currentDay = getCurrentSalt();
		const userHash = await hashUser(ip, currentDay);
		const country = cf?.country || 'UNKNOWN';

		const dbOp = async () => {
			try {
				const db = platform.env!.DB;
				await db
					.prepare(
						`INSERT INTO feedback (session_id, user_hash, country, message) 
						 VALUES (?, ?, ?, ?)`
					)
					.bind(
						payload.sessionId,
						userHash,
						country,
						payload.message
					)
					.run();
			} catch (e) {
				console.error('Failed to write feedback to analytics:', e);
			}
		};

		platform.context?.waitUntil(dbOp());

		return json({ success: true });
	} catch (e) {
		console.error('Feedback payload error:', e);
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
