<script lang="ts">
	import { deezerPlayer } from '$lib/services';
	import { settings as settingsStore } from '$lib/stores';
	import { onMount } from 'svelte';
	import Popup from './Popup.svelte';
	import Volume2 from 'lucide-svelte/icons/volume-2';
	import VolumeX from 'lucide-svelte/icons/volume-x';
	import Clock from 'lucide-svelte/icons/clock';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
	}

	let { visible = false, onClose = () => {} }: Props = $props();

	let volume = $state(1.0);
	let trackLength = $state(20);
	let isDraggingVolume = $state(false);
	let volumeSliderRef: HTMLDivElement | null = null;

	onMount(() => {
		// Get initial values from player and settings
		volume = deezerPlayer.getVolume();
		trackLength = $settingsStore.trackLength;
	});

	function handleVolumeSliderInteraction(event: MouseEvent | TouchEvent) {
		if (!volumeSliderRef) return;

		const rect = volumeSliderRef.getBoundingClientRect();
		const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

		// Calculate volume from Y position (inverted - top is high volume)
		const relativeY = clientY - rect.top;
		const newVolume = Math.max(0, Math.min(1, 1 - relativeY / rect.height));

		volume = newVolume;
		deezerPlayer.setVolume(volume);
	}

	function handleVolumePointerDown(event: MouseEvent | TouchEvent) {
		isDraggingVolume = true;
		handleVolumeSliderInteraction(event);
		event.preventDefault();
	}

	function handleVolumePointerMove(event: MouseEvent | TouchEvent) {
		if (isDraggingVolume) {
			handleVolumeSliderInteraction(event);
		}
	}

	function handleVolumePointerUp() {
		isDraggingVolume = false;
	}

	// Handle global mouse/touch events for volume dragging
	onMount(() => {
		const handleGlobalMove = (e: MouseEvent | TouchEvent) => handleVolumePointerMove(e);
		const handleGlobalUp = () => handleVolumePointerUp();

		window.addEventListener('mousemove', handleGlobalMove);
		window.addEventListener('touchmove', handleGlobalMove);
		window.addEventListener('mouseup', handleGlobalUp);
		window.addEventListener('touchend', handleGlobalUp);

		return () => {
			window.removeEventListener('mousemove', handleGlobalMove);
			window.removeEventListener('touchmove', handleGlobalMove);
			window.removeEventListener('mouseup', handleGlobalUp);
			window.removeEventListener('touchend', handleGlobalUp);
		};
	});

	function handleTrackLengthChange(event: Event) {
		const target = event.target as HTMLInputElement;
		trackLength = parseInt(target.value);
		deezerPlayer.setTrackLength(trackLength);

		// Save to settings
		settingsStore.update((s) => ({ ...s, trackLength }));
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="w-full max-w-md rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('inGameSettings.title')}</h2>

		<div class="space-y-6">
			<!-- Volume Control -->
			<div class="flex items-center gap-4">
				<div class="flex flex-col items-center gap-2">
					<div class="text-gray-400">
						{#if volume === 0}
							<VolumeX class="h-5 w-5" />
						{:else}
							<Volume2 class="h-5 w-5 text-cyan-400" />
						{/if}
					</div>
					<span class="text-sm text-gray-400">{$_('inGameSettings.volume')}</span>
				</div>

				<!-- Volume slider (vertical) -->
				<div class="flex flex-1 items-center gap-4">
					<div
						bind:this={volumeSliderRef}
						class="relative h-32 w-3 cursor-pointer rounded-full bg-gray-700"
						class:opacity-100={isDraggingVolume}
						class:opacity-80={!isDraggingVolume}
						role="slider"
						tabindex="0"
						aria-label="Volume"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={Math.round(volume * 100)}
						onmousedown={handleVolumePointerDown}
						ontouchstart={handleVolumePointerDown}
					>
						<!-- Filled portion -->
						<div
							class="absolute right-0 bottom-0 left-0 rounded-full bg-linear-to-t from-cyan-500 to-purple-600 transition-all"
							style="height: {volume * 100}%"
						></div>

						<!-- Thumb -->
						<div
							class="absolute -left-1.5 h-6 w-6 -translate-y-1/2 rounded-full border-2 border-cyan-400 bg-gray-900 shadow-[0_0_12px_rgba(34,211,238,0.8)] transition-all"
							style="bottom: {volume * 100}%"
						></div>
					</div>

					<span class="text-lg font-bold text-white">{Math.round(volume * 100)}%</span>
				</div>
			</div>

			<!-- Track Length Slider -->
			<div>
				<div class="mb-3 flex items-center gap-2">
					<Clock class="h-5 w-5 text-cyan-400" />
					<span class="font-semibold text-cyan-400">{$_('inGameSettings.trackLength')}</span>
				</div>
				<div class="flex items-center gap-4">
					<input
						type="range"
						min="5"
						max="30"
						bind:value={trackLength}
						oninput={handleTrackLengthChange}
						class="flex-1 accent-cyan-500"
					/>
					<span class="w-12 text-right text-xl font-bold text-white">{trackLength}s</span>
				</div>
				<p class="mt-2 text-sm text-gray-400">{$_('inGameSettings.trackLengthHint')}</p>
			</div>
		</div>

		<!-- Close button -->
		<button
			type="button"
			onclick={onClose}
			class="mt-6 w-full rounded-xl bg-linear-to-r from-cyan-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95"
		>
			{$_('inGameSettings.close')}
		</button>
	</div>
</Popup>
