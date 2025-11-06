<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { TracklistGenerator } from '$lib/services';
	import type { Player, GuessCategory } from '$lib/types';
	import { BUZZER_TIME_LIMITS, CATEGORY_POINTS } from '$lib/types';
	import {
		gameSession,
		currentRound,
		tracklist,
		nextRound as nextRoundFn,
		resetGame,
		toast
	} from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import ScoringScreen from '../ui/ScoringScreen.svelte';
	import StatsScreen from '../ui/StatsScreen.svelte';
	import EndGameScreen from '../ui/EndGameScreen.svelte';
	import InGameSettings from '../ui/InGameSettings.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Popup from '../ui/Popup.svelte';
	import TrackInfo from '../ui/TrackInfo.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';

	interface Props {
		generator: TracklistGenerator;
		numberOfTracks: number;
		players: Player[];
		enableScoring?: boolean;
		onHome?: () => void;
	}

	let {
		generator,
		numberOfTracks,
		players,
		enableScoring = true,
		onHome = () => {}
	}: Props = $props();

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);
	const isGameOver = $derived($currentRound.currentTrackIndex >= numberOfTracks);
	const sortedPlayers = $derived([...$gameSession.players].sort((a, b) => b.score - a.score));

	let playbackTime = $state(0); // Current playback time in seconds
	let hasStartedPlaying = $state(false);
	let isBuzzerPressed = $state(false);
	let showReveal = $state(false); // Intermediate state after buzzer press
	let preloadedTrackIndex = $state(-1);
	let progressInterval: number | null = null;

	// Audio element for buzzer sound
	let buzzerAudio: HTMLAudioElement | null = null;

	let showScoringScreen = $state(false);
	let showStatsScreen = $state(false);
	let showEndGameScreen = $state(false);
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);

	// Determine current category based on time
	const currentCategory = $derived.by((): GuessCategory => {
		if (playbackTime < BUZZER_TIME_LIMITS.composition) {
			return 'composition';
		} else if (playbackTime < BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer) {
			return 'composer';
		} else {
			return 'decade';
		}
	});

	// Time remaining for current category
	const timeRemaining = $derived.by((): number => {
		if (playbackTime < BUZZER_TIME_LIMITS.composition) {
			return BUZZER_TIME_LIMITS.composition - playbackTime;
		} else if (playbackTime < BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer) {
			return BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer - playbackTime;
		} else {
			const total =
				BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer + BUZZER_TIME_LIMITS.decade;
			return total - playbackTime;
		}
	});

	// Start game session on mount
	onMount(() => {
		gameSession.startSession('buzzer', players, false);
		sampleAndPreloadTrack();

		// Create buzzer audio element
		buzzerAudio = new Audio('/buzzer.mp3');

		// Add beforeunload listener
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
		};
	});

	onDestroy(() => {
		if (progressInterval) clearInterval(progressInterval);
		deezerPlayer.destroy();
	});

	function sampleNextTrack() {
		const track = generator.sample();
		if (track) {
			tracklist.update((t) => [...t, track]);
		}
		return track;
	}

	async function sampleAndPreloadTrack(): Promise<void> {
		while (true) {
			const track = sampleNextTrack();
			if (!track) {
				console.error('No more tracks available to sample');
				return;
			}

			try {
				await deezerPlayer.load(track.part.deezer, true); // true = ignore track length setting
				preloadedTrackIndex = $currentRound.currentTrackIndex;
				return;
			} catch (error) {
				console.warn('Track preview unavailable, sampling another:', error);
				tracklist.update((t) => t.slice(0, -1));
			}
		}
	}

	async function handleBuzzerPress() {
		if (!hasStartedPlaying) {
			// Start playback on first press
			try {
				await deezerPlayer.play();
				hasStartedPlaying = true;
				startProgressTracking();
			} catch (error) {
				console.error('Error playing track:', error);
				toast.show('error', 'Failed to play track.');
			}
		} else if (!isBuzzerPressed) {
			// Buzzer pressed during playback - pause and show reveal button
			// Play buzzer sound
			if (buzzerAudio) {
				buzzerAudio.currentTime = 0;
				buzzerAudio.play().catch((err) => console.warn('Failed to play buzzer sound:', err));
			}

			deezerPlayer.pause();
			stopProgressTracking();
			isBuzzerPressed = true;
			showReveal = true;

			// Set the current category in the round state
			currentRound.update((state) => ({
				...state,
				category: currentCategory
			}));
		}
	}

	function handleReveal() {
		currentRound.update((state) => ({
			...state,
			isRevealed: true
		}));
		showReveal = false;

		// Show scoring screen only if scoring is enabled
		if (enableScoring) {
			showScoringScreen = true;
		}
	}

	function handleNext() {
		// Check if this is the last track
		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			handleNextRound();
		}
	}

	function handleScoreSubmit(scores: Record<string, number>) {
		gameSession.recordRound($currentRound.currentTrackIndex, scores);
		showScoringScreen = false;

		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			handleNextRound();
		}
	}

	async function handleNextRound() {
		deezerPlayer.pause();
		stopProgressTracking();

		// Reset state for next round
		hasStartedPlaying = false;
		isBuzzerPressed = false;
		showReveal = false;
		playbackTime = 0;

		nextRoundFn();

		if ($currentRound.currentTrackIndex >= $tracklist.length) {
			await sampleAndPreloadTrack();
		}
	}

	function startProgressTracking() {
		stopProgressTracking();

		progressInterval = window.setInterval(() => {
			const current = deezerPlayer.getCurrentTime();
			playbackTime = current;

			// Check if we've reached the end of buzzer time
			const maxTime =
				BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer + BUZZER_TIME_LIMITS.decade;

			if (current >= maxTime || !deezerPlayer.isPlaying()) {
				// Time's up - auto-buzz and show reveal
				deezerPlayer.pause();
				stopProgressTracking();
				isBuzzerPressed = true;
				showReveal = true;

				currentRound.update((state) => ({
					...state,
					category: currentCategory
				}));
			}
		}, 100);
	}

	function stopProgressTracking() {
		if (progressInterval) {
			clearInterval(progressInterval);
			progressInterval = null;
		}
	}

	function handleShowStats() {
		showStatsScreen = true;
	}

	function handlePlayAgain() {
		showEndGameScreen = false;
		resetGame();
		gameSession.startSession('buzzer', players, false);
	}

	function handleHome() {
		resetGame();
		gameSession.reset();
		onHome();
	}

	function handleHomeClick() {
		showQuitDialog = true;
	}

	function handleConfirmQuit() {
		showQuitDialog = false;
		handleHome();
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

	<!-- Round Indicator -->
	{#if !isGameOver}
		<div class="absolute bottom-6 left-6 z-20 select-none">
			<p class="text-3xl font-bold text-cyan-400">
				{$currentRound.currentTrackIndex + 1}/{numberOfTracks}
			</p>
		</div>
	{/if}

	<!-- Main Game Area -->
	{#if !isGameOver && currentTrack}
		<div class="flex h-screen flex-col items-center justify-center">
			<!-- Buzzer Button (always centered) with floating countdown -->
			<div class="relative z-50 flex items-center justify-center">
				<!-- Category & Time Display (floating above buzzer) -->
				{#if hasStartedPlaying && !isBuzzerPressed}
					{@const categoryDef = getCategoryDefinition(currentCategory)}
					<div
						class="absolute -top-24 left-1/2 flex max-w-[90vw] -translate-x-1/2 flex-col items-center gap-3 rounded-[20px] border-[3px] bg-gray-900 px-6 py-3 shadow-[0_0_40px] md:-top-28 md:flex-row md:gap-6 md:px-8"
						style="border-color: {categoryDef?.color2 ||
							'#22d3ee'}; box-shadow: 0 0 40px {categoryDef?.glowColor || 'rgba(34,211,238,0.4)'};"
					>
						<div
							class="text-xl font-bold tracking-wider uppercase md:text-2xl"
							style="color: {categoryDef?.color1 || '#22d3ee'};"
						>
							{$_(`game.categories.${currentCategory}`)}
						</div>
						<div
							class="text-base font-semibold text-nowrap md:text-lg"
							style="color: {categoryDef?.color2 || '#a855f7'};"
						>
							+{CATEGORY_POINTS[currentCategory]} pts
						</div>
						<div class="min-w-[60px] text-center text-4xl font-bold text-white md:text-5xl">
							{Math.ceil(timeRemaining)}
						</div>
					</div>
				{/if}

				<button
					type="button"
					class="relative z-100 flex h-64 w-64 max-w-[80vw] cursor-pointer items-center justify-center rounded-full border-8 border-red-700 bg-red-600 shadow-[0_10px_40px_rgba(220,38,38,0.6)] transition-all duration-200 hover:scale-105 hover:shadow-[0_15px_50px_rgba(220,38,38,0.8)] active:scale-95 active:shadow-[0_5px_30px_rgba(220,38,38,0.6)] disabled:cursor-not-allowed disabled:opacity-50 md:h-[300px] md:w-[300px]"
					onclick={showReveal ? handleReveal : handleBuzzerPress}
					disabled={isBuzzerPressed && !showReveal}
				>
					{#if showReveal}
						<span
							class="text-[32px] font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
							>REVEAL</span
						>
					{:else if !hasStartedPlaying}
						<span
							class="text-[32px] font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
							>PRESS TO START</span
						>
					{:else}
						<span
							class="text-[32px] font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
							>BUZZ!</span
						>
					{/if}
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Stats Summary & Button -->
{#if !isGameOver && !showScoringScreen}
	<div class="fixed right-6 bottom-6 z-30 flex flex-col items-end gap-3">
		<!-- Game Summary -->
		<div
			class="flex min-w-[180px] flex-col gap-2 rounded-xl border-2 border-gray-700 bg-gray-800/95 px-4 py-3 backdrop-blur-sm"
		>
			{#each sortedPlayers as player}
				<div class="flex items-center gap-2">
					<div class="h-2.5 w-2.5 rounded-full" style="background-color: {player.color};"></div>
					<span class="flex-1 text-sm font-medium text-gray-300">{player.name}</span>
					<span class="text-sm font-bold text-cyan-400">{player.score}pts</span>
				</div>
			{/each}
		</div>

		<!-- Stats Button -->
		<button
			type="button"
			onclick={handleShowStats}
			class="flex cursor-pointer items-center justify-center rounded-full border-2 border-cyan-400 bg-gray-900 p-3.5 text-cyan-400 shadow-[0_4px_20px_rgba(34,211,238,0.4)] transition-all duration-200 hover:scale-110 hover:shadow-[0_6px_30px_rgba(34,211,238,0.6)]"
			aria-label="View statistics"
		>
			<BarChart class="h-6 w-6" />
		</button>
	</div>
{/if}

<!-- In-Game Settings -->
<InGameSettings visible={showInGameSettings} onClose={() => (showInGameSettings = false)} />

<!-- Quit Dialog -->
<Dialog
	visible={showQuitDialog}
	title={$_('quitDialog.title')}
	message={$_('quitDialog.message')}
	confirmText={$_('quitDialog.confirm')}
	cancelText={$_('quitDialog.cancel')}
	onConfirm={handleConfirmQuit}
	onCancel={() => (showQuitDialog = false)}
/>

<!-- Track Info Popup (when scoring is disabled) -->
<Popup visible={$currentRound.isRevealed && !enableScoring} onClose={() => {}}>
	{#snippet children()}
		<div
			class="w-[420px] max-w-[90vw] rounded-3xl border-2 border-cyan-400 bg-gray-900 p-8 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<div class="flex flex-col gap-5">
				<TrackInfo track={currentTrack} />

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

<!-- Scoring Screen -->
<ScoringScreen
	visible={showScoringScreen}
	mode="buzzer"
	track={currentTrack}
	players={$gameSession.players}
	{currentCategory}
	onScore={handleScoreSubmit}
/>

<!-- Stats Screen -->
<StatsScreen
	visible={showStatsScreen}
	players={$gameSession.players}
	rounds={$gameSession.rounds}
	onClose={() => (showStatsScreen = false)}
/>

<!-- End Game Screen -->
<EndGameScreen
	visible={showEndGameScreen}
	players={$gameSession.players}
	isSoloMode={false}
	mode="buzzer"
	onPlayAgain={handlePlayAgain}
	onViewStats={() => (showStatsScreen = true)}
	onHome={handleHome}
/>
