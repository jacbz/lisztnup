import { writable } from 'svelte/store';
import type { GameSettings } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';

function createSettingsStore() {
	const { subscribe, set, update } = writable<GameSettings>(DEFAULT_SETTINGS);

	return {
		subscribe,
		set,
		update,
		load: () => {
			if (typeof window !== 'undefined') {
				const stored = localStorage.getItem('lisztnup-settings');
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
			if (typeof window !== 'undefined') {
				localStorage.setItem('lisztnup-settings', JSON.stringify(settings));
			}
		}
	};
}

export const settings = createSettingsStore();
