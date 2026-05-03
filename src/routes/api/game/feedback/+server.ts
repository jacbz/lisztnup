import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import {
	sendTelegramMessage,
	formatFeedbackMessage,
	formatSessionBlock
} from '$lib/server/telegram';
import type { GameSessionRow } from '$lib/server/telegram';

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

		const db = platform.env!.DB;
		const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
		let sessionRow: GameSessionRow | null = null;
		if (sessionId) {
			sessionRow = await db
				.prepare(
					`SELECT id, started, updated, state, mode, tracklist_id, country, locale, user_hash, game_info
					 FROM game_sessions WHERE id = ?1`
				)
				.bind(sessionId)
				.first<GameSessionRow>();
		}

		await db
			.prepare(
				`INSERT INTO feedback (session_id, user_hash, country, message, email) 
				 VALUES (?, ?, ?, ?, ?)`
			)
			.bind(sessionId, userHash, country, payload.message, email)
			.run();

		const telegramOp = async () => {
			try {
				const token = platform.env!.TELEGRAM_BOT_TOKEN;
				const chatId = platform.env!.TELEGRAM_CHAT_ID;
				if (token && chatId) {
					let text = formatFeedbackMessage(payload.message, country, email || undefined);
					if (sessionRow) {
						text += `\n\n${formatSessionBlock(sessionRow)}`;
					}
					await sendTelegramMessage(token, chatId, text);
				}
			} catch (e) {
				console.error('Failed to send feedback to Telegram:', e);
			}
		};

		platform.context?.waitUntil(telegramOp());

		return json({ success: true });
	} catch (e) {
		console.error('Feedback payload error:', e);
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
