import { writable } from 'svelte/store';
import type { GameSettings } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

const SETTINGS_KEY = 'lisztnup-settings';

function createSettingsStore() {
	const { subscribe, set, update } = writable<GameSettings>(DEFAULT_SETTINGS);

	// Helper to persist to localStorage
	const persist = (settings: GameSettings) => {
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
			} catch (error) {
				console.error('Error saving settings to localStorage:', error);
			}
		}
	};

	return {
		subscribe,
		set: (settings: GameSettings) => {
			set(settings);
			persist(settings);
		},
		update: (updater: (settings: GameSettings) => GameSettings) => {
			let newSettings: GameSettings;
			update((s) => {
				newSettings = updater(s);
				persist(newSettings);
				return newSettings;
			});
		},
		load: () => {
			if (typeof window !== 'undefined') {
				const stored = localStorage.getItem(SETTINGS_KEY);
				if (stored) {
					try {
						const parsed = JSON.parse(stored);
						set({ ...DEFAULT_SETTINGS, ...parsed });
					} catch (error) {
						console.error('Error loading settings:', error);
					}
				}
			}
		},
		save: (settings: GameSettings) => {
			set(settings);
			persist(settings);
		}
	};
}

export const settings = createSettingsStore();
