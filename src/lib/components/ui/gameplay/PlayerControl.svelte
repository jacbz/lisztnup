<script lang="ts">
	import Play from 'lucide-svelte/icons/play';
	import Square from 'lucide-svelte/icons/square';
	import type { Track } from '$lib/types';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Popup from '../primitives/Popup.svelte';
	import TrackInfo from './TrackInfo.svelte';
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { deezerPlayer, playerState } from '$lib/services';
	import Visualizer from './Visualizer.svelte';

	interface Props {
		visible?: boolean;
		isPlaying?: boolean;
		playbackEnded?: boolean;
		isRevealed?: boolean;
		progress?: number; // 0-1
		track?: Track | null;
		playerSize?: number;
		onPlay?: () => void;
		onStop?: () => void;
		onReveal?: () => void;
		onReplay?: () => void;
		onNext?: () => void;
		onPlaybackEnd?: () => void;
	}

	let {
		visible = true,
		isPlaying = false,
		playbackEnded = false,
		isRevealed = false,
		progress = 0,
		track = null,
		playerSize = null,
		onPlay = () => {},
		onStop = () => {},
		onReveal = () => {},
		onReplay = () => {},
		onNext = () => {},
		onPlaybackEnd = () => {}
	}: Props = $props();

	let isHoldingReveal = $state(false);
	let holdTimer: number | null = null;
	let windowSize = $state({ width: 0, height: 0 });
	let displayProgress = $state(0);
	let lastIsPlaying = $state(false);

	// Reset progress when playback starts fresh (transition from not playing to playing)
	$effect(() => {
		if (isPlaying && !lastIsPlaying) {
			// Just started playing - reset to 0
			displayProgress = 0;
		} else if (isPlaying) {
			// Currently playing - update progress
			displayProgress = progress;
		} else if (playbackEnded) {
			// Playback ended - keep at 100%
			displayProgress = 1;
		}
		lastIsPlaying = isPlaying;
	});

	onMount(() => {
		windowSize = { width: window.innerWidth, height: window.innerHeight };

		const handleResize = () => {
			windowSize = { width: window.innerWidth, height: window.innerHeight };
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	function handleClick() {
		if (isRevealed) {
			// In revealed state, clicking doesn't do anything (use continue button)
			return;
		}

		if (playbackEnded) {
			// Quick tap reveals
			if (!isHoldingReveal) {
				onReveal();
			}
		} else if (isPlaying) {
			onStop();
		} else {
			onPlay();
		}
	}

	function handlePointerDown() {
		if (playbackEnded && !isRevealed) {
			// Start hold timer for replay
			holdTimer = window.setTimeout(() => {
				isHoldingReveal = true;
				onReplay();
			}, 500); // 500ms hold threshold
		}
	}

	function handlePointerUp() {
		if (holdTimer) {
			clearTimeout(holdTimer);
			holdTimer = null;
		}
		isHoldingReveal = false;
	}

	// Calculate circular progress path
	const progressPath = $derived.by(() => {
		const dynamicSize =
			windowSize.width < 600
				? Math.min(windowSize.width || window.innerWidth, windowSize.height || window.innerHeight) *
					0.16 *
					2
				: Math.min(windowSize.width || window.innerWidth, windowSize.height || window.innerHeight) *
					0.9 *
					0.14 *
					2;

		const buttonSize = playerSize ?? dynamicSize;

		const ringStrokeWidth = Math.max(8, buttonSize * 0.05);
		const ringRadius = buttonSize / 2 - ringStrokeWidth / 2;
		const size = buttonSize;
		const center = size / 2;
		const circumference = 2 * Math.PI * ringRadius;
		const offset = circumference * (1 - displayProgress);

		return {
			size,
			center,
			radius: ringRadius,
			circumference,
			offset,
			strokeWidth: ringStrokeWidth,
			buttonSize
		};
	});

	function handleNext() {
		onNext();
	}
</script>

<!-- Backdrop (using Popup component) -->
<Popup visible={isRevealed} onClose={() => {}}>
	{#snippet children()}
		<div
			class="w-[420px] max-w-[90vw] rounded-3xl border-2 border-cyan-400 bg-gray-900 p-8 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<div class="flex flex-col gap-5">
				<TrackInfo {track} />

				<!-- Continue button -->
				<button
					type="button"
					onclick={handleNext}
					class="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3 font-bold text-cyan-400 transition-all duration-200 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]"
				>
					{$_('game.nextRound')}
					<ArrowRight class="h-5 w-5" />
				</button>
			</div>
		</div>
	{/snippet}
</Popup>

<div
	class="absolute z-30 transition-opacity duration-30 md:mt-0"
	class:visible
	style="opacity: {visible ? 1 : 0}; pointer-events: {visible
		? 'auto'
		: 'none'}; top: 50%; left: 50%; transform: translate(-50%, -50%);"
>
	{#if !isRevealed}
		<!-- Normal state: circular button with internal progress ring -->
		<div class="relative flex items-center justify-center">
			<!-- Play button -->
			<button
				type="button"
				class="relative z-2 flex cursor-pointer touch-none items-center justify-center overflow-hidden rounded-full border-4 border-cyan-400 bg-black/20 shadow-[0_0_30px_rgba(34,211,238,0.6)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(34,211,238,0.8)] active:scale-95"
				style="width: {progressPath.buttonSize}px; height: {progressPath.buttonSize}px; font-size: {progressPath.buttonSize *
					0.15}px;"
				onclick={handleClick}
				onpointerdown={handlePointerDown}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerUp}
				aria-label={isPlaying ? 'Stop' : playbackEnded ? 'Reveal' : 'Play'}
			>
				{#if isPlaying && playerSize > 100}
					<Visualizer
						analyserNode={$playerState.analyserNode}
						width={progressPath.buttonSize}
						height={progressPath.buttonSize}
					/>
				{/if}
				<!-- Progress ring (only during playback) - positioned inside button -->
				{#if isPlaying}
					<svg
						class="pointer-events-none absolute top-1/2 left-1/2 z-1 -translate-x-1/2 -translate-y-1/2 -rotate-90"
						width={progressPath.size}
						height={progressPath.size}
					>
						<circle
							class="transition-[stroke-dashoffset] duration-100"
							stroke="#22d3ee"
							stroke-width={progressPath.strokeWidth}
							fill="transparent"
							r={progressPath.radius}
							cx={progressPath.center}
							cy={progressPath.center}
							style="stroke-dasharray: {progressPath.circumference}; stroke-dashoffset: {progressPath.offset};"
						/>
					</svg>
				{/if}

				<!-- Button content -->
				<div class="relative z-10 flex items-center justify-center">
					{#if playbackEnded}
						<span class="font-bold tracking-widest text-cyan-400 uppercase"
							>{$_('game.reveal')}</span
						>
					{:else if isPlaying}
						<Square
							class="text-cyan-400"
							fill="currentColor"
							size={progressPath.buttonSize * 0.41}
						/>
					{:else}
						<Play
							class="ml-2 text-cyan-400"
							fill="currentColor"
							size={progressPath.buttonSize * 0.41}
						/>
					{/if}
				</div>
			</button>
		</div>
	{/if}
</div>
