<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import { SquareStack } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import Flag from '../primitives/Flag.svelte';
	import type { LeaderboardEntry } from '$lib/types';

	interface Props {
		entries: LeaderboardEntry[];
		currentLocale: string;
		showExpanded?: boolean;
		isLoading?: boolean;
		onShowTimeline?: (entry: LeaderboardEntry) => void;
	}

	let {
		entries,
		currentLocale,
		showExpanded = $bindable(false),
		isLoading = false,
		onShowTimeline = () => {}
	}: Props = $props();

	function formatEntryDate(timestamp: string | undefined, locale: string): string {
		if (!timestamp) return '';
		const d = new Date(timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
	}
</script>

{#snippet leaderboardRow(entry: LeaderboardEntry, rank: number)}
	<span
		class="mr-2 text-center font-bold"
		class:text-cyan-400={entry.is_me}
		class:text-slate-500={!entry.is_me}
	>
		{rank}
	</span>
	<span
		class="truncate"
		class:text-cyan-300={entry.is_me && entry.player_name}
		class:text-slate-300={!entry.is_me && entry.player_name}
		class:text-slate-500={!entry.player_name}
	>
		<Flag country={entry.country} class="mr-0.5" faded={!entry.player_name} />
		{entry.player_name ?? $_('leaderboard.anonymous')}
	</span>
	<span
		class="whitespace-nowrap text-right font-bold tabular-nums"
		class:text-cyan-400={entry.is_me}
	>
		{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}
	</span>
	<span class="whitespace-nowrap text-right tabular-nums text-slate-500">
		{formatEntryDate(entry.timestamp, currentLocale)}
	</span>
	<div class="flex">
		{#if entry.timeline && entry.timeline !== '[]'}
			<button
				type="button"
				onclick={() => onShowTimeline(entry)}
				class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
			>
				<SquareStack class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>
{/snippet}

<div class="mt-1">
	<div class="mb-2 flex text-sm font-semibold text-slate-400">
		{$_('leaderboard.title')}
	</div>
	{#if isLoading && entries.length === 0}
		<p class="py-2 text-xs text-slate-500">{$_('leaderboard.loading')}</p>
	{:else if entries.length === 0}
		<p class="py-2 text-xs text-slate-500">{$_('leaderboard.noScores')}</p>
	{:else}
		<div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-[clamp(0.375rem,1.5vw,1.5rem)] gap-y-1 text-xs text-left">
			{#each entries.slice(0, 5) as entry, i (i)}
				{@render leaderboardRow(entry, i + 1)}
			{/each}
		</div>
		{#if showExpanded && entries.length > 5}
			<div transition:slide={{ duration: 200 }}>
				<div class="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-[clamp(0.375rem,1.5vw,1.5rem)] gap-y-1 text-xs text-left">
					{#each entries.slice(5) as entry, i (i)}
						{@render leaderboardRow(entry, i + 6)}
					{/each}
				</div>
			</div>
		{/if}
		{#if !showExpanded && entries.length > 5}
			<button
				type="button"
				onclick={() => (showExpanded = true)}
				class="mx-auto mt-1 flex cursor-pointer items-center justify-center rounded-md px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-400"
			>
				<ChevronDown class="h-4 w-4" />
			</button>
		{/if}
	{/if}
</div>
