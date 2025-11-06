<script lang="ts">
	import { getContext } from 'svelte';
	import { currentRound, tracklist } from '$lib/stores';
	import { getCategoryDefinition } from '$lib/data/categories';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import { _ } from 'svelte-i18n';
	import { GAME_SCREEN_CONTEXT } from './context';
	import { CATEGORY_POINTS } from '$lib/types';

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	// Get context from parent GameScreen
	const gameContext = getContext(GAME_SCREEN_CONTEXT) as {
		playTrack: () => Promise<void>;
		stopTrack: () => void;
		replayTrack: () => Promise<void>;
		revealTrack: () => void;
		nextRound: () => Promise<void>;
		audioProgress: import('svelte/store').Readable<number>;
		onHome: () => void;
		activeCategories: readonly import('$lib/types').GuessCategory[];
		disabledCategories: readonly import('$lib/types').GuessCategory[];
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
		<!-- Floating Legend of Categories (above player button) -->
		<div
			class="absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-80 rounded-2xl border-2 border-cyan-400 bg-gray-900 px-4 py-3 shadow-[0_0_30px_rgba(34,211,238,0.3)] md:px-6 md:py-4"
		>
			<div class="flex flex-col items-center gap-1.5 md:flex-row md:gap-2">
				{#each activeCategories as category}
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
								{$_('scoring.pointsAwarded', { values: { points: CATEGORY_POINTS[category] } })}
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
			progress={audioProgressValue}
			track={currentTrack}
			onPlay={gameContext.playTrack}
			onStop={gameContext.stopTrack}
			onReveal={gameContext.revealTrack}
			onReplay={gameContext.replayTrack}
			onNext={gameContext.nextRound}
		/>
	</div>
{/if}
