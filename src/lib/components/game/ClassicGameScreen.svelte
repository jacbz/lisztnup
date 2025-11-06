<script lang="ts">
	import { onMount } from 'svelte';
	import type { TracklistGenerator } from '$lib/services';
	import type { Player, GameMode, Track } from '$lib/types';
	import { CATEGORY_POINTS } from '$lib/types';
	import {
		gameSession,
		currentRound,
		tracklist,
		nextRound as nextRoundFn,
		resetGame,
		toast
	} from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import { getCategoryDefinition } from '$lib/data/categories';
	import ScoringScreen from '../ui/ScoringScreen.svelte';
	import StatsScreen from '../ui/StatsScreen.svelte';
	import EndGameScreen from '../ui/EndGameScreen.svelte';
	import InGameSettings from '../ui/InGameSettings.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import Play from 'lucide-svelte/icons/play';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import { _ } from 'svelte-i18n';

	interface Props {
		generator: TracklistGenerator;
		numberOfTracks: number;
		mode: GameMode;
		players: Player[];
		isSoloMode: boolean;
		enableScoring?: boolean;
		onHome?: () => void;
	}

	let {
		generator,
		numberOfTracks,
		mode,
		players,
		isSoloMode,
		enableScoring = true,
		onHome = () => {}
	}: Props = $props();

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);
	const isGameOver = $derived($currentRound.currentTrackIndex >= numberOfTracks);
	const sortedPlayers = $derived([...$gameSession.players].sort((a, b) => b.score - a.score));

	let audioProgress = $state(0);
	let progressInterval: number | null = null;
	let preloadedTrackIndex = $state(-1);

	let showScoringScreen = $state(false);
	let showStatsScreen = $state(false);
	let showEndGameScreen = $state(false);
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);

	// Start game session on mount
	onMount(() => {
		gameSession.startSession(mode, players, isSoloMode);
		sampleAndPreloadTrack();

		// Add beforeunload listener
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			if (progressInterval) clearInterval(progressInterval);
			deezerPlayer.destroy();
		};
	});

	function sampleNextTrack(): Track | null {
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
				await deezerPlayer.load(track.part.deezer);
				preloadedTrackIndex = $currentRound.currentTrackIndex;
				return;
			} catch (error) {
				console.warn('Track preview unavailable, sampling another:', error);
				tracklist.update((t) => t.slice(0, -1));
			}
		}
	}

	async function handlePlay() {
		try {
			// Reset progress immediately before playing
			audioProgress = 0;

			await deezerPlayer.play();

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false
			}));

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

	async function handleReveal() {
		currentRound.update((state) => ({
			...state,
			isRevealed: true
		}));

		// Show scoring screen only if scoring is enabled
		if (enableScoring) {
			showScoringScreen = true;
		}
	}

	async function handleReplay() {
		try {
			// Reset progress before replaying
			audioProgress = 0;

			await deezerPlayer.seek(0);
			await deezerPlayer.play();

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false,
				isRevealed: false
			}));

			startProgressTracking();
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.show('error', 'Failed to replay track.');
		}
	}

	async function handleNext() {
		deezerPlayer.pause();
		stopProgressTracking();

		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: false,
			isRevealed: false
		}));

		// Check if this is the last track and show end game screen
		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
			return;
		}

		nextRoundFn();

		// Preload next track if needed
		if ($currentRound.currentTrackIndex >= $tracklist.length) {
			await sampleAndPreloadTrack();
		}
	}

	function handleScoreSubmit(scores: Record<string, number>) {
		gameSession.recordRound($currentRound.currentTrackIndex, scores);
		showScoringScreen = false;

		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			handleNext();
		}
	}

	function startProgressTracking() {
		stopProgressTracking();

		progressInterval = window.setInterval(() => {
			const current = deezerPlayer.getCurrentTime();
			const duration = deezerPlayer.getDuration();

			if (duration > 0) {
				audioProgress = current / duration;
			}

			if (current >= duration || !deezerPlayer.isPlaying()) {
				currentRound.update((state) => ({
					...state,
					isPlaying: false,
					playbackEnded: true
				}));
				stopProgressTracking();
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
		gameSession.startSession(mode, players, isSoloMode);
		sampleAndPreloadTrack();
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

	const categories = ['composition', 'composer', 'decade', 'era', 'form'] as const;
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

	<!-- Solo Mode Score Display -->
	{#if !isGameOver && isSoloMode && enableScoring && $gameSession.players.length > 0}
		<div class="absolute right-6 bottom-6 z-20 select-none">
			<div
				class="rounded-xl border-2 border-cyan-400 bg-gray-900 px-4 py-2 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
			>
				<p class="text-sm font-semibold text-gray-400">Score</p>
				<p class="text-3xl font-bold text-cyan-400">{$gameSession.players[0].score}</p>
			</div>
		</div>
	{/if}

	<!-- Main Game Area -->
	{#if !isGameOver && currentTrack}
		<div class="flex h-screen items-center justify-center">
			<!-- Floating Legend of Categories (above player button) -->
			<div
				class="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-[300px] rounded-2xl border-2 border-cyan-400 bg-gray-900 px-4 py-3 shadow-[0_0_30px_rgba(34,211,238,0.3)] md:px-6 md:py-4"
			>
				<div class="flex flex-col items-center gap-1.5 md:flex-row md:gap-2">
					{#each categories as category}
						{@const def = getCategoryDefinition(category)}
						{#if def}
							<div
								class="flex w-full items-center justify-between gap-2 rounded-lg border-2 border-transparent px-3 py-1 md:min-w-[100px] md:flex-col md:justify-center md:px-4"
								style="background: linear-gradient(135deg, {def.color1}, {def.color2}); 
								       border-color: {def.color2};"
							>
								<span class="text-sm font-bold text-white md:text-xl"
									>{$_(`game.categories.${category}`)}</span
								>
								<span class="text-sm font-semibold text-white/90 md:text-lg">
									{$_('scoring.points', { values: { points: CATEGORY_POINTS[category] } })}
								</span>
							</div>
						{/if}
					{/each}
				</div>
			</div>

			<!-- Player Control Button (Fixed Center) -->
			<PlayerControl
				visible={!$currentRound.isRevealed}
				isPlaying={$currentRound.isPlaying}
				playbackEnded={$currentRound.playbackEnded}
				isRevealed={$currentRound.isRevealed}
				progress={audioProgress}
				track={currentTrack}
				onPlay={handlePlay}
				onStop={handleStop}
				onReveal={handleReveal}
				onReplay={handleReplay}
				onNext={handleNext}
			/>
		</div>
	{/if}
</div>

<!-- Stats Button (with game summary if not solo) -->
{#if !isSoloMode && !isGameOver && !showScoringScreen && enableScoring}
	<div class="fixed right-6 bottom-6 z-25 flex flex-col items-end gap-3">
		<!-- Game Summary -->
		<div
			class="flex min-w-[180px] flex-col gap-2 rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3"
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
			class="flex cursor-pointer items-center justify-center rounded-full border-2 border-cyan-400 bg-gray-900 p-3.5 text-cyan-400 shadow-[0_4px_20px_rgba(34,211,238,0.4)] transition-all duration-200 hover:scale-110 hover:shadow-[0_6px_30px_rgba(34,211,238,0.6)] active:scale-95"
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

<!-- Scoring Screen -->
<ScoringScreen
	visible={showScoringScreen}
	mode="classic"
	track={currentTrack}
	players={$gameSession.players}
	{isSoloMode}
	onScore={handleScoreSubmit}
/>

<!-- Stats Screen -->
{#if !isSoloMode}
	<StatsScreen
		visible={showStatsScreen}
		players={$gameSession.players}
		rounds={$gameSession.rounds}
		onClose={() => (showStatsScreen = false)}
	/>
{/if}

<!-- End Game Screen -->
<EndGameScreen
	visible={showEndGameScreen}
	players={$gameSession.players}
	{isSoloMode}
	mode="classic"
	onPlayAgain={handlePlayAgain}
	onViewStats={() => (showStatsScreen = true)}
	onHome={handleHome}
/>
