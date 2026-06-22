<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fly, scale } from 'svelte/transition';
	import type { GuessCategory } from '$lib/types';
	import { BUZZER_TIME_PERCENTAGES, CATEGORY_POINTS } from '$lib/types';
	import { currentRound, settings } from '$lib/stores';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { getGameContext } from './context';
	import { shuffle } from '$lib/utils/random';
	import { edgesForPlayerCount } from '$lib/utils';
	import { gameSession, toast } from '$lib/stores';
	import { BUZZER_PREVIEW_COUNTDOWN } from '$lib/types/game';

	const ctx = getGameContext();

	// Randomly select n categories from active categories and order by points (most valuable first)
	// This is set once per round and stored in state to prevent changing mid-round
	// Filter out era/decade if track has no valid year data
	let categoryProgression = $state<GuessCategory[]>([]);

	// Initialize category progression when round changes
	$effect(() => {
		// Re-run on every round: the track index changes once per round, so reading it
		// here forces a fresh shuffle. (hasValidYears/activeCategories alone are stable
		// across rounds, which previously froze the progression for the whole game.)
		void $currentRound.currentTrackIndex;

		// Filter active categories based on year data availability
		const validCategories = ctx.hasValidYears
			? ctx.activeCategories
			: ctx.activeCategories.filter((cat) => cat !== 'era' && cat !== 'decade');

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

	let trackDuration = $state(ctx.currentTrackDuration); // Dynamic playable duration from player
	let hasStartedPlaying = $state(false);
	let isBuzzerPressed = $state(false);
	let wasManuallyBuzzed = $state(false); // Track if someone actually pressed the buzzer (vs timeout)
	let showReveal = $state(false); // Intermediate state after buzzer press

	// Audio element for buzzer sound
	let buzzerAudio: HTMLAudioElement | null = null;
	let audioContext: AudioContext | null = null;
	let gainNode: GainNode | null = null;

	// Detect if device has touch capability
	let hasTouch = $state(false);

	// Calculate playback time from progress and duration
	const playbackTime = $derived(ctx.audioProgressValue * trackDuration);

	// Snapshot of the categories revealed at buzz time. Captured BEFORE stopping the
	// track, because stopTrack() resets playback progress to 0, which would otherwise
	// collapse the derived currentCategory/revealedCategories back to the first category.
	let buzzedRevealedCategories = $state<GuessCategory[]>([]);

	// Auto-reveal when the track finishes without anyone buzzing.
	// Driven by playbackEnded (set when the clip ends) rather than a progress threshold:
	// the player resets progress to 0 on stop, so a threshold check could never fire.
	$effect(() => {
		if (hasStartedPlaying && !isBuzzerPressed && $currentRound.playbackEnded) {
			// Nobody buzzed before the track ended → reveal the full progression.
			isBuzzerPressed = true;
			wasManuallyBuzzed = false;

			const allCategories =
				categoryProgression.length > 0 ? [...categoryProgression] : [currentCategory];

			currentRound.update((state) => ({
				...state,
				category: allCategories[allCategories.length - 1]
			}));

			ctx.revealTrack({
				showScoring: false,
				scoringCategories: allCategories,
				beforeNextRound: resetBuzzerState
			});
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

	// Categories to display (revealed + placeholder if in transition)
	const categoriesToDisplay = $derived.by((): GuessCategory[] => {
		const base = [...revealedCategories];
		const currentIndex = categoryProgression.indexOf(currentCategory);
		const next =
			currentIndex >= 0 && currentIndex < categoryProgression.length - 1
				? categoryProgression[currentIndex + 1]
				: null;
		if (timeRemaining < BUZZER_PREVIEW_COUNTDOWN && next) {
			base.push(next);
		}
		return base;
	});

	// Buzzer-specific play function
	async function handleBuzzerPlay(): Promise<void> {
		if (!hasStartedPlaying) {
			// Start playback on first press
			try {
				await ctx.playTrack();
				hasStartedPlaying = true;

				// Get the track duration from the player
				trackDuration = ctx.currentTrackDuration;
			} catch (error) {
				console.error('Error playing track:', error);
				toast.error($_('network.playFailed'));
			}
		}
	}

	async function handleBuzzerPress() {
		if (!hasStartedPlaying) {
			// Start playback on first press
			await handleBuzzerPlay();
		} else if (!isBuzzerPressed) {
			// Buzzer pressed during playback - pause and show reveal button.
			// Capture category state BEFORE stopping: stopTrack() resets progress to 0,
			// which collapses the derived currentCategory/revealedCategories.
			buzzedRevealedCategories = [...revealedCategories];
			const buzzedCategory = currentCategory;

			playBuzzerSound();
			ctx.stopTrack();
			isBuzzerPressed = true;
			wasManuallyBuzzed = true; // Mark that someone actually pressed the buzzer
			showReveal = true;

			// Set the current category in the round state
			currentRound.update((state) => ({
				...state,
				category: buzzedCategory
			}));
		}
	}

	function handleBuzzerDown() {
		if (!ctx.currentTrack) return;

		if (showReveal) {
			handleBuzzerReveal();
		} else {
			handleBuzzerPress();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (!ctx.currentTrack) return;

		// Only trigger buzzer if button is not disabled
		if (!isBuzzerPressed || showReveal) {
			event.preventDefault();
			handleBuzzerDown();
		}
	}

	function playBuzzerSound() {
		// Play buzzer sound immediately when button is pressed
		if (buzzerAudio && audioContext && gainNode) {
			buzzerAudio.currentTime = 0;
			gainNode.gain.value = $settings.buzzerVolume;
			audioContext.resume().then(() => {
				buzzerAudio!.play().catch((err) => console.warn('Failed to play buzzer sound:', err));
			});
		}
	}

	function handleBuzzerReveal() {
		showReveal = false;
		ctx.revealTrack({
			showScoring: ctx.enableScoring && wasManuallyBuzzed,
			scoringCategories: buzzedRevealedCategories,
			beforeNextRound: resetBuzzerState
		});
	}

	/** Reset buzzer-specific state before advancing to the next round. */
	function resetBuzzerState() {
		hasStartedPlaying = false;
		isBuzzerPressed = false;
		wasManuallyBuzzed = false;
		showReveal = false;
		trackDuration = ctx.currentTrackDuration;
		buzzedRevealedCategories = [];
	}

	onMount(() => {
		// Detect touch support
		hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		// Create buzzer audio element
		buzzerAudio = new Audio('/buzzer.mp3');

		// Create Web Audio API context and gain node for volume control
		audioContext = new AudioContext();
		gainNode = audioContext.createGain();
		const source = audioContext.createMediaElementSource(buzzerAudio);
		source.connect(gainNode);
		gainNode.connect(audioContext.destination);

		// Add keyboard event listener for buzzer
		window.addEventListener('keydown', handleKeyDown);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
		audioContext?.close();
		buzzerAudio?.pause();
		buzzerAudio = null;
	});
</script>

<!-- Main Game Area -->
<div class="flex h-screen flex-col items-center justify-center">
	{#if ctx.currentTrack}
		<div
			class="flex h-full w-full flex-col items-center justify-center"
			transition:scale={{ duration: 300, start: 0.5 }}
		>
			<!-- Buzzer Button (always centered) with floating countdown -->
			<!-- Category & Time Display -->
			<EdgeDisplay
				visible={hasStartedPlaying && !isBuzzerPressed}
				edges={edgesForPlayerCount($gameSession.players.length)}
			>
				<div class="flex max-w-[90vw] items-center justify-center gap-2 md:gap-3">
					{#each categoriesToDisplay as category (category)}
						{@const currentIndex = categoryProgression.indexOf(currentCategory)}
						{@const next =
							currentIndex >= 0 && currentIndex < categoryProgression.length - 1
								? categoryProgression[currentIndex + 1]
								: null}
						{@const isPlaceholder = timeRemaining < BUZZER_PREVIEW_COUNTDOWN && category === next}
						{@const categoryDef = isPlaceholder
							? null
							: getCategoryDefinition(category as GuessCategory)}
						{@const isCurrent = category === currentCategory}
						<div
							in:fly={{ x: 100, duration: 300 }}
							out:fly={{ x: -100, duration: 300 }}
							class="relative flex flex-col items-center gap-2 overflow-hidden rounded-[20px] border-[3px] px-4 py-3 shadow-[0_0_40px] backdrop-blur-xs transition-all duration-300 md:flex-row md:gap-6 md:px-8"
							style="border-color: {isPlaceholder
								? '#6b7280'
								: categoryDef!.color2}; box-shadow: 0 0 40px {isPlaceholder
								? 'rgba(107, 114, 128, 0.6)'
								: categoryDef!.glowColor};"
						>
							{#if isPlaceholder}
								<div class="text-4xl font-bold text-gray-400 md:text-5xl">?</div>
								<div class="min-w-15 text-center text-4xl font-bold text-gray-400 md:text-5xl">
									{Math.ceil(timeRemaining)}
								</div>
							{:else}
								<!-- Background Icon -->
								<svg
									class="pointer-events-none absolute inset-0 h-full w-full p-2 opacity-25"
									viewBox="0 0 24 24"
									fill="currentColor"
									preserveAspectRatio="xMidYMid meet"
									style="color: {categoryDef!.color1};"
								>
									{#each categoryDef!.iconPaths as pathData (pathData)}
										<path d={pathData} />
									{/each}
								</svg>
								<div
									class="relative z-10 text-2xl font-bold tracking-wider uppercase"
									style="color: {categoryDef!.color1};"
								>
									{$_(`game.categories.${category}`)}
								</div>
								<div
									class="relative z-10 text-lg font-semibold text-nowrap"
									style="color: {categoryDef!.color2};"
								>
									{$_('scoring.pointsAwarded', {
										values: { points: CATEGORY_POINTS[category as GuessCategory] }
									})}
								</div>
								{#if isCurrent}
									<div
										class="relative z-10 min-w-15 text-center text-4xl font-bold text-white md:text-5xl"
									>
										{Math.ceil(trackDuration - playbackTime)}
									</div>
								{/if}
							{/if}
						</div>
					{/each}
				</div>
			</EdgeDisplay>
			<div class="relative z-50 flex items-center justify-center">
				<button
					type="button"
					class="relative z-100 flex aspect-square w-80 max-w-[80vw] cursor-pointer items-center justify-center rounded-full border-8 px-8 transition-all duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:w-125 {buzzerButtonClasses}"
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
</div>
