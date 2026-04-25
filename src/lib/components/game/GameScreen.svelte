<script lang="ts">
	import { onMount, onDestroy, setContext } from 'svelte';
	import type { TracklistGenerator } from '$lib/services';
	import type { Player, GameMode, Track } from '$lib/types';
	import {
		gameSession,
		currentRound,
		tracklist,
		nextRound as nextRoundFn,
		resetGame,
		toast,
		waitForOnline
	} from '$lib/stores';
	import { deezerPlayer, progress, NetworkError } from '$lib/services';
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
	import { settings } from '$lib/stores/settings';
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

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

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
	let tracksExhausted = $state(false);
	let isPreloading = $state(false);
	let hasPreloadError = $state(false);

	// Options passed by the game mode via revealTrack(options)
	let revealOptions = $state<RevealOptions>({});

	// Maximum number of retry attempts for a single preload when network errors occur
	const MAX_PRELOAD_RETRIES = 3;

	// Concurrency guard: prevents overlapping sampleAndPreloadTrack calls
	// from corrupting the tracklist or fighting over the DeezerPlayer singleton.
	let preloadInProgress = false;

	// Guard: prevents double-advancement caused by double-tapping Continue
	// during the popup out-transition.
	let isAdvancingRound = false;

	// Start game session on mount
	onMount(() => {
		const tracklistId = get(settings).selectedTracklist || 'unknown';
		const currentLocale = get(locale) || 'en';
		let gameInfo: Record<string, any> | null = null;
		
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

		analytics.startGame(mode, tracklistId, currentLocale, gameInfo);

		gameSession.startSession(mode, players, isSoloMode);

		// Set track length behavior based on mode
		deezerPlayer.setIgnoreTrackLength(ignoreTrackLength);

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

	function sampleNextTrack(): Track | null {
		const track = generator.sample();
		if (track) {
			tracklist.update((t) => [...t, track]);
		}
		return track;
	}

	// Just return a track from the generator without adding to tracklist/loading audio
	// Useful for Timeline deck filling
	function sampleRawTrack(): Track | null {
		return generator.sample();
	}

	async function sampleAndPreloadTrack(): Promise<void> {
		// Prevent concurrent calls from corrupting tracklist / DeezerPlayer state.
		// If a preload is already running, skip — the in-progress call will
		// populate the tracklist and load audio.
		if (preloadInProgress) return;
		preloadInProgress = true;
		isPreloading = true;
		hasPreloadError = false;

		try {
			// If a track already exists for the current round index (e.g. due to
			// a retry or a duplicated call), just re-load it instead of sampling
			// a brand-new track. This prevents phantom tracks piling up in the
			// tracklist while the DeezerPlayer singleton advances past the UI.
			const existingTrack = $tracklist[$currentRound.currentTrackIndex];
			if (existingTrack) {
				const availableDeezerIds = [...existingTrack.part.deezer];
				while (availableDeezerIds.length > 0) {
					const randomIndex = Math.floor(Math.random() * availableDeezerIds.length);
					const deezerId = availableDeezerIds[randomIndex];
					try {
						await deezerPlayer.load(deezerId);
						return;
					} catch {
						availableDeezerIds.splice(randomIndex, 1);
					}
				}
				// All deezer IDs failed for existing track — fall through to sample new
				tracklist.update((t) => t.filter((item) => item !== existingTrack));
			}

			while (true) {
				const track = sampleNextTrack();
				if (!track) {
					// No more tracks available - end the game
					if (mode === 'timeline') {
						tracksExhausted = true;
					} else {
						showEndGameScreen = true;
					}
					return;
				}

				// Try each available deezer ID for this track, with network-aware retry
				const availableDeezerIds = [...track.part.deezer]; // Create a copy to modify
				let trackLoaded = false;

				while (availableDeezerIds.length > 0) {
					// Pick a random deezer ID from the available ones
					const randomIndex = Math.floor(Math.random() * availableDeezerIds.length);
					const deezerId = availableDeezerIds[randomIndex];

					// Retry loop for transient network errors on a single Deezer ID
					for (let attempt = 1; attempt <= MAX_PRELOAD_RETRIES; attempt++) {
						try {
							await deezerPlayer.load(deezerId);
							trackLoaded = true;
							break; // Successfully loaded
						} catch (error) {
							const isNetworkErr = error instanceof NetworkError;

							if (isNetworkErr && attempt < MAX_PRELOAD_RETRIES) {
								// Transient network failure — wait and retry
								console.warn(
									`[GameScreen] Network error loading Deezer ID ${deezerId}, ` +
										`attempt ${attempt}/${MAX_PRELOAD_RETRIES}. Retrying…`
								);

								// If offline, wait for connectivity before retrying
								if (!navigator.onLine) {
									await waitForOnline();
								} else {
									// Exponential backoff: 1s, 2s, 4s
									await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
								}
								continue;
							}

							if (isNetworkErr && attempt === MAX_PRELOAD_RETRIES) {
								// All retries exhausted for this Deezer ID due to network
								console.error(`[GameScreen] Network retries exhausted for Deezer ID ${deezerId}`);
								hasPreloadError = true;
								toast.show('warning', $_('network.loadFailedFinal'), 5000);
							}

							// Non-network error or retries exhausted — remove this ID and try next
							break;
						}
					}

					if (trackLoaded) break;

					// Remove this deezer ID from the available list
					availableDeezerIds.splice(randomIndex, 1);
				}

				if (trackLoaded) {
					hasPreloadError = false;
					return;
				} else {
					// All deezer IDs failed — remove this specific track from the tracklist.
					console.warn('All deezer IDs failed for track, sampling another:', track.work.name);
					tracklist.update((t) => t.filter((item) => item !== track));
				}
			}
		} finally {
			preloadInProgress = false;
			isPreloading = false;
		}
	}

	// Shared audio control functions
	async function playTrack(): Promise<void> {
		try {
			deezerPlayer.play();

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
			deezerPlayer.replay();

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

			// Preload next track if needed
			// For timeline, we always want to preload the "next" card when this function is called
			if ($currentRound.currentTrackIndex >= $tracklist.length) {
				await sampleAndPreloadTrack();
			}
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
		tracksExhausted = false;
		hasPreloadError = false;
		preloadInProgress = false;
		isAdvancingRound = false;
		sampleAndPreloadTrack();
	}

	/**
	 * Manually retry preloading after a network failure.
	 * Resets error state and re-runs sampleAndPreloadTrack.
	 */
	function retryPreload(): void {
		hasPreloadError = false;
		preloadInProgress = false;
		sampleAndPreloadTrack();
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
		onHome: handleHome,
		get currentTrack() {
			return currentTrack;
		},
		get audioProgressValue() {
			return $progress;
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
			return tracksExhausted;
		},
		enableScoring,
		get isPreloading() {
			return isPreloading;
		},
		get hasPreloadError() {
			return hasPreloadError;
		}
	} satisfies GameScreenContext);
</script>

<div class="fixed inset-0 overflow-hidden text-white">
	<!-- Network Status Banner -->
	<NetworkStatusBanner isLoading={isPreloading} hasError={hasPreloadError} />

	<!-- Logo -->
	<div class="absolute top-6 left-6 z-20">
		<Logo onClick={handleHomeClick} size="medium" />
	</div>

	<!-- Settings -->
	<button
		type="button"
		onclick={() => (showInGameSettings = true)}
		class="absolute top-6 right-6 z-20 flex items-center gap-2 rounded-lg bg-slate-800/80 px-4 py-2 text-cyan-400 backdrop-blur-sm
                 transition-colors hover:bg-slate-700/80"
	>
		<SettingsIcon class="h-5 w-5" />
	</button>

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

	<!-- Stats Button (for multiplayer modes with scoring) -->
	{#if !isSoloMode && !isGameOver && !showScoringScreen && enableScoring && mode !== 'timeline'}
		<!-- Game Summary (bottom-center on mobile, bottom-right on desktop) -->
		<div
			class="fixed bottom-4 left-1/2 z-10 -translate-x-1/2 md:right-6 md:left-auto md:translate-x-0"
		>
			<div
				class="flex min-w-[140px] flex-col gap-1.5 rounded-xl border-2 border-slate-700 bg-slate-800 px-3 py-2 md:mr-20 md:min-w-[180px] md:gap-2 md:px-4 md:py-3"
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
							>{$_('scoring.pts', { values: { points: player.score } })}</span
						>
					</div>
				{/each}
			</div>
		</div>

		<!-- Stats Button (always bottom-right) -->
		<div class="fixed right-6 bottom-6 z-10">
			<button
				type="button"
				onclick={handleShowStats}
				class="flex cursor-pointer items-center justify-center rounded-full border-2 border-cyan-400 p-3 text-cyan-400 shadow-[0_4px_20px_rgba(34,211,238,0.4)] transition-all duration-200 hover:scale-110 hover:shadow-[0_6px_30px_rgba(34,211,238,0.6)] active:scale-95 md:p-3.5"
				aria-label="View statistics"
			>
				<BarChart class="h-5 w-5 md:h-6 md:w-6" />
			</button>
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
	{tracksExhausted}
	onViewStats={handleViewStatsFromEndGame}
	onHome={handleHome}
/>
