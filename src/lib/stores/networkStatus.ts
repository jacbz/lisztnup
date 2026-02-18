import { writable, derived } from 'svelte/store';

/**
 * Reactive network status store.
 *
 * Tracks browser online/offline state and exposes helpers for components
 * to wait for reconnection. Uses the standard `navigator.onLine` API
 * plus `window` online/offline events for real-time updates.
 */

/** Whether the browser reports an active network connection. */
export const isOnline = writable(typeof navigator !== 'undefined' ? navigator.onLine : true);

/** Timestamp (ms) of the last observed offline→online transition, or 0. */
export const lastReconnectedAt = writable(0);

/** Convenience derived store: true when the browser is offline. */
export const isOffline = derived(isOnline, ($online) => !$online);

// Register window listeners once (module scope, guarded for SSR)
if (typeof window !== 'undefined') {
	window.addEventListener('online', () => {
		isOnline.set(true);
		lastReconnectedAt.set(Date.now());
	});
	window.addEventListener('offline', () => {
		isOnline.set(false);
	});
}

/**
 * Returns a promise that resolves when the browser goes back online.
 * Resolves immediately if already online.
 */
export function waitForOnline(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof navigator !== 'undefined' && navigator.onLine) {
			resolve();
			return;
		}
		const handler = () => {
			window.removeEventListener('online', handler);
			resolve();
		};
		window.addEventListener('online', handler);
	});
}
