<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { GuessCategory } from '$lib/types';
	import { tracklist, currentRound, toast } from '$lib/stores';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/gameplay/PlayerControl.svelte';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { GAME_SCREEN_CONTEXT } from './context';

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	let hasSpunOnce = $state(false); // Track if wheel has been spun in this round

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

	// Get disabled categories from context
	const disabledCategories = $derived(gameContext.disabledCategories);

	// Subscribe to audio progress
	let audioProgressValue = $state(0);
	gameContext.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});

	async function handleCategorySelected(category: GuessCategory) {
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
			await gameContext.playTrack();
		} catch (error) {
			console.error('Error playing track:', error);
			toast.show('error', 'Failed to play track.');
		}
	}

	function handleStop() {
		gameContext.stopTrack();
	}

	function handleReveal() {
		gameContext.revealTrack();
	}

	async function handleReplay() {
		try {
			await gameContext.replayTrack();
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.show('error', 'Failed to replay track.');
		}
	}

	async function handleNextRound() {
		// Reset hasSpunOnce for new round
		hasSpunOnce = false;

		await gameContext.nextRound();
	}
</script>

<!-- Main Game Area -->
{#if currentTrack}
	<div class="relative flex h-screen items-center justify-center">
		<!-- Spinning Wheel (fills screen) - only in Bingo mode -->
		<SpinningWheel
			currentRoundIndex={$currentRound.currentTrackIndex}
			{disabledCategories}
			hasValidYears={gameContext.hasValidYears}
			onCategorySelected={handleCategorySelected}
			onSpinStart={handleSpinStart}
			onSpinEnd={handleSpinEnd}
		/>

		<!-- Player Control (overlaid on wheel center) -->
		<PlayerControl
			visible={hasSpunOnce && !$currentRound.isSpinning && $currentRound.category !== null}
			isPlaying={$currentRound.isPlaying}
			playbackEnded={$currentRound.playbackEnded}
			isRevealed={$currentRound.isRevealed}
			progress={audioProgressValue}
			track={currentTrack}
			onPlay={handlePlay}
			onStop={handleStop}
			onReveal={handleReveal}
			onReplay={handleReplay}
			onNext={handleNextRound}
			onPlaybackEnd={gameContext.handlePlaybackEnd}
		/>
	</div>
{/if}

<!-- Category Display (shown briefly when wheel stops) -->
<EdgeDisplay
	visible={!!($currentRound.category && !$currentRound.isRevealed && !$currentRound.isSpinning)}
	hideTop={true}
>
	{#snippet children()}
		{@const categoryDef = getCategoryDefinition($currentRound.category!)}
		<div
			class="relative overflow-hidden rounded-2xl border-2 px-10 py-2 backdrop-blur-xs"
			style="border-color: {categoryDef.color2}; box-shadow: 0 0 40px {categoryDef.glowColor}; color: {categoryDef.color1};"
		>
			<!-- Background Icon -->
			<svg
				class="pointer-events-none absolute inset-0 h-full w-full p-2 opacity-25"
				viewBox="0 0 24 24"
				fill="currentColor"
				preserveAspectRatio="xMidYMid meet"
			>
				{#each categoryDef.iconPaths as pathData}
					<path d={pathData} />
				{/each}
			</svg>
			<p class="relative z-10 text-3xl font-bold tracking-wider uppercase drop-shadow-lg">
				{$_('game.guessCategory', {
					values: { category: $_(`game.categories.${$currentRound.category}`) }
				})}
			</p>
		</div>
	{/snippet}
</EdgeDisplay>
