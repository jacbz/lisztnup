import { addMessages, init, locale } from 'svelte-i18n';
import { loadFontForLocale, resetToDefaultFont, requiresCustomFont } from '$lib/utils/fontLoader';

import en from './locales/en.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
// import es from './locales/es.json';
// import pt from './locales/pt.json';
import zhCN from './locales/zh-CN.json';
import zhTW from './locales/zh-TW.json';
import ja from './locales/ja.json';

// Add all translation messages
addMessages('en', en);
addMessages('de', de);
addMessages('fr', fr);
// addMessages('es', es);
// addMessages('pt', pt);
addMessages('zh-CN', zhCN);
addMessages('zh-TW', zhTW);
addMessages('ja', ja);

// Get saved locale from localStorage or use browser language
const savedLocale = typeof window !== 'undefined' ? localStorage.getItem('locale') : null;

// Detect browser language and find best match
function getBrowserLocale(): string {
	if (typeof navigator === 'undefined') return 'en';

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const browserLang = navigator.language || (navigator as any).userLanguage;
	if (!browserLang) return 'en';

	// Direct match (e.g., 'ja', 'en', 'de', 'fr')
	const directMatch = locales.find((l) => l.code === browserLang);
	if (directMatch) return directMatch.code;

	// Match language prefix (e.g., 'en-US' -> 'en', 'zh-Hans' -> 'zh-CN')
	const langPrefix = browserLang.split('-')[0].toLowerCase();

	// Special handling for Chinese variants
	if (langPrefix === 'zh') {
		// Check if it's traditional or simplified
		const lowerLang = browserLang.toLowerCase();
		if (
			lowerLang.includes('hant') ||
			lowerLang.includes('tw') ||
			lowerLang.includes('hk') ||
			lowerLang.includes('mo')
		) {
			return 'zh-TW';
		}
		return 'zh-CN'; // Default to simplified
	}

	// Match by language prefix for other languages
	const prefixMatch = locales.find((l) => l.code.split('-')[0].toLowerCase() === langPrefix);
	if (prefixMatch) return prefixMatch.code;

	return 'en'; // Final fallback
}

// Export available locales for the language switcher (needed before init)
export const locales = [
	{ code: 'en', name: 'English' },
	{ code: 'de', name: 'Deutsch' },
	{ code: 'fr', name: 'Français' },
	// { code: 'es', name: 'Español' },
	// { code: 'pt', name: 'Português' }
	{ code: 'zh-CN', name: '简体中文' },
	{ code: 'zh-TW', name: '繁體中文' },
	{ code: 'ja', name: '日本語' }
];

// Initialize with fallback chain
init({
	fallbackLocale: 'en',
	initialLocale: savedLocale || getBrowserLocale()
});

// Export locale store for external use
export { locale };

// Subscribe to locale changes and load appropriate fonts
if (typeof window !== 'undefined') {
	locale.subscribe((value) => {
		if (value) {
			// Persist locale to localStorage
			localStorage.setItem('locale', value);

			// Small delay to ensure locale change is processed
			setTimeout(() => {
				if (requiresCustomFont(value)) {
					loadFontForLocale(value);
				} else {
					resetToDefaultFont();
				}
			}, 0);
		}
	});
}
