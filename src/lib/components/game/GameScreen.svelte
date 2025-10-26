<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { GuessCategory } from '$lib/types';
	import { tracklist, currentRound, nextRound as nextRoundFn, resetGame } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import InGameSettings from '../ui/InGameSettings.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import { _ } from 'svelte-i18n';

	interface Props {
		onHome?: () => void;
	}

	let { onHome = () => {} }: Props = $props();

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);
	const isGameOver = $derived($currentRound.currentTrackIndex >= $tracklist.length);

	let audioProgress = $state(0); // 0-1
	let progressInterval: number | null = null;
	let hasSpunOnce = $state(false); // Track if wheel has been spun in this round
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);

	onMount(() => {
		// Load first track
		if (currentTrack) {
			deezerPlayer.load(currentTrack.part.deezer);
		}

		// Add beforeunload listener to warn when navigating away
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = ''; // Modern browsers ignore custom messages
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	onDestroy(() => {
		// Cleanup
		if (progressInterval) clearInterval(progressInterval);
		deezerPlayer.destroy();
	});

	function handleCategorySelected(category: GuessCategory) {
		currentRound.update((state) => ({
			...state,
			category
		}));
	}

	function handleSpinStart() {
		currentRound.update((state) => ({
			...state,
			isSpinning: true
		}));
		hasSpunOnce = true; // Mark that wheel has been spun
	}

	function handleSpinEnd() {
		currentRound.update((state) => ({
			...state,
			isSpinning: false
		}));
	}

	async function handlePlay() {
		if (!currentTrack) return;

		await deezerPlayer.play();
		currentRound.update((state) => ({
			...state,
			isPlaying: true,
			playbackEnded: false
		}));

		// Start tracking progress
		startProgressTracking();
	}

	function handleStop() {
		deezerPlayer.pause();
		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: true
		}));

		stopProgressTracking();
	}

	function handleReveal() {
		currentRound.update((state) => ({
			...state,
			isRevealed: true
		}));
	}

	async function handleReplay() {
		// Restart playback from beginning
		deezerPlayer.seek(0);
		await deezerPlayer.play();

		currentRound.update((state) => ({
			...state,
			isPlaying: true,
			playbackEnded: false
		}));

		startProgressTracking();
	}

	async function handleNextRound() {
		// Stop current playback
		deezerPlayer.pause();
		stopProgressTracking();

		// Reset hasSpunOnce for new round
		hasSpunOnce = false;

		// Move to next round
		nextRoundFn();

		// Load next track
		const nextTrack = $tracklist[$currentRound.currentTrackIndex];
		if (nextTrack) {
			await deezerPlayer.load(nextTrack.part.deezer);
		}
	}

	function startProgressTracking() {
		stopProgressTracking(); // Clear any existing interval

		progressInterval = window.setInterval(() => {
			const current = deezerPlayer.getCurrentTime();
			const duration = deezerPlayer.getDuration();

			if (duration > 0) {
				audioProgress = current / duration;

				// Check if playback ended
				if (current >= duration - 0.1 || !deezerPlayer.isPlaying()) {
					currentRound.update((state) => ({
						...state,
						isPlaying: false,
						playbackEnded: true
					}));
					stopProgressTracking();
				}
			}
		}, 100); // Update every 100ms
	}

	function stopProgressTracking() {
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
		audioProgress = 0;
	}

	function handleHomeClick() {
		showQuitDialog = true;
	}

	function handleConfirmQuit() {
		showQuitDialog = false;
		resetGame();
		onHome();
	}

	function handleCancelQuit() {
		showQuitDialog = false;
	}
</script>

<div class="relative min-h-screen w-full overflow-hidden text-white">
	<!-- Header -->
	<div class="absolute top-0 right-0 left-0 z-20 flex items-center justify-between p-6">
		<button
			type="button"
			onclick={handleHomeClick}
			class="font-streamster text-4xl text-cyan-400 transition-all select-none hover:scale-105 hover:text-cyan-300 active:scale-95"
			style="filter: drop-shadow(0 0 10px rgba(0, 246, 255, 0.7));"
		>
			{$_('app.title')}
		</button>

		<!-- Settings Button -->
		<button
			type="button"
			onclick={() => (showInGameSettings = true)}
			class="flex items-center gap-2 rounded-lg bg-gray-800/80 px-4 py-2 text-cyan-400 backdrop-blur-sm
                 transition-colors hover:bg-gray-700/80"
		>
			<SettingsIcon class="h-5 w-5" />
		</button>
	</div>

	<!-- Round Indicator - Bottom Left -->
	<div class="absolute bottom-6 left-6 z-20 select-none">
		<p class="text-3xl font-bold text-cyan-400">
			{$currentRound.currentTrackIndex + 1}/{$tracklist.length}
		</p>
	</div>

	<!-- Game Over Screen -->
	{#if isGameOver}
		<div class="flex h-screen items-center justify-center">
			<div class="text-center">
				<h1
					class="mb-8 bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-6xl font-bold text-transparent"
				>
					{$_('game.gameOver')}
				</h1>
				<p class="mb-8 text-2xl text-gray-300">
					You completed all {$tracklist.length} rounds!
				</p>
				<button
					type="button"
					onclick={onHome}
					class="rounded-xl bg-linear-to-r from-cyan-500 to-purple-600 px-12 py-4 text-xl font-bold text-white
                         shadow-[0_0_30px_rgba(34,211,238,0.4)]
                         transition-all
                         hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95"
				>
					{$_('game.home')}
				</button>
			</div>
		</div>
	{:else if currentTrack}
		<!-- Main Game Area -->
		<div class="flex h-screen items-center justify-center">
			<!-- Spinning Wheel (fills screen) -->
			<SpinningWheel
				currentRoundIndex={$currentRound.currentTrackIndex}
				onCategorySelected={handleCategorySelected}
				onSpinStart={handleSpinStart}
				onSpinEnd={handleSpinEnd}
			/>

			<!-- Player Control (overlaid on wheel center) -->
			<PlayerControl
				visible={hasSpunOnce && !$currentRound.isSpinning}
				isPlaying={$currentRound.isPlaying}
				playbackEnded={$currentRound.playbackEnded}
				isRevealed={$currentRound.isRevealed}
				progress={audioProgress}
				track={currentTrack}
				onPlay={handlePlay}
				onStop={handleStop}
				onReveal={handleReveal}
				onReplay={handleReplay}
				onNext={handleNextRound}
			/>
		</div>

		<!-- Category Display (shown briefly when wheel stops) -->
		{#if $currentRound.category && !$currentRound.isRevealed && !$currentRound.isSpinning}
			<div
				class="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-2xl border-2 border-cyan-400 bg-gray-900/90 px-8 py-4 backdrop-blur-sm"
			>
				<p class="mb-1 text-sm font-semibold tracking-wider text-cyan-400 uppercase">
					{$_('game.guessCategory', {
						values: { category: $_(`game.categories.${$currentRound.category}`) }
					})}
				</p>
			</div>
		{/if}
	{/if}
</div>

<!-- In-Game Settings Popup -->
<InGameSettings visible={showInGameSettings} onClose={() => (showInGameSettings = false)} />

<!-- Quit Confirmation Dialog -->
<Dialog
	visible={showQuitDialog}
	title={$_('quitDialog.title')}
	message={$_('quitDialog.message')}
	confirmText={$_('quitDialog.confirm')}
	cancelText={$_('quitDialog.cancel')}
	onConfirm={handleConfirmQuit}
	onCancel={handleCancelQuit}
/>
