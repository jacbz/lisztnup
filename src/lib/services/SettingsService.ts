import type { GameSettings, Tracklist } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

const SETTINGS_KEY = 'lisztnup-settings';
const CUSTOM_TRACKLISTS_KEY = 'lisztnup-custom-tracklists';

export class SettingsService {
	/**
	 * Loads game settings from localStorage, merging them with defaults.
	 * @returns The loaded game settings.
	 */
	static load(): GameSettings {
		if (typeof window === 'undefined') {
			return DEFAULT_SETTINGS;
		}

		try {
			const stored = localStorage.getItem(SETTINGS_KEY);
			if (stored) {
				const parsed = JSON.parse(stored);
				// Merge parsed settings with defaults to ensure all keys are present
				return { ...DEFAULT_SETTINGS, ...parsed };
			}
		} catch (error) {
			console.error('Error loading settings:', error);
		}

		return DEFAULT_SETTINGS;
	}

	/**
	 * Saves the provided game settings to localStorage.
	 * @param settings The game settings to save.
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
	 * Resets the game settings to their default values and removes them from localStorage.
	 * @returns The default game settings.
	 */
	static reset(): GameSettings {
		if (typeof window !== 'undefined') {
			localStorage.removeItem(SETTINGS_KEY);
		}
		return DEFAULT_SETTINGS;
	}

	/**
	 * Loads all custom tracklists from localStorage.
	 * @returns An array of custom tracklists.
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
	 * Saves an array of custom tracklists to localStorage.
	 * @param tracklists The array of tracklists to save.
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
	 * Adds or updates a custom tracklist in localStorage.
	 * If `oldName` is provided and is different from the new name, it handles renaming.
	 * @param tracklist The tracklist to save.
	 * @param oldName The original name of the tracklist, used for renaming.
	 */
	static saveCustomTracklist(tracklist: Tracklist, oldName?: string): void {
		const tracklists = this.loadCustomTracklists();

		// Handle renaming case
		if (oldName && oldName !== tracklist.name) {
			const filtered = tracklists.filter((t) => t.name !== oldName);
			filtered.push(tracklist);
			this.saveCustomTracklists(filtered);

			// If the renamed tracklist was the selected one, update the settings
			const settings = this.load();
			if (settings.selectedTracklist === oldName) {
				settings.selectedTracklist = tracklist.name;
				this.save(settings);
			}
		} else {
			// Find by exact name match for custom (non-default) tracklists
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
	}

	/**
	 * Deletes a custom tracklist from localStorage by its name.
	 * @param name The name of the tracklist to delete.
	 */
	static deleteCustomTracklist(name: string): void {
		const tracklists = this.loadCustomTracklists();
		const filtered = tracklists.filter((t) => t.name !== name);
		this.saveCustomTracklists(filtered);
	}
}
