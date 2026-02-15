<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { GuessCategory } from '$lib/types';
	import { tracklist, currentRound, toast } from '$lib/stores';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/gameplay/PlayerControl.svelte';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { getGameContext } from './context';

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	let hasSpunOnce = $state(false); // Track if wheel has been spun in this round

	const ctx = getGameContext();

	// Get disabled categories from context
	const disabledCategories = $derived(ctx.disabledCategories);

	// Subscribe to audio progress
	let audioProgressValue = $state(0);
	const unsubAudioProgress = ctx.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});
	onDestroy(unsubAudioProgress);

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
			await ctx.playTrack();
		} catch (error) {
			console.error('Error playing track:', error);
			toast.show('error', 'Failed to play track.');
		}
	}

	function handleStop() {
		ctx.stopTrack();
	}

	function handleReveal() {
		ctx.revealTrack();
	}

	async function handleReplay() {
		try {
			await ctx.replayTrack();
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.show('error', 'Failed to replay track.');
		}
	}

	async function handleNextRound() {
		// Reset hasSpunOnce for new round
		hasSpunOnce = false;

		await ctx.nextRound();
	}
</script>

<!-- Main Game Area -->
{#if currentTrack}
	<div class="relative flex h-screen items-center justify-center">
		<!-- Spinning Wheel (fills screen) - only in Bingo mode -->
		<SpinningWheel
			currentRoundIndex={$currentRound.currentTrackIndex}
			{disabledCategories}
			hasValidYears={ctx.hasValidYears}
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
			onPlaybackEnd={ctx.handlePlaybackEnd}
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
