<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import type { GuessCategory } from '$lib/types';
	import { BUZZER_TIME_LIMITS, CATEGORY_POINTS } from '$lib/types';
	import { currentRound, tracklist, settings } from '$lib/stores';
	import ScoringScreen from '../ui/ScoringScreen.svelte';
	import Popup from '../ui/Popup.svelte';
	import TrackInfo from '../ui/TrackInfo.svelte';
	import EdgeDisplay from '../ui/EdgeDisplay.svelte';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { GAME_SCREEN_CONTEXT } from './context';

	// Get context from parent GameScreen
	const gameContext = getContext(GAME_SCREEN_CONTEXT) as {
		playTrack: () => Promise<void>;
		stopTrack: () => void;
		replayTrack: () => Promise<void>;
		revealTrack: () => void;
		nextRound: () => Promise<void>;
		audioProgress: import('svelte/store').Readable<number>;
		onHome: () => void;
		activeCategories: readonly GuessCategory[];
		disabledCategories: readonly GuessCategory[];
		enableScoring: boolean;
	};

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	// Get disabled categories from context
	const disabledCategories = $derived(gameContext.disabledCategories);

	// Get enableScoring from context
	const enableScoring = $derived(gameContext.enableScoring);

	// Get numberOfTracks from settings
	const numberOfTracks = $derived($settings.numberOfTracks);

	// Build category progression based on disabled categories
	// Logic: composition -> composer -> decade/era
	// If composer is disabled, use decade instead
	// If both decade and era are disabled, only use composition
	const categoryProgression = $derived.by((): GuessCategory[] => {
		const progression: GuessCategory[] = [];

		// Always start with composition if available
		if (!disabledCategories.includes('composition')) {
			progression.push('composition');
		}

		// Next priority: composer (or decade if composer disabled)
		if (!disabledCategories.includes('composer')) {
			progression.push('composer');
		} else if (!disabledCategories.includes('decade')) {
			progression.push('decade');
		}

		// Final category: decade or era (whichever is available and not already used)
		if (!disabledCategories.includes('decade') && !progression.includes('decade')) {
			progression.push('decade');
		} else if (!disabledCategories.includes('era')) {
			progression.push('era');
		}

		// Fallback: if progression is empty, use any available category
		if (progression.length === 0) {
			const allCategories: GuessCategory[] = ['composition', 'composer', 'decade', 'era', 'form'];
			const available = allCategories.filter((cat) => !disabledCategories.includes(cat));
			if (available.length > 0) {
				progression.push(available[0]);
			}
		}

		return progression;
	});

	let playbackTime = $state(0); // Current playback time in seconds
	let hasStartedPlaying = $state(false);
	let isBuzzerPressed = $state(false);
	let showReveal = $state(false); // Intermediate state after buzzer press

	// Audio element for buzzer sound
	let buzzerAudio: HTMLAudioElement | null = null;

	// Detect if device has touch capability
	let hasTouch = $state(false);

	// Compute button state classes
	const isActiveBuzz = $derived(!showReveal && hasStartedPlaying);
	const buzzerButtonClasses = $derived(
		isActiveBuzz
			? 'border-red-700 bg-red-600 shadow-[0_10px_40px_rgba(220,38,38,0.6)] hover:shadow-[0_15px_50px_rgba(220,38,38,0.8)] active:shadow-[0_5px_30px_rgba(220,38,38,0.6)]'
			: 'border-cyan-400 bg-transparent shadow-[0_0_30px_rgba(34,211,238,0.6)] hover:shadow-[0_0_40px_rgba(34,211,238,0.8)] active:shadow-[0_0_25px_rgba(34,211,238,0.5)]'
	);

	// Determine current category based on time and progression
	const currentCategory = $derived.by((): GuessCategory => {
		if (categoryProgression.length === 0) {
			// Fallback to composition if somehow no categories are available
			return 'composition';
		}

		if (categoryProgression.length === 1) {
			// Only one category available, use it throughout
			return categoryProgression[0];
		}

		if (categoryProgression.length === 2) {
			// Two categories: split time 15s / 15s
			if (playbackTime < 15) {
				return categoryProgression[0];
			} else {
				return categoryProgression[1];
			}
		}

		// Three categories: use original time splits (15s / 10s / 5s)
		if (playbackTime < BUZZER_TIME_LIMITS.composition) {
			return categoryProgression[0];
		} else if (playbackTime < BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer) {
			return categoryProgression[1];
		} else {
			return categoryProgression[2];
		}
	});

	// Time remaining for current category
	const timeRemaining = $derived.by((): number => {
		if (categoryProgression.length === 0) {
			return 30 - playbackTime;
		}

		if (categoryProgression.length === 1) {
			// Only one category, show time remaining for full 30s
			return 30 - playbackTime;
		}

		if (categoryProgression.length === 2) {
			// Two categories: 15s each
			if (playbackTime < 15) {
				return 15 - playbackTime;
			} else {
				return 30 - playbackTime;
			}
		}

		// Three categories: original splits
		if (playbackTime < BUZZER_TIME_LIMITS.composition) {
			return BUZZER_TIME_LIMITS.composition - playbackTime;
		} else if (playbackTime < BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer) {
			return BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer - playbackTime;
		} else {
			const total =
				BUZZER_TIME_LIMITS.composition + BUZZER_TIME_LIMITS.composer + BUZZER_TIME_LIMITS.era;
			return total - playbackTime;
		}
	});

	// Buzzer-specific progress tracking
	let buzzerProgressInterval: number | null = null;

	function startBuzzerProgressTracking() {
		stopBuzzerProgressTracking();

		buzzerProgressInterval = window.setInterval(() => {
			const current = deezerPlayer.getCurrentTime();
			playbackTime = current;

			// Check if we've reached the end of buzzer time (always 30s)
			const maxTime = 30;

			if (current >= maxTime || !deezerPlayer.isPlaying()) {
				// Time's up - auto-buzz and show reveal
				deezerPlayer.pause();
				stopBuzzerProgressTracking();
				isBuzzerPressed = true;
				showReveal = true;

				currentRound.update((state) => ({
					...state,
					category: currentCategory
				}));
			}
		}, 100);
	}

	function stopBuzzerProgressTracking() {
		if (buzzerProgressInterval) {
			clearInterval(buzzerProgressInterval);
			buzzerProgressInterval = null;
		}
	}

	// Buzzer-specific play function
	async function handleBuzzerPlay(): Promise<void> {
		if (!hasStartedPlaying) {
			// Start playback on first press
			try {
				await deezerPlayer.play();
				hasStartedPlaying = true;
				startBuzzerProgressTracking();
			} catch (error) {
				console.error('Error playing track:', error);
				toast.show('error', 'Failed to play track.');
			}
		}
	}

	async function handleBuzzerPress(event?: Event) {
		if (!hasStartedPlaying) {
			// Start playback on first press
			await handleBuzzerPlay();
		} else if (!isBuzzerPressed) {
			// Buzzer pressed during playback - pause and show reveal button
			playBuzzerSound();
			deezerPlayer.pause();
			stopBuzzerProgressTracking();
			isBuzzerPressed = true;
			showReveal = true;

			// Set the current category in the round state
			currentRound.update((state) => ({
				...state,
				category: currentCategory
			}));
		}
	}

	function handleBuzzerDown(event: Event) {
		if (showReveal) {
			handleBuzzerReveal();
		} else {
			handleBuzzerPress(event);
		}
	}

	function playBuzzerSound() {
		// Play buzzer sound immediately when button is pressed
		if (buzzerAudio) {
			buzzerAudio.currentTime = 0;
			buzzerAudio.play().catch((err) => console.warn('Failed to play buzzer sound:', err));
		}
	}

	function handleBuzzerReveal() {
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

	function handleBuzzerNext() {
		// Check if this is the last track
		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			handleBuzzerNextRound();
		}
	}

	function handleBuzzerScoreSubmit(scores: Record<string, number>) {
		gameSession.recordRound($currentRound.currentTrackIndex, scores);
		showScoringScreen = false;

		if ($currentRound.currentTrackIndex >= numberOfTracks - 1) {
			showEndGameScreen = true;
		} else {
			handleBuzzerNextRound();
		}
	}

	async function handleBuzzerNextRound() {
		deezerPlayer.pause();
		stopBuzzerProgressTracking();

		// Reset state for next round
		hasStartedPlaying = false;
		isBuzzerPressed = false;
		showReveal = false;
		playbackTime = 0;

		await gameContext.nextRound();
	}

	// Buzzer-specific state
	let showScoringScreen = $state(false);
	let showEndGameScreen = $state(false);

	// Import required functions from stores
	import { gameSession, nextRound as nextRoundFn, resetGame, toast } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';

	onMount(() => {
		// Detect touch support
		hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		// Create buzzer audio element
		buzzerAudio = new Audio('/buzzer.mp3');
	});

	onDestroy(() => {
		if (buzzerProgressInterval) clearInterval(buzzerProgressInterval);
	});
</script>

<!-- Main Game Area -->
{#if currentTrack}
	<div class="flex h-screen flex-col items-center justify-center">
		<!-- Buzzer Button (always centered) with floating countdown -->
		<!-- Category & Time Display -->
		<EdgeDisplay visible={hasStartedPlaying && !isBuzzerPressed}>
			{#snippet children()}
				{@const categoryDef = getCategoryDefinition(currentCategory)}
				<div
					class="flex max-w-[90vw] flex-col items-center gap-3 rounded-[20px] border-[3px] bg-gray-900 px-6 py-3 shadow-[0_0_40px] md:flex-row md:gap-6 md:px-8"
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
						{$_('scoring.pointsAwarded', {
							values: { points: CATEGORY_POINTS[currentCategory] }
						})}
					</div>
					<div class="min-w-[60px] text-center text-4xl font-bold text-white md:text-5xl">
						{Math.ceil(timeRemaining)}
					</div>
				</div>
			{/snippet}
		</EdgeDisplay>
		<div class="relative z-50 flex items-center justify-center">
			<button
				type="button"
				class="relative z-100 flex aspect-square w-80 max-w-[80vw] cursor-pointer items-center justify-center rounded-full border-8 px-8 transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:w-[500px] {buzzerButtonClasses}"
				onmousedown={hasTouch ? undefined : handleBuzzerDown}
				ontouchstart={hasTouch ? handleBuzzerDown : undefined}
				disabled={isBuzzerPressed && !showReveal}
			>
				{#if showReveal}
					<span
						class="font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
						style="font-size: clamp(2rem, 8vw, 4rem);">{$_('game.buzzer.reveal')}</span
					>
				{:else if !hasStartedPlaying}
					<span
						class="font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
						style="font-size: clamp(2rem, 8vw, 4rem);">{$_('game.buzzer.pressToStart')}</span
					>
				{:else}
					<span
						class="font-bold tracking-[0.15em] text-white uppercase drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
						style="font-size: clamp(3rem, 10vw, 5rem);">{$_('game.buzzer.buzz')}</span
					>
				{/if}
			</button>
		</div>
	</div>
{/if}

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
					onclick={handleBuzzerNext}
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
	onScore={handleBuzzerScoreSubmit}
/>
