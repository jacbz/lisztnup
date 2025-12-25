/**
 * Dynamic font loader for CJK locales
 * Loads fonts from Google Fonts on demand to optimize initial page load
 */

const FONT_CONFIGS = {
	ja: {
		family: 'Zen Maru Gothic',
		weights: [300, 400, 500, 700, 900],
		url: 'https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@300;400;500;700;900&display=swap'
	},
	'zh-CN': {
		family: 'Noto Sans SC',
		url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&display=swap'
	},
	'zh-TW': {
		family: 'Chiron GoRound TC',
		url: 'https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@200..900&display=swap'
	}
};

// Track loaded fonts to avoid duplicate loads
const loadedFonts = new Set<string>();

/**
 * Apply font for a specific locale
 * @param locale - The locale code (ja, zh-CN, zh-TW)
 */
export function applyFontForLocale(locale: string): void {
	// Only apply for CJK locales
	if (!FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS]) {
		return;
	}

	const config = FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS];

	// Apply font immediately if already loaded
	if (loadedFonts.has(locale)) {
		document.body.style.setProperty(
			'font-family',
			`'${config.family}', 'Rajdhani', system-ui, sans-serif`,
			'important'
		);
		return;
	}

	// Otherwise, load the font first
	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.href = config.url;
	document.head.appendChild(link);

	// Apply font to body element after loading
	link.onload = () => {
		document.body.style.setProperty(
			'font-family',
			`'${config.family}', 'Rajdhani', system-ui, sans-serif`,
			'important'
		);
		loadedFonts.add(locale);
	};
}

/**
 * Load a font for a specific locale (deprecated, use applyFontForLocale)
 * @param locale - The locale code (ja, zh-CN, zh-TW)
 */
export function loadFontForLocale(locale: string): void {
	applyFontForLocale(locale);
}

/**
 * Reset to default font (Rajdhani)
 */
export function resetToDefaultFont(): void {
	document.body.style.setProperty('font-family', "'Rajdhani', system-ui, sans-serif", 'important');
}

/**
 * Check if a locale requires a custom font
 */
export function requiresCustomFont(locale: string): boolean {
	return locale in FONT_CONFIGS;
}

/**
 * Get the font family name for a locale
 */
export function getFontFamily(locale: string): string {
	const config = FONT_CONFIGS[locale as keyof typeof FONT_CONFIGS];
	return config ? config.family : 'Rajdhani';
}
