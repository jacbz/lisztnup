<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { playerState } from '$lib/services';
	import Visualizer from './Visualizer.svelte';
	import PlayStopIcon from './PlayStopIcon.svelte';

	interface Props {
		visible?: boolean;
		isPlaying?: boolean;
		playbackEnded?: boolean;
		isRevealed?: boolean;
		progress?: number; // 0-1
		/// Optional fixed size for the player button. If not provided, size is dynamic based on viewport.
		playerSize?: number;
		onPlay?: () => void;
		onStop?: () => void;
		onReveal?: () => void;
		onReplay?: () => void;
		disabled?: boolean;
		playingLabel?: string | null;
	}

	let {
		visible = true,
		isPlaying = false,
		playbackEnded = false,
		isRevealed = false,
		progress = 0,
		playerSize = undefined,
		onPlay = () => {},
		onStop = () => {},
		onReveal = () => {},
		onReplay = () => {},
		disabled = false,
		playingLabel = null
	}: Props = $props();

	let isHoldingReveal = $state(false);
	let holdTimer: number | null = null;
	let windowSize = $state({ width: 0, height: 0 });
	let displayProgress = $state(0);

	// Reset progress when playback starts fresh (transition from not playing to playing)
	$effect(() => {
		if (isPlaying) {
			displayProgress = Math.max(0, Math.min(1, progress));
		} else {
			displayProgress = 0;
		}
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
		if (disabled) return;

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
			if (playingLabel) return;
			onStop();
		} else {
			onPlay();
		}
	}

	function handlePointerDown() {
		if (disabled) return;

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
</script>

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
				class="relative z-2 flex touch-none items-center justify-center overflow-hidden rounded-full border-4 border-cyan-400 bg-black/20 shadow-[0_0_30px_rgba(34,211,238,0.6)] transition-all duration-200 hover:shadow-[0_0_40px_rgba(34,211,238,0.8)] active:scale-95"
				class:cursor-pointer={!disabled && !(isPlaying && playingLabel)}
				class:cursor-grab={isPlaying && playingLabel}
				class:cursor-not-allowed={disabled}
				class:opacity-60={disabled}
				style="width: {progressPath.buttonSize}px; height: {progressPath.buttonSize}px; font-size: {progressPath.buttonSize *
					0.15}px;"
				onclick={handleClick}
				onpointerdown={handlePointerDown}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerUp}
				{disabled}
				aria-label={isPlaying && playingLabel
					? playingLabel
					: isPlaying
						? 'Stop'
						: playbackEnded
							? 'Reveal'
							: 'Play'}
			>
				{#if isPlaying && (!playerSize || playerSize > 100)}
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
							stroke="#00D4F3"
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
					{:else if isPlaying && playingLabel}
						<span class="font-bold tracking-widest text-cyan-400 uppercase">{playingLabel}</span>
					{:else}
						<PlayStopIcon {isPlaying} size={progressPath.buttonSize * 0.41} />
					{/if}
				</div>
			</button>
		</div>
	{/if}
</div>
