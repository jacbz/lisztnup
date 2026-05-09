import { browser } from '$app/environment';

const STORAGE_KEY = 'lisztnup_player_token';

// Handle domain migration
if (browser) {
	const urlParams = new URLSearchParams(window.location.search);
	const migrateToken = urlParams.get('player_token');
	const migrateFlag = urlParams.get('migrate');

	// If arriving with a migration token, save it
	if (migrateFlag && migrateToken) {
		localStorage.setItem(STORAGE_KEY, migrateToken);
		// Clean up the URL
		urlParams.delete('player_token');
		urlParams.delete('migrate');
		const newUrl =
			window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
		window.history.replaceState({}, '', newUrl);
	}

	// If on the old domain, redirect to the new domain
	if (window.location.hostname === 'lisztnup.jacobzhang.de') {
		const token = localStorage.getItem(STORAGE_KEY);

		// Also preserve any other query params or hashes
		const currentUrl = new URL(window.location.href);

		if (token) {
			currentUrl.searchParams.set('migrate', 'true');
			currentUrl.searchParams.set('player_token', token);
		}

		const redirectUrl = `https://lisztnup.com${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
		window.location.replace(redirectUrl);
	}
}

function generateToken(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	// Fallback for environments without randomUUID
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
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
