import { writable, derived } from 'svelte/store';
import type { GameSettings, Tracklist } from '$lib/types';
import { DEFAULT_SETTINGS } from '$lib/types';
import { DEFAULT_TRACKLISTS } from '$lib/data/defaultTracklists';
import { deezerPlayer, SettingsService } from '$lib/services';

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
						const merged = { ...DEFAULT_SETTINGS, ...parsed };
						set(merged);
						deezerPlayer.setEnableAudioNormalization(merged.enableAudioNormalization);
						deezerPlayer.setTrackLength(merged.trackLengthLimit);
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

// Derived store to resolve the selected tracklist name to the actual Tracklist object
export const selectedTracklist = derived<typeof settings, Tracklist>(settings, ($settings) => {
	// Try to find in default tracklists
	const defaultTracklist = DEFAULT_TRACKLISTS.find((t) => t.name === $settings.selectedTracklist);
	if (defaultTracklist) {
		return defaultTracklist;
	}

	// Try to find in custom tracklists
	const customTracklists = SettingsService.loadCustomTracklists();
	const customTracklist = customTracklists.find((t) => t.name === $settings.selectedTracklist);
	if (customTracklist) {
		return customTracklist;
	}

	// Fallback to default (Medium)
	return DEFAULT_TRACKLISTS[1]; // Medium is at index 1
});
