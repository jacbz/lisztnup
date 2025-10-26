<script lang="ts">
	import Play from 'lucide-svelte/icons/play';
	import Square from 'lucide-svelte/icons/square';
	import { formatComposerName, formatLifespan, formatYearRange } from '$lib/utils';
	import { deezerPlayer } from '$lib/services';
	import type { Track } from '$lib/types';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import Popup from './Popup.svelte';
	import { _ } from 'svelte-i18n';
	import { onMount } from 'svelte';

	interface Props {
		visible?: boolean;
		isPlaying?: boolean;
		playbackEnded?: boolean;
		isRevealed?: boolean;
		progress?: number; // 0-1
		track?: Track | null;
		onPlay?: () => void;
		onStop?: () => void;
		onReveal?: () => void;
		onReplay?: () => void;
		onNext?: () => void;
	}

	let {
		visible = true,
		isPlaying = false,
		playbackEnded = false,
		isRevealed = false,
		progress = 0,
		track = null,
		onPlay = () => {},
		onStop = () => {},
		onReveal = () => {},
		onReplay = () => {},
		onNext = () => {}
	}: Props = $props();

	let isHoldingReveal = $state(false);
	let holdTimer: number | null = null;
	let windowSize = $state({ width: 0, height: 0 });

	onMount(() => {
		windowSize = { width: window.innerWidth, height: window.innerHeight };

		const handleResize = () => {
			windowSize = { width: window.innerWidth, height: window.innerHeight };
		};

		window.addEventListener('resize', handleResize);
		return () => window.removeEventListener('resize', handleResize);
	});

	const composerName = $derived(track ? formatComposerName(track.composer.name) : '');
	const lifespan = $derived(
		track ? formatLifespan(track.composer.birth_year, track.composer.death_year) : ''
	);
	const artistName = $derived(deezerPlayer.getArtistName());
	const shouldShowArtist = $derived(artistName && artistName.toLowerCase() !== 'unknown artist');
	const shouldShowPart = $derived(track && track.work.name !== track.part.name);
	const deezerTrackUrl = $derived(track ? `https://www.deezer.com/track/${track.part.deezer}` : '');

	// Strip work name prefix from part name if part starts with work name
	const displayPartName = $derived.by(() => {
		if (!track || !shouldShowPart) return '';

		const workName = track.work.name;
		const partName = track.part.name;

		// Check if part starts with work name followed by punctuation
		const prefixPattern = new RegExp(
			`^${workName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\-,]\\s*`,
			'i'
		);
		const strippedName = partName.replace(prefixPattern, '').trim();

		// Return stripped name if it's different and not empty, otherwise return full part name
		return strippedName && strippedName !== partName ? strippedName : partName;
	});

	const displayYear = $derived.by(() => {
		const { begin_year, end_year } = track?.work ?? {};

		return formatYearRange(begin_year, end_year);
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
		// Use percentage-based sizing relative to viewport
		const minDimension = Math.min(
			windowSize.width || window.innerWidth,
			windowSize.height || window.innerHeight
		);
		const wheelSize = minDimension * 0.9; // 90% of smaller dimension (matching SpinningWheel)
		const buttonSize = wheelSize * 0.14 * 2; // 16% radius * 2 (matching wheel center circle)
		const ringStrokeWidth = buttonSize * 0.04; // 4% of button size (thinner for inside)
		const ringRadius = buttonSize / 2 - ringStrokeWidth / 2; // Inside the button with padding
		const size = buttonSize;
		const center = size / 2;
		const circumference = 2 * Math.PI * ringRadius;
		const offset = circumference * (1 - progress);

		return {
			size,
			center,
			radius: ringRadius,
			circumference,
			offset,
			strokeWidth: ringStrokeWidth,
			buttonSize // Pass button size for styling
		};
	});

	function handleNext() {
		onNext();
	}
</script>

<!-- Backdrop (using Popup component) -->
<Popup visible={isRevealed} onClose={() => {}}>
	{#snippet children()}
		<div class="reveal-card">
			<div class="reveal-content">
				{#if track}
					<!-- Composer -->
					<div class="info-section">
						<p class="text-center text-3xl font-bold text-white">
							{composerName}
						</p>
						<p class="text-center text-lg text-gray-400">({lifespan})</p>
					</div>

					<!-- Work with Year -->
					<div class="info-section">
						<p class="text-center text-2xl font-semibold wrap-break-word text-white">
							{track.work.name}
							{#if displayYear}
								<span
									class="ml-0.5 bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text font-normal text-nowrap text-transparent"
								>
									({displayYear})
								</span>
							{/if}
						</p>
					</div>

					<!-- Part (only if different from work, with stripped prefix) -->
					{#if shouldShowPart}
						<div class="info-section">
							<p class="text-center text-xl wrap-break-word text-gray-300">
								{displayPartName}
							</p>
						</div>
					{/if}

					<!-- Artist/Performer (only if not unknown) -->
					{#if shouldShowArtist}
						<div class="info-section">
							<a
								href={deezerTrackUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="artist-link text-center text-sm text-gray-400"
							>
								{artistName}
							</a>
						</div>
					{/if}

					<!-- Continue button -->
					<button type="button" onclick={handleNext} class="continue-button">
						{$_('game.nextRound')}
						<ArrowRight class="h-5 w-5" />
					</button>
				{/if}
			</div>
		</div>
	{/snippet}
</Popup>

<div
	class="player-control-container"
	class:visible
	style="opacity: {visible ? 1 : 0}; pointer-events: {visible ? 'auto' : 'none'};"
>
	{#if !isRevealed}
		<!-- Normal state: circular button with internal progress ring -->
		<div class="player-wrapper">
			<!-- Play button -->
			<button
				type="button"
				class="player-button"
				style="width: {progressPath.buttonSize}px; height: {progressPath.buttonSize}px; font-size: {progressPath.buttonSize *
					0.115}px;"
				onclick={handleClick}
				onpointerdown={handlePointerDown}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerUp}
				aria-label={isPlaying ? 'Stop' : playbackEnded ? 'Reveal' : 'Play'}
			>
				<!-- Progress ring (only during playback) - positioned inside button -->
				{#if isPlaying}
					<svg class="progress-ring" width={progressPath.size} height={progressPath.size}>
						<circle
							class="progress-ring-circle"
							stroke="white"
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
				<div class="button-content">
					{#if playbackEnded}
						<span class="reveal-text">REVEAL</span>
					{:else if isPlaying}
						<Square class="text-white" fill="white" size={progressPath.buttonSize * 0.41} />
					{:else}
						<Play class="ml-2 text-white" fill="white" size={progressPath.buttonSize * 0.41} />
					{/if}
				</div>
			</button>
		</div>
	{/if}
</div>

<style>
	.player-control-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 30;
		transition: opacity 0.3s ease-out;
	}

	.player-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.player-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: linear-gradient(135deg, #22d3ee 0%, #a855f7 100%);
		cursor: pointer;
		transition: all 0.2s ease-out;
		touch-action: none;
		z-index: 2;
	}

	.player-button:active {
		transform: scale(0.95);
	}

	.progress-ring {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) rotate(-90deg);
		pointer-events: none;
		z-index: 1;
	}

	.progress-ring-circle {
		transition: stroke-dashoffset 0.1s linear;
	}

	.button-content {
		position: relative;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reveal-text {
		/* Font size is now set via inline style for dynamic sizing */
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	.reveal-card {
		width: 420px;
		max-width: 90vw;
		padding: 32px;
		border-radius: 24px;
		border: 2px solid #22d3ee;
		background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
	}

	.reveal-content {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.info-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.continue-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		width: 100%;
		padding: 12px 24px;
		margin-top: 8px;
		border-radius: 12px;
		background: linear-gradient(90deg, #22d3ee 0%, #a855f7 100%);
		color: white;
		font-weight: 700;
		border: none;
		cursor: pointer;
		transition: all 0.2s ease-out;
	}

	.artist-link {
		color: #22d3ee;
		text-decoration: none;
		transition: all 0.2s ease-out;
		display: inline-block;
	}

	.artist-link:hover {
		text-decoration: underline;
	}
</style>
