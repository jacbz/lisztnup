<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import type { TracklistGenerator } from '$lib/services';
	import type { Track } from '$lib/models';
	import type { Player, GameMode } from '$lib/types';
	import {
		gameSession,
		currentRound,
		nextRound as nextRoundFn,
		resetGame,
		tracklist,
		toast
	} from '$lib/stores';
	import { deezerPlayer, progress, PlayableTrackBuffer } from '$lib/services';
	import ScoringScreen from '../ui/screens/ScoringScreen.svelte';
	import StatsScreen from '../ui/screens/StatsScreen.svelte';
	import EndGameScreen from '../ui/screens/EndGameScreen.svelte';
	import InGameSettings from '../ui/gameplay/InGameSettings.svelte';
	import NetworkStatusBanner from '../ui/gameplay/NetworkStatusBanner.svelte';
	import Dialog from '../ui/primitives/Dialog.svelte';
	import TrackInfo from '../ui/gameplay/TrackInfo.svelte';
	import Popup from '../ui/primitives/Popup.svelte';
	import Logo from '../ui/primitives/Logo.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _, locale } from 'svelte-i18n';
	import { analytics } from '$lib/game-logger';
	import { settings, selectedTracklist as selectedTracklistStore } from '$lib/stores/settings';
	import { get } from 'svelte/store';

	// Context for sharing functions with child components
	import { GAME_SCREEN_CONTEXT, type GameScreenContext, type RevealOptions } from './context';
	import { ALL_CATEGORIES, CATEGORY_POINTS } from '$lib/types/game';

	interface Props {
		generator: TracklistGenerator;
		numberOfTracks?: number; // Optional for timeline
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
		numberOfTracks = 10,
		mode,
		players,
		isSoloMode,
		enableScoring = true,
		ignoreTrackLength = false,
		onHome = () => {},
		children
	}: Props = $props();

	const maxPlayableTracks = $derived(
		mode === 'classic' || mode === 'buzzer' ? numberOfTracks : null
	);
	// svelte-ignore state_referenced_locally (GameScreen props are fixed for the lifetime of a game instance)
	const playableBuffer = new PlayableTrackBuffer({
		generator,
		maxPlayableTracks,
		targetReadyAhead: 2
	});
	const currentTrack = $derived(playableBuffer.currentTrack);
	const isWaitingForPlayableTrack = $derived(
		!$currentRound.isPlaying &&
			((playableBuffer.isInitialLoading && currentTrack === null) ||
				playableBuffer.isBlockedOnTrack)
	);

	// Timeline and Bingo don't end based on fixed track count
	const isGameOver = $derived(
		mode === 'bingo' || mode === 'timeline'
			? false
			: $currentRound.currentTrackIndex >= numberOfTracks
	);

	const sortedPlayers = $derived([...$gameSession.players].sort((a, b) => b.score - a.score));
	const activeCategories = $derived(
		ALL_CATEGORIES.filter((cat) => !generator.getDisabledCategories().includes(cat)).sort(
			(a, b) => CATEGORY_POINTS[b] - CATEGORY_POINTS[a]
		)
	);
	const disabledCategories = $derived(generator.getDisabledCategories());

	$effect(() => {
		if (playableBuffer.tracksExhausted && !playableBuffer.currentTrack && mode !== 'timeline') {
			showEndGameScreen = true;
		}
	});

	// Check if current track has valid year data for era/decade categories
	const hasValidYears = $derived(
		currentTrack != null &&
			(currentTrack.work.begin_year != null || currentTrack.work.end_year != null)
	);

	let showScoringScreen = $state(false);
	let showStatsScreen = $state(false);
	let showEndGameScreen = $state(false);
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);

	// Options passed by the game mode via revealTrack(options)
	let revealOptions = $state<RevealOptions>({});

	// Stats handler registered by child game modes (e.g. Timeline)
	let childStatsHandler = $state<(() => void) | null>(null);

	// Whether the stats icon should appear in the top-right pill
	const showStatsInPill = $derived(
		childStatsHandler !== null ||
			(mode !== 'timeline' &&
				mode !== 'bingo' &&
				!isSoloMode &&
				!isGameOver &&
				!showScoringScreen &&
				enableScoring)
	);

	// Guard: prevents double-advancement caused by double-tapping Continue
	// during the popup out-transition.
	let isAdvancingRound = false;

	// Start game session on mount
	onMount(() => {
		const currentTracklist = get(selectedTracklistStore);
		const tracklistId = currentTracklist.kind === 'custom' ? 'custom' : currentTracklist.id;
		const currentLocale = get(locale) || 'en';
		let gameInfo: Record<string, unknown> | null = null;

		if (mode === 'timeline') {
			gameInfo = {
				cardsToWin: get(settings).timelineCardsToWin,
				numberOfPlayers: players.length
			};
		} else if (mode === 'buzzer' || mode === 'classic') {
			gameInfo = {
				numberOfTracks,
				numberOfPlayers: players.length
			};
		}

		if (currentTracklist.kind === 'custom') {
			const info = generator.getInfo();
			gameInfo = {
				...gameInfo,
				customTracklist: {
					name: currentTracklist.name,
					description: currentTracklist.description,
					composerCount: info.composers,
					workCount: info.works,
					trackCount: info.tracks
				}
			};
		}

		analytics.startGame(mode, tracklistId, currentLocale, gameInfo);

		gameSession.startSession(mode, players, isSoloMode);

		// Set track length behavior based on mode
		deezerPlayer.setIgnoreTrackLength(ignoreTrackLength);

		playableBuffer.start();

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
			playableBuffer.destroy();
			deezerPlayer.destroy();
		};
	});

	onDestroy(() => {
		// If we are destroying and the session is still active, it means the user quit early
		// or we are capturing the natural end state.
		const state = showEndGameScreen ? 'completed' : 'abandoned';

		if (mode === 'buzzer' || mode === 'classic') {
			analytics.endGame(state, {
				scores: get(gameSession).players.map((p) => p.score),
				numberOfRounds: get(currentRound).currentTrackIndex
			});
		} else if (mode === 'bingo') {
			analytics.endGame(state, {
				numberOfRounds: get(currentRound).currentTrackIndex
			});
		} else {
			// For catch-all for other modes (like Timeline which handles its own stats)
			analytics.endGame(state);
		}
	});

	// Just return a track from the generator without adding to tracklist/loading audio
	// Useful for Timeline deck filling
	function sampleRawTrack(): Track | null {
		return playableBuffer.sampleSilentTrack();
	}

	// Shared audio control functions
	async function playTrack(): Promise<void> {
		try {
			if (isWaitingForPlayableTrack) return;
			const loadedTrack = playableBuffer.currentLoadedTrack;
			if (!loadedTrack) return;
			await deezerPlayer.playLoaded(loadedTrack);

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false
			}));
		} catch (error) {
			console.error('Error playing track:', error);
			toast.error($_('network.playFailed'));
		}
	}

	function stopTrack(): void {
		deezerPlayer.stop();
		currentRound.update((state) => ({
			...state,
			isPlaying: false,
			playbackEnded: true
		}));
	}

	async function replayTrack(): Promise<void> {
		try {
			await deezerPlayer.replay();

			currentRound.update((state) => ({
				...state,
				isPlaying: true,
				playbackEnded: false,
				isRevealed: false
			}));
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.error($_('network.replayFailed'));
		}
	}

	function revealTrack(options?: RevealOptions): void {
		revealOptions = options ?? {};
		currentRound.update((state) => ({
			...state,
			isRevealed: true
		}));

		// Show scoring screen: mode can override via options.showScoring
		const shouldScore = options?.showScoring ?? enableScoring;
		if (shouldScore) {
			showScoringScreen = true;
		}
	}

	async function nextRound(): Promise<void> {
		if (isAdvancingRound) return;
		isAdvancingRound = true;

		try {
			deezerPlayer.stop();

			currentRound.update((state) => ({
				...state,
				isPlaying: false,
				playbackEnded: false,
				isRevealed: false
			}));

			// Check if this is the last track and show end game screen (skip for bingo/timeline)
			if (
				mode !== 'bingo' &&
				mode !== 'timeline' &&
				$currentRound.currentTrackIndex >= numberOfTracks - 1
			) {
				showEndGameScreen = true;
				return;
			}

			const nextTrack = await playableBuffer.advance();
			if (!nextTrack) {
				if (mode === 'timeline') {
					// Timeline observes tracksExhausted through context and owns its end screen.
					return;
				}
				showEndGameScreen = true;
				return;
			}

			nextRoundFn();

			// Log progress after round increment
			if (mode === 'classic' || mode === 'buzzer') {
				analytics.updateProgress({
					scores: get(gameSession).players.map((p) => p.score),
					numberOfRounds: get(currentRound).currentTrackIndex
				});
			} else if (mode === 'bingo') {
				analytics.updateProgress({
					numberOfRounds: get(currentRound).currentTrackIndex
				});
			}

			playableBuffer.ensureFilled();
		} finally {
			isAdvancingRound = false;
		}
	}

	function handleScoreSubmit(scores: Record<string, number>): void {
		gameSession.recordRound($currentRound.currentTrackIndex, scores);
		showScoringScreen = false;
		handleAfterReveal();
	}

	/** Unified continue handler: runs mode-specific cleanup, then advances. */
	function handleAfterReveal(): void {
		const beforeNext = revealOptions.beforeNextRound;
		revealOptions = {};
		beforeNext?.();
		nextRound();
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

	function handleViewStatsFromEndGame(): void {
		showEndGameScreen = false;
		showStatsScreen = true;
	}

	function handleHome(): void {
		deezerPlayer.stop();
		resetGame();
		gameSession.reset();
		onHome();
	}

	/**
	 * Resets exhaustion state and preloads a fresh track at the current
	 * (reset) index. Used by TimelineGameScreen on Play Again.
	 */
	function prepareNewGame(): void {
		isAdvancingRound = false;
		tracklist.set([]);
		playableBuffer.start();
	}

	/**
	 * Manually retry preloading after a network failure.
	 * Resets visible error state and lets the shared buffer continue.
	 */
	function retryPreload(): void {
		playableBuffer.retryVisible();
	}

	function invalidateBufferedTracks(): void {
		playableBuffer.invalidateFutureTracks();
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
		sampleRawTrack,
		prepareNewGame,
		retryPreload,
		invalidateBufferedTracks,
		onHome: handleHome,
		get currentTrack() {
			return currentTrack;
		},
		get audioProgressValue() {
			return $progress;
		},
		get currentTrackDuration() {
			return playableBuffer.currentDuration;
		},
		get activeCategories() {
			return activeCategories;
		},
		get disabledCategories() {
			return disabledCategories;
		},
		get hasValidYears() {
			return hasValidYears;
		},
		get tracksExhausted() {
			return playableBuffer.tracksExhausted;
		},
		get enableScoring() {
			return enableScoring;
		},
		get isPreloading() {
			return isWaitingForPlayableTrack;
		},
		get hasPreloadError() {
			return playableBuffer.hasVisibleError;
		},
		registerStatsHandler(handler: (() => void) | null) {
			childStatsHandler = handler;
		}
	} satisfies GameScreenContext);
</script>

<div class="fixed inset-0 overflow-hidden text-white">
	<!-- Network Status Banner -->
	<NetworkStatusBanner
		isLoading={isWaitingForPlayableTrack}
		hasError={isWaitingForPlayableTrack && playableBuffer.hasVisibleError}
	/>

	<!-- Logo -->
	<div class="absolute top-6 left-6 z-20">
		<Logo onClick={handleHomeClick} size="medium" />
	</div>

	<!-- Top-right pill: Stats (conditional) | Settings -->
	<div class="absolute top-6 right-6 z-20 flex items-center overflow-hidden rounded-lg">
		{#if showStatsInPill}
			<button
				type="button"
				onclick={() => (childStatsHandler ? childStatsHandler() : handleShowStats())}
				class="flex items-center px-2.5 py-1.5 text-cyan-400 transition-all duration-200 hover:text-cyan-300 active:scale-90"
				aria-label="View statistics"
			>
				<BarChart class="h-5 w-5" />
			</button>
			<div class="h-4 w-px bg-slate-600/40"></div>
		{/if}
		<button
			type="button"
			onclick={() => (showInGameSettings = true)}
			class="flex items-center px-2.5 py-1.5 text-cyan-400 transition-all duration-200 hover:text-cyan-300 active:scale-90"
		>
			<SettingsIcon class="h-5 w-5" />
		</button>
	</div>

	<!-- Round Indicator (Standard Modes) -->
	{#if !isGameOver && mode !== 'bingo' && mode !== 'timeline'}
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
				<p class="mb-8 text-2xl text-slate-300">
					You completed all {numberOfTracks} rounds!
				</p>
				<button
					type="button"
					onclick={handleConfirmQuit}
					class="rounded-xl border-2 border-cyan-400 bg-slate-900 px-12 py-4 text-xl font-bold text-white
                         shadow-[0_0_30px_rgba(34,211,238,0.4)]
                         transition-all
                         hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95"
				>
					{$_('game.home')}
				</button>
			</div>
		</div>
	{/if}

	<!-- Game Summary (for multiplayer modes with scoring, not timeline) -->
	{#if !isSoloMode && !isGameOver && !showScoringScreen && enableScoring && mode !== 'timeline'}
		<div
			class="fixed bottom-4 left-1/2 z-10 -translate-x-1/2 md:right-6 md:left-auto md:translate-x-0"
		>
			<div
				class="flex min-w-35 flex-col gap-1.5 rounded-xl border-2 border-slate-700 bg-slate-800 px-3 py-2 md:min-w-45 md:gap-2 md:px-4 md:py-3"
			>
				{#each sortedPlayers as player (player.name)}
					<div class="flex items-center gap-1.5 md:gap-2">
						<div
							class="h-2 w-2 shrink-0 rounded-full md:h-2.5 md:w-2.5"
							style="background-color: {player.color};"
						></div>
						<span class="flex-1 truncate text-xs font-medium text-slate-300 md:text-sm"
							>{player.name}</span
						>
						<span class="text-xs font-bold text-cyan-400 md:text-sm"
							>{$_('scoring.pts', { values: { points: player.score.toLocaleString() } })}</span
						>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Solo Mode Score Display (for Classic mode) -->
	{#if isSoloMode && !isGameOver && enableScoring && $gameSession.players.length > 0 && mode !== 'timeline'}
		<div class="absolute right-6 bottom-6 z-20 select-none">
			<div
				class="rounded-xl border-2 border-cyan-400 bg-slate-900 px-4 py-2 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
			>
				<p class="text-sm font-semibold text-slate-400">Score</p>
				<p class="text-right text-3xl font-bold text-cyan-400">{$gameSession.players[0].score}</p>
			</div>
		</div>
	{/if}
</div>

<!-- In-Game Settings -->
<InGameSettings visible={showInGameSettings} onClose={() => (showInGameSettings = false)} {mode} />

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

<!-- Scoring Screen (Classic & Buzzer — mode-specific categories via revealOptions) -->
<ScoringScreen
	visible={showScoringScreen}
	mode={mode === 'buzzer' ? 'buzzer' : 'classic'}
	track={currentTrack}
	players={$gameSession.players}
	categories={activeCategories}
	revealedCategories={revealOptions.scoringCategories ?? []}
	onScore={handleScoreSubmit}
/>

<!-- Track Info Popup (shown after reveal when scoring screen is not active, except Timeline) -->
<Popup
	visible={$currentRound.isRevealed && !showScoringScreen && mode !== 'timeline'}
	onClose={() => {}}
	width="w-[480px] max-w-[90vw]"
	showCloseButton={false}
>
	<div class="flex flex-col">
		<div class="min-h-0 flex-1 rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4">
			<TrackInfo track={currentTrack} showMirror={$gameSession.players.length > 1} bleed="sm" />
		</div>

		<!-- Continue button -->
		<button
			type="button"
			onclick={handleAfterReveal}
			class="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 font-bold text-cyan-400 transition-all duration-200 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]"
		>
			{$_('game.nextRound')}
			<ArrowRight class="h-5 w-5" />
		</button>
	</div>
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
	{enableScoring}
	tracksExhausted={playableBuffer.tracksExhausted}
	onViewStats={handleViewStatsFromEndGame}
	onHome={handleHome}
/>
