import {
	getAlternateUrls,
	getLocalePath,
	getSeoDescription,
	getSeoTitle,
	isSupportedLocale
} from '$lib/seo';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ params, route, url }) => {
	const routeLocale = isSupportedLocale(params.locale) ? params.locale : null;
	const locale = routeLocale ?? 'en';
	const isLocalizedHome = route.id === '/' || route.id === '/[locale=locale]';
	const canonicalPath = isLocalizedHome ? getLocalePath(routeLocale ?? 'x-default') : url.pathname;

	return {
		locale,
		routeLocale,
		siteUrl: `${url.origin}/`,
		includeSiteNameStructuredData: route.id === '/',
		canonicalUrl: `${url.origin}${canonicalPath}`,
		ogImageUrl: `${url.origin}/screenshots/timeline-1.jpg`,
		alternates: isLocalizedHome ? getAlternateUrls(url.origin) : [],
		seoTitle: getSeoTitle(locale),
		seoDescription: getSeoDescription(locale)
	};
};
