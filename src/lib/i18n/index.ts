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

// Initialize with fallback chain
init({
	fallbackLocale: 'en',
	initialLocale: savedLocale || 'en'
});

// Export available locales for the language switcher
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

// Export locale store for external use
export { locale };

// Subscribe to locale changes and load appropriate fonts
if (typeof window !== 'undefined') {
	locale.subscribe((value) => {
		if (value) {
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
