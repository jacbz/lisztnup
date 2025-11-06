<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { GuessCategory, Track } from '$lib/types';
	import type { TracklistGenerator } from '$lib/services';
	import { tracklist, currentRound, nextRound as nextRoundFn, resetGame, toast } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import InGameSettings from '../ui/InGameSettings.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import EdgeDisplay from '../ui/EdgeDisplay.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';

	interface Props {
		generator: TracklistGenerator;
		numberOfTracks: number;
		onHome?: () => void;
		onRevealComplete?: () => void;
		hideSpinWheel?: boolean;
	}

	let {
		generator,
		numberOfTracks,
		onHome = () => {},
		onRevealComplete = () => {},
		hideSpinWheel = false
	}: Props = $props();

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);
	const isGameOver = $derived($currentRound.currentTrackIndex >= numberOfTracks);
	const disabledCategories = $derived(generator.getDisabledCategories());

	let audioProgress = $state(0); // 0-1
	let progressInterval: number | null = null;
	let hasSpunOnce = $state(false); // Track if wheel has been spun in this round
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);
	let preloadedTrackIndex = $state(-1); // Index of the preloaded track

	onMount(() => {
		// Sample and preload first track
		sampleAndPreloadTrack();

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

	function sampleNextTrack(): Track | null {
		const track = generator.sample();
		if (track) {
			tracklist.update((t) => [...t, track]);
		}
		return track;
	}

	async function sampleAndPreloadTrack(): Promise<void> {
		// Keep sampling until we get a track with a valid preview
		while (true) {
			const track = sampleNextTrack();

			if (!track) {
				// No more tracks available
				console.error('No more tracks available to sample');
				return;
			}

			try {
				await deezerPlayer.load(track.part.deezer);
				preloadedTrackIndex = $currentRound.currentTrackIndex;
				// Successfully loaded, exit loop
				return;
			} catch (error) {
				// Track has no preview or failed to load - silently remove and try again
				console.warn('Track preview unavailable, sampling another:', error);
				tracklist.update((t) => t.slice(0, -1));
				// Continue loop to sample next track
			}
		}
	}

	async function handleCategorySelected(category: GuessCategory) {
		// Check if category requires year data and current track has valid years
		if ((category === 'era' || category === 'decade') && currentTrack) {
			const hasValidYears =
				currentTrack.work.begin_year != null || currentTrack.work.end_year != null;

			if (!hasValidYears) {
				// Current track doesn't have year data, need to sample a new one
				console.warn('Track missing year data for category:', category, currentTrack);

				// Remove the invalid track from the tracklist
				tracklist.update((t) => t.slice(0, -1));

				// Sample and preload a new track
				await sampleAndPreloadTrack();

				// The category will be set after the new track is loaded
				// We need to recursively call this function with the new track
				await handleCategorySelected(category);
				return;
			}
		}

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

	async function handleSpinEnd() {
		currentRound.update((state) => ({
			...state,
			isSpinning: false
		}));
	}

	async function handlePlay() {
		if (!currentTrack) return;

		try {
			// Track should already be preloaded, just play it
			await deezerPlayer.play();
			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false
			}));

			// Start tracking progress
			startProgressTracking();
		} catch (error) {
			console.error('Error playing track:', error);
			toast.show('error', 'Failed to play track.');
		}
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

		// Call the callback after revealing
		onRevealComplete();
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

		// Sample and preload next track
		if ($currentRound.currentTrackIndex >= $tracklist.length) {
			await sampleAndPreloadTrack();
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

<div class="fixed inset-0 overflow-hidden text-white">
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

	<!-- Game Over Screen -->
	{#if isGameOver}
		<div class="flex h-screen items-center justify-center">
			<div class="text-center">
				<h1 class="mb-8 text-6xl font-bold text-cyan-400">
					{$_('game.gameOver')}
				</h1>
				<p class="mb-8 text-2xl text-gray-300">
					You completed all {numberOfTracks} rounds!
				</p>
				<button
					type="button"
					onclick={handleConfirmQuit}
					class="rounded-xl border-2 border-cyan-400 bg-gray-900 px-12 py-4 text-xl font-bold text-white
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
			<!-- Spinning Wheel (fills screen) - only in Bingo mode -->
			{#if !hideSpinWheel}
				<SpinningWheel
					currentRoundIndex={$currentRound.currentTrackIndex}
					{disabledCategories}
					onCategorySelected={handleCategorySelected}
					onSpinStart={handleSpinStart}
					onSpinEnd={handleSpinEnd}
				/>
			{/if}

			<!-- Player Control (overlaid on wheel center) -->
			<PlayerControl
				visible={hasSpunOnce && !$currentRound.isSpinning}
				isPlaying={$currentRound.isPlaying}
				playbackEnded={$currentRound.playbackEnded}
				isRevealed={$currentRound.isRevealed}
				progress={audioProgress}
				track={currentTrack}
				isBingoMode={true}
				onPlay={handlePlay}
				onStop={handleStop}
				onReveal={handleReveal}
				onReplay={handleReplay}
				onNext={handleNextRound}
			/>
		</div>

		<!-- Category Display (shown briefly when wheel stops) -->
		<EdgeDisplay
			visible={!!($currentRound.category && !$currentRound.isRevealed && !$currentRound.isSpinning)}
			hideTop={true}
		>
			{#snippet children()}
				{@const categoryDef = getCategoryDefinition($currentRound.category!)}
				{#if categoryDef}
					<div
						class="rounded-2xl border-4 px-10 py-2 backdrop-blur-md"
						style="background: linear-gradient(135deg, {categoryDef.color1}, {categoryDef.color2}); 
							   border-color: {categoryDef.color2};
							   box-shadow: 0 0 40px {categoryDef.glowColor};"
					>
						<p class="text-2xl font-bold tracking-wider text-white uppercase drop-shadow-lg">
							{$_('game.guessCategory', {
								values: { category: $_(`game.categories.${$currentRound.category}`) }
							})}
						</p>
					</div>
				{/if}
			{/snippet}
		</EdgeDisplay>
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
