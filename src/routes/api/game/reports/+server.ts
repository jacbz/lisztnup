import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import { sendTelegramMessage, formatReportMessage, formatSessionBlock } from '$lib/server/telegram';
import type { GameSessionRow } from '$lib/server/telegram';
import { logger } from '$lib/server/logging';

function parseClientTimestamp(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const ms = Date.parse(value);
	if (!Number.isFinite(ms)) return null;
	const now = Date.now();
	if (ms > now + 5 * 60_000) return null;
	if (ms < now - 30 * 24 * 60 * 60_000) return null;
	return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeTrackMetadata(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const source = value as Record<string, unknown>;
	const metadata: Record<string, unknown> = {};
	const keys = [
		'composer',
		'composerGid',
		'work',
		'workGid',
		'part',
		'partGid',
		'workType',
		'workYears',
		'deezerId'
	];

	for (const key of keys) {
		const raw = source[key];
		if (typeof raw === 'string') metadata[key] = raw.slice(0, 500);
		else if (typeof raw === 'number' && Number.isFinite(raw)) metadata[key] = raw;
		else if (raw === null) metadata[key] = null;
	}

	return metadata;
}

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
		const timestamp = parseClientTimestamp(payload.occurredAt);
		const trackMetadata = normalizeTrackMetadata(payload.trackMetadata);
		const trackMetadataJson = JSON.stringify(trackMetadata);

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
				`INSERT INTO problem_reports (timestamp, session_id, user_hash, country, message, email, track_metadata) 
				 VALUES (COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?)`
			)
			.bind(timestamp, sessionId, userHash, country, payload.message, email, trackMetadataJson)
			.run();

		const telegramOp = async () => {
			try {
				const token = platform.env!.TELEGRAM_BOT_TOKEN;
				const chatId = platform.env!.TELEGRAM_CHAT_ID;
				if (token && chatId) {
					let text = formatReportMessage(
						payload.message,
						trackMetadata,
						country,
						email || undefined
					);
					if (sessionRow) {
						text += `\n\n${formatSessionBlock(sessionRow)}`;
					}
					await sendTelegramMessage(token, chatId, text);
				}
			} catch (e) {
				await logger.error(db, 'Failed to send report to Telegram', {
					userHash,
					country,
					sessionId,
					context: { error: e instanceof Error ? e.message : String(e) }
				});
			}
		};

		platform.context?.waitUntil(telegramOp());

		return json({ success: true });
	} catch (e) {
		const db = platform.env?.DB;
		if (db) {
			await logger.error(db, 'Report payload error', {
				context: { error: e instanceof Error ? e.message : String(e) }
			});
		}
		return json({ success: false, error: 'Invalid payload' }, { status: 400 });
	}
};
