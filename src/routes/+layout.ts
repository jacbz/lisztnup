import { getAlternateUrls, getLocalePath, isSupportedLocale } from '$lib/seo';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ params, route, url }) => {
	const routeLocale = isSupportedLocale(params.locale) ? params.locale : null;
	const locale = routeLocale ?? 'en';
	const canonicalPath = getLocalePath(routeLocale ?? 'x-default');

	return {
		locale,
		routeLocale,
		siteUrl: `${url.origin}/`,
		includeSiteNameStructuredData: route.id === '/',
		canonicalUrl: `${url.origin}${canonicalPath}`,
		ogImageUrl: `${url.origin}/screenshots/timeline-1.jpg`,
		alternates: getAlternateUrls(url.origin)
	};
};
