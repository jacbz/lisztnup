import { browser } from '$app/environment';

const STORAGE_KEY = 'lisztnup_player_token';

function generateToken(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

let cachedToken: string | null = null;

/**
 * Returns a stable, anonymous player token (UUID) persisted in localStorage.
 * Used to identify "my" leaderboard entries without a login system.
 */
export function getPlayerToken(): string {
	if (cachedToken) return cachedToken;

	if (browser) {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			cachedToken = stored;
			return stored;
		}
		const token = generateToken();
		localStorage.setItem(STORAGE_KEY, token);
		cachedToken = token;
		return token;
	}

	// SSR fallback — should never be used for real leaderboard calls
	return generateToken();
}
