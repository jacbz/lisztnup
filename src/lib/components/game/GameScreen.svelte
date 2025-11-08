<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import type { TracklistGenerator } from '$lib/services';
	import type { Player, GameMode, Track, GuessCategory } from '$lib/types';
	import {
		gameSession,
		currentRound,
		tracklist,
		nextRound as nextRoundFn,
		resetGame,
		toast
	} from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import ScoringScreen from '../ui/screens/ScoringScreen.svelte';
	import StatsScreen from '../ui/screens/StatsScreen.svelte';
	import EndGameScreen from '../ui/screens/EndGameScreen.svelte';
	import InGameSettings from '../ui/gameplay/InGameSettings.svelte';
	import Dialog from '../ui/primitives/Dialog.svelte';
	import TrackInfo from '../ui/gameplay/TrackInfo.svelte';
	import Popup from '../ui/primitives/Popup.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';

	// Context for sharing functions with child components
	import { GAME_SCREEN_CONTEXT } from './context';
	import { ALL_CATEGORIES, CATEGORY_POINTS } from '$lib/types/game';

	interface GameScreenContext {
		playTrack: () => Promise<void>;
		stopTrack: () => void;
		replayTrack: () => Promise<void>;
		revealTrack: () => void;
		nextRound: () => Promise<void>;
		handlePlaybackEnd: () => void;
		audioProgress: import('svelte/store').Readable<number>;
		onHome: () => void;
		activeCategories: readonly GuessCategory[];
		disabledCategories: readonly GuessCategory[];
		enableScoring: boolean;
		hasValidYears: boolean;
	}

	interface Props {
		generator: TracklistGenerator;
		numberOfTracks: number;
		mode: GameMode;
		players: Player[];
		isSoloMode: boolean;
		enableScoring?: boolean;
		ignoreTrackLength?: boolean;
		onHome?: () => void;
		children?: import('svelte').Snippet;
	}

	let {
		generator,
		numberOfTracks,
		mode,
		players,
		isSoloMode,
		enableScoring = true,
		ignoreTrackLength = false,
		onHome = () => {},
		children
	}: Props = $props();

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);
	const isGameOver = $derived(
		mode === 'bingo' ? false : $currentRound.currentTrackIndex >= numberOfTracks
	);
	const sortedPlayers = $derived([...$gameSession.players].sort((a, b) => b.score - a.score));
	const activeCategories = $derived(
		ALL_CATEGORIES.filter((cat) => !generator.getDisabledCategories().includes(cat)).sort(
			(a, b) => CATEGORY_POINTS[b] - CATEGORY_POINTS[a]
		)
	);
	const disabledCategories = $derived(generator.getDisabledCategories());

	// Check if current track has valid year data for era/decade categories
	const hasValidYears = $derived(
		currentTrack != null &&
			(currentTrack.work.begin_year != null || currentTrack.work.end_year != null)
	);

	const audioProgressStore = deezerPlayer.getProgressStore();
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

		// Set up playback end callback
		deezerPlayer.setOnPlaybackEnd(handlePlaybackEnd);

		// Add beforeunload listener
		const handleBeforeUnload = (e: BeforeUnloadEvent) => {
			e.preventDefault();
			e.returnValue = '';
		};
		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			deezerPlayer.destroy();
		};
	});

	onDestroy(() => {
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
		while (true) {
			const track = sampleNextTrack();
			if (!track) {
				toast.show('error', 'No more tracks available to sample');
				return;
			}

			try {
				await deezerPlayer.load(track.part.deezer, ignoreTrackLength);
				preloadedTrackIndex = $currentRound.currentTrackIndex;
				return;
			} catch (error) {
				console.warn('Track preview unavailable, sampling another:', error);
				tracklist.update((t) => t.slice(0, -1));
			}
		}
	}

	// Shared audio control functions
	async function playTrack(): Promise<void> {
		try {
			await deezerPlayer.play();

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false
			}));
		} catch (error) {
			console.error('Error playing track:', error);
			toast.show('error', 'Failed to play track.');
		}
	}

	function stopTrack(): void {
		deezerPlayer.pause();
		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: true
		}));
	}

	async function replayTrack(): Promise<void> {
		try {
			await deezerPlayer.seek(0);
			await deezerPlayer.play();

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false,
				isRevealed: false
			}));
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.show('error', 'Failed to replay track.');
		}
	}

	function revealTrack(): void {
		currentRound.update((state) => ({
			...state,
			isRevealed: true
		}));

		// Show scoring screen only if scoring is enabled
		if (enableScoring) {
			showScoringScreen = true;
		}
	}

	async function nextRound(): Promise<void> {
		deezerPlayer.pause();

		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: false,
			isRevealed: false
		}));

		// Check if this is the last track and show end game screen (skip for bingo mode)
		if (mode !== 'bingo' && $currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
			return;
		}

		nextRoundFn();

		// Preload next track if needed
		if ($currentRound.currentTrackIndex >= $tracklist.length) {
			await sampleAndPreloadTrack();
		}
	}

	function handleScoreSubmit(scores: Record<string, number>): void {
		gameSession.recordRound($currentRound.currentTrackIndex, scores);
		showScoringScreen = false;

		// Check if game should end (skip for bingo mode)
		if (mode !== 'bingo' && $currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			nextRound();
		}
	}

	function handlePlaybackEnd(): void {
		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: true
		}));
	}

	function handleShowStats(): void {
		showStatsScreen = true;
	}

	function handlePlayAgain(): void {
		showEndGameScreen = false;
		resetGame();
		gameSession.startSession(mode, players, isSoloMode);
		sampleAndPreloadTrack();
	}

	function handleHome(): void {
		resetGame();
		gameSession.reset();
		onHome();
	}

	function handleHomeClick(): void {
		showQuitDialog = true;
	}

	function handleConfirmQuit(): void {
		showQuitDialog = false;
		handleHome();
	}

	// Set context for child components synchronously so children can call getContext
	setContext(GAME_SCREEN_CONTEXT, {
		playTrack,
		stopTrack,
		replayTrack,
		revealTrack,
		nextRound,
		handlePlaybackEnd,
		audioProgress: audioProgressStore,
		onHome: handleHome,
		get activeCategories() {
			return activeCategories;
		},
		get disabledCategories() {
			return disabledCategories;
		},
		get hasValidYears() {
			return hasValidYears;
		},
		enableScoring
	});
</script>

<div class="fixed inset-0 overflow-hidden text-white">
	<!-- Header -->
	<div class="absolute top-0 right-0 left-0 z-20 flex items-center justify-between p-6">
		<button
			type="button"
			onclick={handleHomeClick}
			class="pr-4 font-streamster text-4xl text-cyan-400 transition-all select-none hover:scale-105 hover:text-cyan-300 active:scale-95"
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
	{#if !isGameOver && mode !== 'bingo'}
		<div class="absolute bottom-6 left-6 z-20 select-none">
			<p class="text-3xl font-bold text-cyan-400">
				{$currentRound.currentTrackIndex + 1}/{numberOfTracks}
			</p>
		</div>
	{/if}

	<!-- Main Game Area - Slot for mode-specific content -->
	{@render children?.()}

	<!-- Game Over Screen - Slot for mode-specific game over content -->
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
	{/if}

	<!-- Stats Button (for multiplayer modes with scoring) -->
	{#if !isSoloMode && !isGameOver && !showScoringScreen && enableScoring}
		<div class="fixed right-6 bottom-6 z-10 flex flex-col items-end gap-3">
			<!-- Game Summary -->
			<div
				class="flex min-w-[180px] flex-col gap-2 rounded-xl border-2 border-gray-700 bg-gray-800 px-4 py-3"
			>
				{#each sortedPlayers as player}
					<div class="flex items-center gap-2">
						<div class="h-2.5 w-2.5 rounded-full" style="background-color: {player.color};"></div>
						<span class="flex-1 text-sm font-medium text-gray-300">{player.name}</span>
						<span class="text-sm font-bold text-cyan-400"
							>{$_('scoring.pts', { values: { points: player.score } })}</span
						>
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

	<!-- Solo Mode Score Display (for Classic mode) -->
	{#if isSoloMode && !isGameOver && enableScoring && $gameSession.players.length > 0}
		<div class="absolute right-6 bottom-6 z-20 select-none">
			<div
				class="rounded-xl border-2 border-cyan-400 bg-gray-900 px-4 py-2 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
			>
				<p class="text-sm font-semibold text-gray-400">Score</p>
				<p class="text-right text-3xl font-bold text-cyan-400">{$gameSession.players[0].score}</p>
			</div>
		</div>
	{/if}
</div>

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
	mode={mode === 'bingo' ? 'classic' : mode}
	track={currentTrack}
	players={$gameSession.players}
	{isSoloMode}
	categories={activeCategories}
	onScore={handleScoreSubmit}
/>

<!-- Track Info Popup (when scoring is disabled, except for buzzer mode which handles its own) -->
<Popup visible={$currentRound.isRevealed && !enableScoring && mode !== 'buzzer'} onClose={() => {}}>
	{#snippet children()}
		<div
			class="w-[420px] max-w-[90vw] rounded-3xl border-2 border-cyan-400 bg-gray-900 p-8 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<div class="flex flex-col gap-5">
				<TrackInfo track={currentTrack} />

				<!-- Continue button -->
				<button
					type="button"
					onclick={() => nextRound()}
					class="mt-2 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3 font-bold text-cyan-400 transition-all duration-200 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]"
				>
					{$_('game.nextRound')}
					<ArrowRight class="h-5 w-5" />
				</button>
			</div>
		</div>
	{/snippet}
</Popup>

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
	{mode}
	{enableScoring}
	onPlayAgain={handlePlayAgain}
	onViewStats={() => (showStatsScreen = true)}
	onHome={handleHome}
/>
