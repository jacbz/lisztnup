import { addMessages, init } from 'svelte-i18n';

import en from './locales/en.json';

// Add all translation messages
addMessages('en', en);

// Get saved locale from localStorage or use browser language
const savedLocale = typeof window !== 'undefined' ? localStorage.getItem('locale') : null;

// Initialize with fallback chain
init({
	fallbackLocale: 'en',
	initialLocale: savedLocale || 'en'
});

// Export available locales for the language switcher
export const locales = [{ code: 'en', name: 'English' }];
