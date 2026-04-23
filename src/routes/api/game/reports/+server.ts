import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

export const POST: RequestHandler = async ({ request, platform, getClientAddress }) => {
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

		const dbOp = async () => {
			try {
				const db = platform.env!.DB;
				await db
					.prepare(
						`INSERT INTO problem_reports (session_id, user_hash, country, message, deezer_id, composer, work, part, work_type, work_years) 
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						payload.sessionId,
						userHash,
						country,
						payload.message,
						payload.deezerId,
						payload.composer,
						payload.work,
						payload.part,
						payload.workType,
						payload.workYears
					)
					.run();
			} catch (e) {
				console.error('Failed to write report to analytics:', e);
			}
		};

		platform.context?.waitUntil(dbOp());

		return json({ success: true });
	} catch (e) {
		console.error('Report payload error:', e);
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
