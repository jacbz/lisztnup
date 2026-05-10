<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import { SquareStack } from 'lucide-svelte';
	import { _ } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import Flag from '../primitives/Flag.svelte';
	import type { LeaderboardEntry } from '$lib/types';
	import { formatDateString } from '$lib/utils';

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
</script>

{#snippet tableColgroup()}
	<colgroup>
		<col class="w-6" />
		<col />
		<col class="w-22" />
		<col class="w-18" />
		<col class="w-5" />
	</colgroup>
{/snippet}

{#snippet leaderboardRow(entry: LeaderboardEntry)}
	<tr>
		<td
			class="pr-2 text-center font-bold"
			class:text-cyan-400={entry.is_me}
			class:text-slate-500={!entry.is_me}
		>
			{entry.rank}
		</td>
		<td
			class="max-w-0 truncate"
			class:text-cyan-300={entry.is_me}
			class:text-slate-300={!entry.is_me && entry.player_name}
			class:text-slate-500={!entry.is_me && !entry.player_name}
		>
			<Flag country={entry.country} class="mr-0.5" faded={!entry.player_name} />
			{entry.player_name ?? $_('leaderboard.anonymous')}
		</td>
		<td
			class="pl-[clamp(0.375rem,1.5vw,1.5rem)] text-right font-bold whitespace-nowrap tabular-nums"
			class:text-cyan-400={entry.is_me}
		>
			{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}
		</td>
		<td
			class="pl-[clamp(0.375rem,1.5vw,1.5rem)] text-right whitespace-nowrap text-slate-500 tabular-nums"
		>
			{formatDateString(entry.timestamp, currentLocale)}
		</td>
		<td class="pl-[clamp(0.375rem,1.5vw,1.5rem)]">
			<div class="flex">
				{#if entry.log}
					<button
						type="button"
						onclick={() => onShowTimeline(entry)}
						class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
					>
						<SquareStack class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		</td>
	</tr>
{/snippet}

<div class="mt-1 transition-opacity duration-300" class:opacity-50={isLoading}>
	<div class="mb-2 flex text-sm font-semibold text-slate-400">
		{$_('leaderboard.title')}
	</div>
	{#if entries.length === 0 && !isLoading}
		<p class="py-2 text-xs text-slate-500">{$_('leaderboard.noScores')}</p>
	{:else if entries.length > 0}
		<!-- Extract the myEntry logic -->
		{@const myIndex = entries.findIndex((e) => e.is_me)}
		{@const hasMyEntryOutsideTop5 = myIndex > 4}

		<table class="w-full table-fixed border-separate border-spacing-y-1 text-left text-xs">
			{@render tableColgroup()}

			<!-- Top 5 are always visible -->
			<tbody>
				{#each entries.slice(0, 5) as entry, i (i)}
					{@render leaderboardRow(entry)}
				{/each}
			</tbody>

			{#if hasMyEntryOutsideTop5}
				<!-- TOP DRAWER: Animates in rows between rank 5 and myEntry -->
				{#if showExpanded && myIndex > 5}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(5, myIndex) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}

				<!-- Pinned myEntry: Never leaves the DOM, avoiding jump jank completely -->
				<tbody>
					{@render leaderboardRow(entries[myIndex])}
				</tbody>

				<!-- BOTTOM DRAWER: Animates in rows after myEntry -->
				{#if showExpanded && myIndex < entries.length - 1}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(myIndex + 1) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}
			{:else}
				<!-- Fallback: Standard expansion if myEntry is in Top 5 (or doesn't exist) -->
				{#if showExpanded && entries.length > 5}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(5) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}
			{/if}
		</table>

		{#if entries.length > 5}
			<button
				type="button"
				onclick={() => (showExpanded = !showExpanded)}
				class="mx-auto mt-1 flex cursor-pointer items-center justify-center rounded-md px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-400"
			>
				{#if showExpanded}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
			</button>
		{/if}
	{/if}
</div>
