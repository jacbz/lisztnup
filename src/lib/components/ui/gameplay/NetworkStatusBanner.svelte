<script lang="ts">
	import { fly } from 'svelte/transition';
	import { isOffline, isOnline, lastReconnectedAt } from '$lib/stores';
	import WifiOff from 'lucide-svelte/icons/wifi-off';
	import Loader from 'lucide-svelte/icons/loader-circle';
	import { _ } from 'svelte-i18n';

	/** Delay before showing the "still loading" indicator to avoid flashing on fast loads. */
	const LOADING_DEBOUNCE_MS = 1500;

	interface Props {
		/** True while a preload is in-flight (normal or retrying). */
		isLoading?: boolean;
		/** True when the preload failed due to a network error. Shown immediately (no debounce). */
		hasError?: boolean;
	}

	let { isLoading = false, hasError = false }: Props = $props();

	// Debounced version of isLoading — only turns true after LOADING_DEBOUNCE_MS
	// so quick preloads never flash the banner.
	let debouncedLoading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (isLoading && !hasError) {
			// Start debounce timer
			if (!loadingTimer) {
				loadingTimer = setTimeout(() => {
					debouncedLoading = true;
					loadingTimer = null;
				}, LOADING_DEBOUNCE_MS);
			}
		} else {
			// Clear immediately when loading finishes or error takes over
			if (loadingTimer) {
				clearTimeout(loadingTimer);
				loadingTimer = null;
			}
			debouncedLoading = false;
		}
	});

	// Brief "reconnected" toast that auto-hides after 2s
	let showReconnected = $state(false);
	let reconnectedTimer: ReturnType<typeof setTimeout> | null = null;

	// Watch for reconnection events
	$effect(() => {
		const ts = $lastReconnectedAt;
		if (ts > 0 && $isOnline) {
			showReconnected = true;
			if (reconnectedTimer) clearTimeout(reconnectedTimer);
			reconnectedTimer = setTimeout(() => {
				showReconnected = false;
			}, 2000);
		}
	});

	// Show loading (debounced) or error (immediate), but offline banner takes priority
	const showLoading = $derived(!$isOffline && !hasError && debouncedLoading);
	const showError = $derived(!$isOffline && hasError);
	const showBanner = $derived($isOffline || showLoading || showError);
</script>

{#if showBanner}
	<div
		class="pointer-events-none fixed top-20 right-0 left-0 z-1000 flex justify-center"
		transition:fly={{ y: -20, duration: 300 }}
	>
		<div
			class="pointer-events-auto flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium shadow-lg backdrop-blur-md
				{$isOffline
				? 'border-red-500/50 bg-red-950/80 text-red-300'
				: 'border-amber-500/50 bg-amber-950/80 text-amber-300'}"
		>
			{#if $isOffline}
				<WifiOff class="h-4 w-4" />
				<span>{$_('network.offline')}</span>
			{:else if showError}
				<Loader class="h-4 w-4 animate-spin" />
				<span>{$_('network.loadFailed')}</span>
			{:else if showLoading}
				<Loader class="h-4 w-4 animate-spin" />
				<span>{$_('network.loading')}</span>
			{/if}
		</div>
	</div>
{/if}

{#if showReconnected}
	<div
		class="pointer-events-none fixed top-20 right-0 left-0 z-50 flex justify-center"
		transition:fly={{ y: -20, duration: 300 }}
	>
		<div
			class="pointer-events-auto flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-950/80 px-4 py-1.5 text-sm font-medium text-emerald-300 shadow-lg backdrop-blur-md"
		>
			<span>{$_('network.reconnected')}</span>
		</div>
	</div>
{/if}
