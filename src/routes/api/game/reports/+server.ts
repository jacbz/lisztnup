import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import { sendTelegramMessage, formatReportMessage } from '$lib/server/telegram';

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
		const email = typeof payload.email === 'string' ? payload.email.trim().slice(0, 254) : null;

		const dbOp = async () => {
			try {
				const db = platform.env!.DB;
				await db
					.prepare(
						`INSERT INTO problem_reports (session_id, user_hash, country, message, email, deezer_id, composer, work, part, work_type, work_years) 
						 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
					)
					.bind(
						payload.sessionId,
						userHash,
						country,
						payload.message,
						email,
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

		const telegramOp = async () => {
			const token = platform.env!.TELEGRAM_BOT_TOKEN;
			const chatId = platform.env!.TELEGRAM_CHAT_ID;
			if (token && chatId) {
				const text = formatReportMessage(
					payload.message,
					payload.composer || '',
					payload.work || '',
					payload.part || '',
					payload.deezerId || '',
					country,
					email || undefined
				);
				await sendTelegramMessage(token, chatId, text);
			}
		};

		platform.context?.waitUntil(Promise.all([dbOp(), telegramOp()]));

		return json({ success: true });
	} catch (e) {
		console.error('Report payload error:', e);
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
