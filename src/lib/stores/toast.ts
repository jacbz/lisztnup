import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration?: number;
}

interface ToastStore {
	toasts: Toast[];
}

function createToastStore() {
	const { subscribe, update } = writable<ToastStore>({ toasts: [] });

	let idCounter = 0;

	return {
		subscribe,
		show: (type: ToastType, message: string, duration: number = 3000) => {
			const id = `toast-${++idCounter}`;
			const toast: Toast = { id, type, message, duration };

			update((state) => ({
				toasts: [...state.toasts, toast]
			}));

			// Auto-dismiss after duration
			if (duration > 0) {
				setTimeout(() => {
					update((state) => ({
						toasts: state.toasts.filter((t) => t.id !== id)
					}));
				}, duration);
			}

			return id;
		},
		dismiss: (id: string) => {
			update((state) => ({
				toasts: state.toasts.filter((t) => t.id !== id)
			}));
		},
		clear: () => {
			update(() => ({ toasts: [] }));
		},
		// Convenience methods
		success: (message: string, duration?: number) => {
			return createToastStore().show('success', message, duration);
		},
		error: (message: string, duration?: number) => {
			return createToastStore().show('error', message, duration);
		},
		warning: (message: string, duration?: number) => {
			return createToastStore().show('warning', message, duration);
		},
		info: (message: string, duration?: number) => {
			return createToastStore().show('info', message, duration);
		}
	};
}

export const toast = createToastStore();
