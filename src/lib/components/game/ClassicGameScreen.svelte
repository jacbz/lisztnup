<script lang="ts">
	import { getContext } from 'svelte';
	import { currentRound, tracklist } from '$lib/stores';
	import { getCategoryDefinition } from '$lib/data/categories';
	import PlayerControl from '../ui/gameplay/PlayerControl.svelte';
	import { _ } from 'svelte-i18n';
	import { GAME_SCREEN_CONTEXT } from './context';
	import { CATEGORY_POINTS } from '$lib/types';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

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
		activeCategories: readonly import('$lib/types').GuessCategory[];
		disabledCategories: readonly import('$lib/types').GuessCategory[];
		hasValidYears: boolean;
	};

	// Subscribe to audio progress
	let audioProgressValue = $state(0);
	gameContext.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});

	// Get active categories from context
	const activeCategories = $derived(gameContext.activeCategories);
</script>

<!-- Main Game Area -->
{#if currentTrack}
	<div class="flex h-screen items-center justify-center">
		<!-- Floating Legend of Categories -->
		<EdgeDisplay margin="42px" visible={$currentRound.isPlaying}>
			{#snippet children()}
				<div
					class="flex w-[80vw] flex-wrap justify-center gap-1.5 md:max-w-[60vmin] md:min-w-[60vmin]"
				>
					{#each activeCategories as category, index}
						{@const categoryDef = getCategoryDefinition(category)}
						<div
							class="flex w-{[
								activeCategories.length % 2 === 1 && index == 0 ? 'full' : '[calc(50%-0.1875rem)]'
							]} flex-col items-center justify-center rounded-2xl border-3 border-transparent py-1 backdrop-blur-md md:w-[calc(33%-0.1875rem)] md:py-2"
							style="border-color: {categoryDef.color2}; box-shadow: 0 0 40px {categoryDef.glowColor}; color: {categoryDef.color1};"
						>
							<span class="px-3 text-xl font-bold tracking-wider uppercase md:text-2xl"
								>{$_(`game.categories.${category}`)}</span
							>
							<span class="text-sm font-semibold text-nowrap md:text-base">
								{$_('scoring.pointsAwarded', { values: { points: CATEGORY_POINTS[category] } })}
							</span>
						</div>
					{/each}
				</div>
			{/snippet}
		</EdgeDisplay>

		<!-- Player Control Button (Fixed Center) -->
		<PlayerControl
			visible={!$currentRound.isRevealed}
			isPlaying={$currentRound.isPlaying}
			playbackEnded={$currentRound.playbackEnded}
			isRevealed={$currentRound.isRevealed}
			progress={audioProgressValue}
			track={currentTrack}
			onPlay={gameContext.playTrack}
			onStop={gameContext.stopTrack}
			onReveal={gameContext.revealTrack}
			onReplay={gameContext.replayTrack}
			onNext={gameContext.nextRound}
			onPlaybackEnd={gameContext.handlePlaybackEnd}
			playerSize={240}
		/>
	</div>
{/if}
