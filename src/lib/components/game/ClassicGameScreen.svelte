<script lang="ts">
	import { scale } from 'svelte/transition';
	import { currentRound, gameSession } from '$lib/stores';
	import { getCategoryDefinition } from '$lib/data/categories';
	import PlayerControl from '../ui/gameplay/PlayerControl.svelte';
	import { _ } from 'svelte-i18n';
	import { getGameContext } from './context';
	import { CATEGORY_POINTS } from '$lib/types';
	import { edgesForPlayerCount } from '$lib/utils';
	import EdgeDisplay from '../ui/primitives/EdgeDisplay.svelte';

	const ctx = getGameContext();

	// Get active categories from context
	const activeCategories = $derived(ctx.activeCategories);
</script>

<!-- Main Game Area -->
<div class="flex h-screen items-center justify-center">
	<!-- Floating Legend of Categories -->
	<EdgeDisplay
		margin="42px"
		visible={$currentRound.isPlaying}
		edges={edgesForPlayerCount($gameSession.players.length)}
	>
		<div class="flex w-[80vw] flex-wrap justify-center gap-1.5 md:max-w-[60vmin] md:min-w-[60vmin]">
			{#each activeCategories as category (category)}
				{@const categoryDef = getCategoryDefinition(category)}
				<div
					class="relative flex w-[calc(50%-0.1875rem)] flex-col items-center justify-center overflow-hidden rounded-2xl border-3 border-transparent py-1 md:w-[calc(33%-0.1875rem)] md:py-2"
					style="border-color: {categoryDef.color2}; box-shadow: 0 0 40px {categoryDef.glowColor}; color: {categoryDef.color1};"
				>
					<!-- Background Icon -->
					<svg
						class="pointer-events-none absolute inset-0 h-full w-full p-2 opacity-25"
						viewBox="0 0 24 24"
						fill="currentColor"
						preserveAspectRatio="xMidYMid meet"
					>
						{#each categoryDef.iconPaths as pathData (pathData)}
							<path d={pathData} />
						{/each}
					</svg>
					<span class="relative z-10 px-3 text-xl font-bold tracking-wider uppercase md:text-2xl"
						>{$_(`game.categories.${category}`)}</span
					>
					<span class="relative z-10 text-sm font-semibold text-nowrap md:text-base">
						{$_('scoring.pointsAwarded', { values: { points: CATEGORY_POINTS[category] } })}
					</span>
				</div>
			{/each}
		</div>
	</EdgeDisplay>

	<!-- Player Control Button (Fixed Center) -->
	{#if ctx.currentTrack}
		<div class="absolute inset-0" transition:scale={{ duration: 300, start: 0.5 }}>
			<PlayerControl
				visible={!$currentRound.isRevealed}
				isPlaying={$currentRound.isPlaying}
				playbackEnded={$currentRound.playbackEnded}
				isRevealed={$currentRound.isRevealed}
				progress={ctx.audioProgressValue}
				onPlay={ctx.playTrack}
				onStop={ctx.stopTrack}
				onReveal={ctx.revealTrack}
				onReplay={ctx.replayTrack}
				playerSize={240}
			/>
		</div>
	{/if}
</div>
