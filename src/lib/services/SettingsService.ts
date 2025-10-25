import type { GameSettings } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

const SETTINGS_KEY = 'lisztnup-settings';

export class SettingsService {
	/**
	 * Loads settings from localStorage
	 */
	static load(): GameSettings {
		if (typeof window === 'undefined') {
			return DEFAULT_SETTINGS;
		}

		try {
			const stored = localStorage.getItem(SETTINGS_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				return { ...DEFAULT_SETTINGS, ...parsed };
			}
		} catch (error) {
			console.error('Error loading settings:', error);
		}

		return DEFAULT_SETTINGS;
	}

	/**
	 * Saves settings to localStorage
	 */
	static save(settings: GameSettings): void {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
		} catch (error) {
			console.error('Error saving settings:', error);
		}
	}

	/**
	 * Resets settings to defaults
	 */
	static reset(): GameSettings {
		if (typeof window !== 'undefined') {
			localStorage.removeItem(SETTINGS_KEY);
		}
		return DEFAULT_SETTINGS;
	}
}
