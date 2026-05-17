import type { GameSettings, CustomTracklist } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';
import { TIMELINE_TARGET_OPTIONS } from '$lib/types/game';

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

				// MIGRATION (may be removed once all users have upgraded from pre-refactor data):
				// Old data stored i18n keys like 'tracklists.beginner.name' as selectedTracklist.
				if (
					typeof parsed.selectedTracklist === 'string' &&
					parsed.selectedTracklist.startsWith('tracklists.') &&
					parsed.selectedTracklist.endsWith('.name')
				) {
					parsed.selectedTracklist = parsed.selectedTracklist.slice(
						'tracklists.'.length,
						-'.name'.length
					);
				}
				if (!(TIMELINE_TARGET_OPTIONS as readonly number[]).includes(parsed.timelineTarget)) {
					parsed.timelineTarget = DEFAULT_SETTINGS.timelineTarget;
				}

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
	 */
	static loadCustomTracklists(): CustomTracklist[] {
		if (typeof window === 'undefined') {
			return [];
		}

		try {
			const stored = localStorage.getItem(CUSTOM_TRACKLISTS_KEY);
			if (stored) {
				const raw: unknown[] = JSON.parse(stored);

				// MIGRATION (may be removed once all users have upgraded from pre-refactor data):
				// Old custom tracklists lacked 'kind' and 'id' fields.
				const needsMigration = raw.some(
					(t) => typeof t === 'object' && t !== null && !('kind' in t)
				);
				const tracklists = raw.map((t) => {
					const obj = t as Record<string, unknown>;
					if (!('kind' in obj)) {
						return { ...obj, kind: 'custom' as const, id: crypto.randomUUID() } as CustomTracklist;
					}
					return t as CustomTracklist;
				});
				if (needsMigration) {
					this.saveCustomTracklists(tracklists);
				}

				return tracklists;
			}
		} catch (error) {
			console.error('Error loading custom tracklists:', error);
		}

		return [];
	}

	/**
	 * Saves an array of custom tracklists to localStorage.
	 */
	static saveCustomTracklists(tracklists: CustomTracklist[]): void {
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
	 * Adds or updates a custom tracklist in localStorage, identified by its stable `id`.
	 */
	static saveCustomTracklist(tracklist: CustomTracklist): void {
		const tracklists = this.loadCustomTracklists();
		const existingIndex = tracklists.findIndex((t) => t.id === tracklist.id);

		if (existingIndex >= 0) {
			tracklists[existingIndex] = tracklist;
		} else {
			tracklists.push(tracklist);
		}

		this.saveCustomTracklists(tracklists);
	}

	/**
	 * Deletes a custom tracklist from localStorage by its `id`.
	 */
	static deleteCustomTracklist(id: string): void {
		const tracklists = this.loadCustomTracklists();
		const filtered = tracklists.filter((t) => t.id !== id);
		this.saveCustomTracklists(filtered);
	}
}
