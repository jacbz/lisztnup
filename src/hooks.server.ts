import type { Handle } from '@sveltejs/kit';
import { hashUser, getCurrentSalt } from '$lib/server/analytics';
import { isSupportedLocale } from '$lib/seo';

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
	'cms-checker',
	'facebookexternalhit',
	'palo alto networks',
	'python-requests',
	'aiohttp',
	'axios',
	'go-http-client',
	'internet-measurement',
	'whatsapp',
	'l9scan',
	'leakix',
	'okhttp',
	'curl',
	'wget',
	'monitor-telegram-clone-realtime',
	'Scrapy',
	'TLM-Audit-Scanner',
	'NetcraftSurveyAgent'
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
	if (ua.includes('cros')) return 'ChromeOS';
	if (ua.includes('linux')) return 'Linux';
	if (ua.includes('freebsd') || ua.includes('openbsd') || ua.includes('netbsd')) return 'BSD';
	return 'OTHER';
}

// Acquisition source only: a same-origin referrer is in-app navigation and
// tells us nothing about where the visitor came from, so it is dropped rather
// than stored as noise. Malformed values are discarded too.
function getReferer(referer: string | null, origin: string): string | null {
	if (!referer) return null;
	try {
		if (new URL(referer).origin === origin) return null;
	} catch {
		return null;
	}
	return referer.slice(0, 512);
}

function getDeviceType(userAgent: string | null, cfDeviceType: string | null): string {
	if (cfDeviceType) return cfDeviceType;
	if (!userAgent) return 'UNKNOWN';
	const ua = userAgent.toLowerCase();
	if (ua.includes('mobi') || ua.includes('android')) return 'mobile';
	return 'desktop';
}

export const handle: Handle = async ({ event, resolve }) => {
	const firstSegment = event.url.pathname.split('/').filter(Boolean)[0];
	const routeLocale = isSupportedLocale(firstSegment) ? firstSegment : 'en';
	const response = await resolve(event, {
		transformPageChunk: ({ html }) =>
			html.replace('<html lang="en">', `<html lang="${routeLocale}">`)
	});

	// Get Cloudflare context (only defined in production/wrangler dev)
	const cf = event.platform?.cf;
	const context = event.platform?.context;

	if (cf && context) {
		const userAgent = event.request.headers.get('user-agent');
		// Cloudflare exposes the bot score on the `cf` object, not as a request
		// header — the score is 1 (almost certainly a bot) to 99 (almost certainly
		// human). `botManagement` is only populated for Bot Management
		// subscribers, so the user-agent heuristic stays as the fallback.
		const botScore = (cf.botManagement as { score?: number } | undefined)?.score;
		const isBotRequest = typeof botScore === 'number' ? botScore < 30 : isBot(userAgent);

		// Filter out everything except the main game entry points
		const isLocalizedHome =
			isSupportedLocale(firstSegment) && event.url.pathname === `/${firstSegment}`;
		const isMainPath =
			event.url.pathname === '/' || event.url.pathname === '/bingo' || isLocalizedHome;
		const isAsset =
			!isMainPath ||
			event.url.pathname.startsWith('/_app') ||
			event.url.pathname.startsWith('/api') ||
			event.url.pathname.match(/\.(png|json|js|css|webp|ico|svg|xml|php|txt|map)$/) ||
			event.isDataRequest ||
			event.request.method !== 'GET';

		if (!isBotRequest && !isAsset && isMainPath && event.platform?.env?.DB) {
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
						const referer = getReferer(event.request.headers.get('referer'), event.url.origin);

						await event
							.platform!.env.DB.prepare(
								`INSERT INTO pageviews (timestamp, country, path, user_hash, device, os, user_agent, referer, asn, as_organization)
							 VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
							)
							.bind(
								cf.country || 'UNKNOWN',
								event.url.pathname,
								userHash,
								device,
								os,
								userAgent || 'UNKNOWN',
								referer,
								typeof cf.asn === 'number' ? cf.asn : null,
								typeof cf.asOrganization === 'string' ? cf.asOrganization : null
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
