<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import type { GuessCategory } from '$lib/types';
	import { BUZZER_TIME_PERCENTAGES, CATEGORY_POINTS } from '$lib/types';
	import { currentRound, tracklist, settings } from '$lib/stores';
	import ScoringScreen from '../ui/screens/ScoringScreen.svelte';
	import Popup from '../ui/primitives/Popup.svelte';
	import TrackInfo from '../ui/gameplay/TrackInfo.svelte';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { GAME_SCREEN_CONTEXT } from './context';
	import { shuffle } from '$lib/utils/random';
	import { playerState } from '$lib/services';

	// Get context from parent GameScreen
	const gameContext = getContext(GAME_SCREEN_CONTEXT) as {
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
	};

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	// Get enableScoring from context
	const enableScoring = $derived(gameContext.enableScoring);

	// Get numberOfTracks from settings
	const numberOfTracks = $derived($settings.numberOfTracks);

	// Get active categories from context
	const activeCategories = $derived(gameContext.activeCategories);

	// Get hasValidYears from context
	const hasValidYears = $derived(gameContext.hasValidYears);

	// Randomly select n categories from active categories and order by points (most valuable first)
	// This is set once per round and stored in state to prevent changing mid-round
	// Filter out era/decade if track has no valid year data
	let categoryProgression = $state<GuessCategory[]>([]);

	// Initialize category progression when round changes
	$effect(() => {
		// Filter active categories based on year data availability
		const validCategories = hasValidYears
			? activeCategories
			: activeCategories.filter((cat) => cat !== 'era' && cat !== 'decade');

		// Generate new category progression for this round
		if (validCategories.length === 0) {
			categoryProgression = [];
		} else {
			// Shuffle and take up to BUZZER_TIME_PERCENTAGES.length categories
			const selectedCategories = shuffle([...validCategories]).slice(
				0,
				Math.min(BUZZER_TIME_PERCENTAGES.length, validCategories.length)
			);

			// Sort by points descending (most valuable first)
			selectedCategories.sort((a, b) => CATEGORY_POINTS[b] - CATEGORY_POINTS[a]);

			categoryProgression = selectedCategories;
		}
	});

	let trackDuration = $state(30); // Track duration from player
	let hasStartedPlaying = $state(false);
	let isBuzzerPressed = $state(false);
	let wasManuallyBuzzed = $state(false); // Track if someone actually pressed the buzzer (vs timeout)
	let showReveal = $state(false); // Intermediate state after buzzer press

	// Audio element for buzzer sound
	let buzzerAudio: HTMLAudioElement | null = null;

	// Detect if device has touch capability
	let hasTouch = $state(false);

	// Subscribe to audio progress from DeezerPlayer
	let audioProgressValue = $state(0);
	gameContext.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});

	// Calculate playback time from progress and duration
	const playbackTime = $derived(audioProgressValue * trackDuration);

	// Monitor playback to detect when time's up (auto-buzz)
	$effect(() => {
		if (
			hasStartedPlaying &&
			!isBuzzerPressed &&
			(playbackTime >= trackDuration || (!deezerPlayer.isPlaying() && audioProgressValue >= 0.99))
		) {
			// Time's up - auto-buzz and show reveal (but wasManuallyBuzzed stays false)
			deezerPlayer.pause();
			isBuzzerPressed = true;
			showReveal = true;

			currentRound.update((state) => ({
				...state,
				category: currentCategory
			}));
		}
	});

	// Compute button state classes
	const isActiveBuzz = $derived(!showReveal && hasStartedPlaying && !$currentRound.isRevealed);
	const buzzerButtonClasses = $derived(
		isActiveBuzz
			? 'border-red-700 bg-red-600 shadow-[0_10px_40px_rgba(220,38,38,0.6)] hover:shadow-[0_15px_50px_rgba(220,38,38,0.8)] active:shadow-[0_5px_30px_rgba(220,38,38,0.6)]'
			: 'border-cyan-400 bg-transparent shadow-[0_0_30px_rgba(34,211,238,0.6)] hover:shadow-[0_0_40px_rgba(34,211,238,0.8)] active:shadow-[0_0_25px_rgba(34,211,238,0.5)]'
	);

	// Normalize percentages based on number of categories
	const normalizedPercentages = $derived.by((): number[] => {
		const numCategories = categoryProgression.length;
		if (numCategories === 0) return [1.0];

		// Take first n elements from BUZZER_TIME_PERCENTAGES
		const percentages = BUZZER_TIME_PERCENTAGES.slice(0, numCategories);

		// Normalize so they sum to 1.0
		const sum = percentages.reduce((acc, val) => acc + val, 0);
		return percentages.map((p) => p / sum);
	});

	// Calculate cumulative thresholds for category changes
	const categoryThresholds = $derived.by((): number[] => {
		const thresholds: number[] = [];
		let cumulative = 0;

		for (const percentage of normalizedPercentages) {
			cumulative += percentage;
			thresholds.push(cumulative * trackDuration);
		}

		return thresholds;
	});

	// Determine current category based on time and progression
	const currentCategory = $derived.by((): GuessCategory => {
		if (categoryProgression.length === 0) {
			// Fallback to work if somehow no categories are available
			return 'work';
		}

		// Find which threshold we're currently under
		for (let i = 0; i < categoryThresholds.length; i++) {
			if (playbackTime < categoryThresholds[i]) {
				return categoryProgression[i];
			}
		}

		// If we've exceeded all thresholds, return the last category
		return categoryProgression[categoryProgression.length - 1];
	});

	// Time remaining for current category
	const timeRemaining = $derived.by((): number => {
		if (categoryProgression.length === 0) {
			return trackDuration - playbackTime;
		}

		// Find which category we're in
		for (let i = 0; i < categoryThresholds.length; i++) {
			if (playbackTime < categoryThresholds[i]) {
				return categoryThresholds[i] - playbackTime;
			}
		}

		// If we've exceeded all thresholds, time remaining until end
		return trackDuration - playbackTime;
	});

	// Categories revealed so far (all categories up to and including currentCategory)
	const revealedCategories = $derived.by((): GuessCategory[] => {
		const currentIndex = categoryProgression.indexOf(currentCategory);
		if (currentIndex === -1) return [currentCategory];
		return categoryProgression.slice(0, currentIndex + 1);
	});

	// Buzzer-specific play function
	async function handleBuzzerPlay(): Promise<void> {
		if (!hasStartedPlaying) {
			// Start playback on first press
			try {
				await deezerPlayer.play();
				hasStartedPlaying = true;

				// Get the track duration from the player
				trackDuration = deezerPlayer.getDuration();
			} catch (error) {
				console.error('Error playing track:', error);
				toast.show('error', 'Failed to play track.');
			}
		}
	}

	async function handleBuzzerPress() {
		if (!hasStartedPlaying) {
			// Start playback on first press
			await handleBuzzerPlay();
		} else if (!isBuzzerPressed) {
			// Buzzer pressed during playback - pause and show reveal button
			playBuzzerSound();
			deezerPlayer.pause();
			isBuzzerPressed = true;
			wasManuallyBuzzed = true; // Mark that someone actually pressed the buzzer
			showReveal = true;

			// Set the current category in the round state and store revealed categories
			buzzerRevealedCategories = [...revealedCategories];
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
			handleBuzzerPress();
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

		// Show scoring screen only if scoring is enabled AND someone manually pressed the buzzer
		// If no one pressed the buzzer (time ran out), treat it like scoring is disabled (just show track info)
		if (enableScoring && wasManuallyBuzzed) {
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

		// Reset state for next round
		hasStartedPlaying = false;
		isBuzzerPressed = false;
		wasManuallyBuzzed = false;
		showReveal = false;
		trackDuration = 30; // Reset to default, will be updated when track plays

		await gameContext.nextRound();
	}

	// Buzzer-specific state
	let showScoringScreen = $state(false);
	let showEndGameScreen = $state(false);
	let buzzerRevealedCategories = $state<GuessCategory[]>([]); // Categories revealed when buzzer was pressed

	// Import required functions from stores
	import { gameSession, toast } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';

	onMount(() => {
		// Detect touch support
		hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		// Create buzzer audio element
		buzzerAudio = new Audio('/buzzer.mp3');
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
						style="font-size: clamp(2rem, 8vw, 4rem);">{$_('game.reveal')}</span
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

<!-- Track Info Popup (when scoring is disabled OR no one manually pressed the buzzer) -->
<Popup
	visible={$currentRound.isRevealed && (!enableScoring || !wasManuallyBuzzed)}
	onClose={() => {}}
>
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
	revealedCategories={buzzerRevealedCategories}
	onScore={handleBuzzerScoreSubmit}
/>
