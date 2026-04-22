import type { Handle } from '@sveltejs/kit';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';

const BOT_USER_AGENTS = [
	'googlebot',
	'bingbot',
	'yandexbot',
	'duckduckbot',
	'slurp',
	'baiduspider',
	'facebot',
	'ia_archiver'
];

function isBot(userAgent: string | null) {
	if (!userAgent) return false;
	const lowerAgent = userAgent.toLowerCase();
	return BOT_USER_AGENTS.some((botStr) => lowerAgent.includes(botStr));
}

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Get Cloudflare context (only defined in production/wrangler dev)
	const cf = event.platform?.cf;
	const context = event.platform?.context;

	if (cf && context) {
		const userAgent = event.request.headers.get('user-agent');
		const botScoreStr = event.request.headers.get('cf-bot-management');
		const isVerifiedBot = botScoreStr ? parseInt(botScoreStr) < 30 : isBot(userAgent);

		// Filter out static assets entirely (in case any slip through adapter-cloudflare)
		const isAsset =
			event.url.pathname.startsWith('/_app') ||
			event.url.pathname.match(/\.(png|json|js|css|webp|ico)$/);

		if (!isVerifiedBot && !isAsset && event.platform?.env?.DB) {
			const ip =
				event.getClientAddress() || event.request.headers.get('cf-connecting-ip') || '0.0.0.0';
			// Daily rotating salt for GDPR compliance
			const currentDay = getCurrentSalt();

			// Non-blocking query execution
			const dbOp = async () => {
				try {
					const userHash = await hashUser(ip, currentDay);
					await event
						.platform!.env.DB.prepare(
							`INSERT INTO pageviews (timestamp, country, path, user_hash) 
						 VALUES (CURRENT_TIMESTAMP, ?, ?, ?)`
						)
						.bind(cf.country || 'UNKNOWN', event.url.pathname, userHash)
						.run();
				} catch (e) {
					console.error('Failed to log pageview analytics:', e);
				}
			};

			// Execute silently in background using waitUntil
			context.waitUntil(dbOp());
		}
	}

	return response;
};
