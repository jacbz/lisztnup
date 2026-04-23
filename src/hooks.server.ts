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
	'ia_archiver',
	'spider',
	'bot',
	'crawl',
	'ahrefs',
	'semrush',
	'dotbot',
	'rogerbot',
	'exabot',
	'mj12bot',
	'petalbot',
	'ltx71',
	'cms-checker'
];

function isBot(userAgent: string | null) {
	if (!userAgent || userAgent.length < 10) return true;
	const lowerAgent = userAgent.toLowerCase();
	return BOT_USER_AGENTS.some((botStr) => lowerAgent.includes(botStr));
}

function getOS(userAgent: string | null): string {
	if (!userAgent) return 'UNKNOWN';
	const ua = userAgent.toLowerCase();
	if (ua.includes('windows')) return 'Windows';
	if (ua.includes('android')) return 'Android';
	if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'iOS';
	if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macOS';
	if (ua.includes('linux')) return 'Linux';
	return 'OTHER';
}

function getDeviceType(userAgent: string | null, cfDeviceType: string | null): string {
	if (cfDeviceType) return cfDeviceType;
	if (!userAgent) return 'UNKNOWN';
	const ua = userAgent.toLowerCase();
	if (ua.includes('mobi') || ua.includes('android')) return 'mobile';
	return 'desktop';
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

		// Filter out everything except the main game entry points
		const isMainPath = event.url.pathname === '/' || event.url.pathname === '/bingo';
		const isAsset =
			!isMainPath ||
			event.url.pathname.startsWith('/_app') ||
			event.url.pathname.startsWith('/api') ||
			event.url.pathname.match(/\.(png|json|js|css|webp|ico|svg|xml|php|txt|map)$/) ||
			event.isDataRequest ||
			event.request.method !== 'GET';

		if (!isVerifiedBot && !isAsset && isMainPath && event.platform?.env?.DB) {
			const ip =
				event.getClientAddress() || event.request.headers.get('cf-connecting-ip') || '0.0.0.0';
			// Daily rotating salt for GDPR compliance
			const currentDay = getCurrentSalt();

			// Non-blocking query execution
			const dbOp = async () => {
				try {
					const userHash = await hashUser(ip, currentDay);

					// Debounce: check if we already logged a pageview for this user within the last 10 minutes
					const recentView = await event
						.platform!.env.DB.prepare(
							`SELECT 1 FROM pageviews WHERE user_hash = ? AND path = ? AND timestamp > datetime('now', '-10 minutes') LIMIT 1`
						)
						.bind(userHash, event.url.pathname)
						.first();

					if (!recentView) {
						const device = getDeviceType(userAgent, event.request.headers.get('cf-device-type'));
						const os = getOS(userAgent);

						await event
							.platform!.env.DB.prepare(
								`INSERT INTO pageviews (timestamp, country, path, user_hash, device, os, user_agent) 
							 VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?)`
							)
							.bind(
								cf.country || 'UNKNOWN',
								event.url.pathname,
								userHash,
								device,
								os,
								userAgent || 'UNKNOWN'
							)
							.run();
					}
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
