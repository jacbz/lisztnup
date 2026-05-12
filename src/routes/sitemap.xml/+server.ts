import { getAlternateUrls, getLocalePath, SUPPORTED_LOCALES, type SupportedLocale } from '$lib/seo';
import type { RequestHandler } from './$types';

function escapeXml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}

function renderUrl(origin: string, locale: SupportedLocale | 'x-default') {
	const loc = `${origin}${getLocalePath(locale)}`;
	const alternates = getAlternateUrls(origin)
		.map(
			(alternate) =>
				`    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.locale)}" href="${escapeXml(alternate.href)}" />`
		)
		.join('\n');

	return `  <url>
    <loc>${escapeXml(loc)}</loc>
${alternates}
  </url>`;
}

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const urls = ['x-default' as const, ...SUPPORTED_LOCALES]
		.map((locale) => renderUrl(origin, locale))
		.join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`,
		{
			headers: {
				'content-type': 'application/xml; charset=utf-8',
				'cache-control': 'public, max-age=3600'
			}
		}
	);
};
