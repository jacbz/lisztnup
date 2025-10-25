<script lang="ts">
	import Play from 'lucide-svelte/icons/play';
	import Square from 'lucide-svelte/icons/square';
	import { formatComposerName, formatLifespan } from '$lib/utils';
	import { deezerPlayer } from '$lib/services';
	import type { Track } from '$lib/types';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';

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

	const composerName = $derived(track ? formatComposerName(track.composer.name) : '');
	const lifespan = $derived(
		track ? formatLifespan(track.composer.birth_year, track.composer.death_year) : ''
	);
	const artistName = $derived(deezerPlayer.getArtistName());
	const shouldShowArtist = $derived(artistName && artistName.toLowerCase() !== 'unknown artist');
	const shouldShowPart = $derived(track && track.work.name !== track.part.name);

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
		if (!track) return '';
		return track.work.begin_year === track.work.end_year
			? track.work.begin_year.toString()
			: `${track.work.begin_year}–${track.work.end_year}`;
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
		const size = 120;
		const center = size / 2;
		const radius = size / 2 - 6;
		const circumference = 2 * Math.PI * radius;
		const offset = circumference * (1 - progress);

		return {
			size,
			center,
			radius,
			circumference,
			offset
		};
	});
</script>

<div
	class="player-control-container"
	class:visible
	class:revealed={isRevealed}
	style="opacity: {visible ? 1 : 0}; pointer-events: {visible ? 'auto' : 'none'};"
>
	{#if isRevealed && track}
		<!-- Revealed state: enlarged rounded square with track details -->
		<div class="reveal-card">
			<div class="reveal-content">
				<!-- Composer -->
				<div class="info-section">
					<p class="text-center text-3xl font-bold text-white">
						{composerName}
					</p>
					<p class="text-center text-base text-gray-400">({lifespan})</p>
				</div>

				<!-- Year (prominent) -->
				<div class="year-section">
					<p
						class="bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-center text-5xl font-bold text-transparent"
					>
						{displayYear}
					</p>
				</div>

				<!-- Work -->
				<div class="info-section">
					<p class="text-center text-xl font-semibold wrap-break-word text-white">
						{track.work.name}
					</p>
				</div>

				<!-- Part (only if different from work, with stripped prefix) -->
				{#if shouldShowPart}
					<div class="info-section">
						<p class="text-center text-lg wrap-break-word text-gray-300 italic">
							{displayPartName}
						</p>
					</div>
				{/if}

				<!-- Artist/Performer (only if not unknown) -->
				{#if shouldShowArtist}
					<div class="info-section">
						<p class="text-center text-sm text-gray-400">{artistName}</p>
					</div>
				{/if}

				<!-- Continue button -->
				<button type="button" onclick={onNext} class="continue-button">
					{$_('game.nextRound')}
					<ArrowRight class="h-5 w-5" />
				</button>
			</div>
		</div>
	{:else}
		<!-- Normal state: circular button -->
		<button
			type="button"
			class="player-button"
			onclick={handleClick}
			onpointerdown={handlePointerDown}
			onpointerup={handlePointerUp}
			onpointerleave={handlePointerUp}
			aria-label={isPlaying ? 'Stop' : playbackEnded ? 'Reveal' : 'Play'}
		>
			<!-- Progress ring (only during playback) -->
			{#if isPlaying}
				<svg class="progress-ring" width={progressPath.size} height={progressPath.size}>
					<circle
						class="progress-ring-circle"
						stroke="#22d3ee"
						stroke-width="6"
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
					<Square class="h-12 w-12 text-white" fill="white" />
				{:else}
					<Play class="ml-1 h-12 w-12 text-white" fill="white" />
				{/if}
			</div>
		</button>
	{/if}
</div>

<style>
	.player-control-container {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 20;
		transition: opacity 0.3s ease-out;
	}

	.player-button {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		border: 4px solid #22d3ee;
		background: linear-gradient(135deg, #22d3ee 0%, #a855f7 100%);
		box-shadow: 0 0 30px rgba(34, 211, 238, 0.6);
		cursor: pointer;
		transition: all 0.2s ease-out;
		touch-action: none;
	}

	.player-button:hover {
		box-shadow: 0 0 50px rgba(34, 211, 238, 0.8);
		transform: scale(1.05);
	}

	.player-button:active {
		transform: scale(0.95);
	}

	.progress-ring {
		position: absolute;
		top: 0;
		left: 0;
		transform: rotate(-90deg);
		pointer-events: none;
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
		font-size: 18px;
		font-weight: 700;
		color: white;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}

	/* Revealed state */
	.player-control-container.revealed {
		animation: flipAndEnlarge 0.5s ease-out forwards;
	}

	.reveal-card {
		width: 420px;
		max-width: 90vw;
		padding: 32px;
		border-radius: 24px;
		border: 2px solid #22d3ee;
		background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
		box-shadow: 0 0 60px rgba(34, 211, 238, 0.6);
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

	.year-section {
		padding: 16px 0;
		border-top: 1px solid rgba(34, 211, 238, 0.3);
		border-bottom: 1px solid rgba(34, 211, 238, 0.3);
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

	.continue-button:hover {
		box-shadow: 0 0 30px rgba(34, 211, 238, 0.6);
		transform: scale(1.02);
	}

	.continue-button:active {
		transform: scale(0.98);
	}

	@keyframes flipAndEnlarge {
		0% {
			transform: translate(-50%, -50%) perspective(1000px) rotateY(0deg) scale(1);
		}
		50% {
			transform: translate(-50%, -50%) perspective(1000px) rotateY(90deg) scale(1.2);
		}
		100% {
			transform: translate(-50%, -50%) perspective(1000px) rotateY(0deg) scale(1);
		}
	}
</style>
