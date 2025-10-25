<script lang="ts">
	import { deezerPlayer } from '$lib/services';
	import { onMount } from 'svelte';
	import Volume2 from 'lucide-svelte/icons/volume-2';
	import VolumeX from 'lucide-svelte/icons/volume-x';

	let volume = $state(1.0);
	let isDragging = $state(false);
	let sliderRef: HTMLDivElement | null = null;

	onMount(() => {
		// Get initial volume from player
		volume = deezerPlayer.getVolume();
	});

	function handleSliderInteraction(event: MouseEvent | TouchEvent) {
		if (!sliderRef) return;

		const rect = sliderRef.getBoundingClientRect();
		const clientY = event instanceof MouseEvent ? event.clientY : event.touches[0].clientY;

		// Calculate volume from Y position (inverted - top is high volume)
		const relativeY = clientY - rect.top;
		const newVolume = Math.max(0, Math.min(1, 1 - relativeY / rect.height));

		volume = newVolume;
		deezerPlayer.setVolume(volume);
	}

	function handlePointerDown(event: MouseEvent | TouchEvent) {
		isDragging = true;
		handleSliderInteraction(event);

		// Prevent text selection during drag
		event.preventDefault();
	}

	function handlePointerMove(event: MouseEvent | TouchEvent) {
		if (isDragging) {
			handleSliderInteraction(event);
		}
	}

	function handlePointerUp() {
		isDragging = false;
	}

	// Handle global mouse/touch events for dragging
	onMount(() => {
		const handleGlobalMove = (e: MouseEvent | TouchEvent) => handlePointerMove(e);
		const handleGlobalUp = () => handlePointerUp();

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
</script>

<div class="volume-control">
	<!-- Volume icon -->
	<div class="volume-icon">
		{#if volume === 0}
			<VolumeX class="h-5 w-5 text-gray-400" />
		{:else}
			<Volume2 class="h-5 w-5 text-cyan-400" />
		{/if}
	</div>

	<!-- Slider track -->
	<div
		bind:this={sliderRef}
		class="slider-track"
		class:dragging={isDragging}
		role="slider"
		tabindex="0"
		aria-label="Volume"
		aria-valuemin="0"
		aria-valuemax="100"
		aria-valuenow={Math.round(volume * 100)}
		onmousedown={handlePointerDown}
		ontouchstart={handlePointerDown}
	>
		<!-- Filled portion -->
		<div class="slider-fill" style="height: {volume * 100}%"></div>

		<!-- Thumb -->
		<div class="slider-thumb" style="bottom: {volume * 100}%"></div>
	</div>
</div>

<style>
	.volume-control {
		position: fixed;
		right: 24px;
		top: 50%;
		transform: translateY(-50%);
		z-index: 30;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 16px 12px;
		background: rgba(17, 24, 39, 0.8);
		backdrop-filter: blur(10px);
		border-radius: 16px;
		border: 1px solid rgba(34, 211, 238, 0.2);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.volume-icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.slider-track {
		position: relative;
		width: 4px;
		height: 120px;
		background: rgba(255, 255, 255, 0.1);
		border-radius: 2px;
		cursor: pointer;
		touch-action: none;
		transition: width 0.2s ease-out;
	}

	.slider-track:hover,
	.slider-track.dragging {
		width: 6px;
	}

	.slider-fill {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(180deg, #22d3ee 0%, #a855f7 100%);
		border-radius: 2px;
		transition: height 0.1s linear;
		pointer-events: none;
	}

	.slider-thumb {
		position: absolute;
		left: 50%;
		width: 16px;
		height: 16px;
		background: white;
		border: 2px solid #22d3ee;
		border-radius: 50%;
		transform: translate(-50%, 50%);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		transition: all 0.1s linear;
		pointer-events: none;
	}

	.slider-track:hover .slider-thumb,
	.slider-track.dragging .slider-thumb {
		width: 20px;
		height: 20px;
		box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
	}
</style>
