import type { GameSettings, Tracklist } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

const SETTINGS_KEY = 'lisztnup-settings';
const CUSTOM_TRACKLISTS_KEY = 'lisztnup-custom-tracklists';

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

	/**
	 * Loads custom tracklists from localStorage
	 */
	static loadCustomTracklists(): Tracklist[] {
		if (typeof window === 'undefined') {
			return [];
		}

		try {
			const stored = localStorage.getItem(CUSTOM_TRACKLISTS_KEY);
			if (stored) {
				return JSON.parse(stored);
			}
		} catch (error) {
			console.error('Error loading custom tracklists:', error);
		}

		return [];
	}

	/**
	 * Saves custom tracklists to localStorage
	 */
	static saveCustomTracklists(tracklists: Tracklist[]): void {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			localStorage.setItem(CUSTOM_TRACKLISTS_KEY, JSON.stringify(tracklists));
		} catch (error) {
			console.error('Error saving custom tracklists:', error);
		}
	}

	/**
	 * Adds or updates a custom tracklist
	 * Uses name matching to find existing tracklists
	 */
	static saveCustomTracklist(tracklist: Tracklist): void {
		const tracklists = this.loadCustomTracklists();
		// Find by exact name match (custom tracklists only)
		const existingIndex = tracklists.findIndex((t) => t.name === tracklist.name && !t.isDefault);

		if (existingIndex >= 0) {
			// Update existing custom tracklist
			tracklists[existingIndex] = tracklist;
		} else {
			// Add new custom tracklist
			tracklists.push(tracklist);
		}

		this.saveCustomTracklists(tracklists);
	}

	/**
	 * Deletes a custom tracklist by name
	 */
	static deleteCustomTracklist(name: string): void {
		const tracklists = this.loadCustomTracklists();
		const filtered = tracklists.filter((t) => t.name !== name);
		this.saveCustomTracklists(filtered);
	}
}
