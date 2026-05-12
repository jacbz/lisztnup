import en from '$lib/i18n/locales/en.json';
import de from '$lib/i18n/locales/de.json';
import fr from '$lib/i18n/locales/fr.json';
import it from '$lib/i18n/locales/it.json';
import es from '$lib/i18n/locales/es.json';
import pt from '$lib/i18n/locales/pt.json';
import zhCN from '$lib/i18n/locales/zh-CN.json';
import zhTW from '$lib/i18n/locales/zh-TW.json';
import ja from '$lib/i18n/locales/ja.json';
import ko from '$lib/i18n/locales/ko.json';

export const SUPPORTED_LOCALES = [
	'en',
	'de',
	'fr',
	'it',
	'es',
	'pt',
	'zh-CN',
	'zh-TW',
	'ja',
	'ko'
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

type SeoMessages = {
	app: {
		title: string;
		subtitle: string;
		inspiredByHitster: string;
		seoDescription: string;
	};
};

const messages = {
	en,
	de,
	fr,
	it,
	es,
	pt,
	'zh-CN': zhCN,
	'zh-TW': zhTW,
	ja,
	ko
} satisfies Record<SupportedLocale, SeoMessages>;

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
	return SUPPORTED_LOCALES.includes(value as SupportedLocale);
}

export function getLocalePath(locale: SupportedLocale | 'x-default') {
	if (locale === 'x-default') return '/';
	return `/${locale}`;
}

export function getSeoTitle(locale: SupportedLocale) {
	const app = messages[locale].app;
	return `${app.title} - ${app.subtitle} (${app.inspiredByHitster})`;
}

export function getSeoDescription(locale: SupportedLocale) {
	return messages[locale].app.seoDescription;
}

export function getAlternateUrls(origin: string) {
	return [
		{ locale: 'x-default', href: `${origin}/` },
		...SUPPORTED_LOCALES.map((locale) => ({
			locale,
			href: `${origin}${getLocalePath(locale)}`
		}))
	];
}
