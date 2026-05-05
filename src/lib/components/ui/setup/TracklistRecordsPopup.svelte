<script lang="ts">
	import { SquareStack } from 'lucide-svelte';
	import { _ } from 'svelte-i18n';
	import type { LeaderboardEntry, Tracklist } from '$lib/types';
	import { tracklistDisplayName } from '$lib/data/defaultTracklists';
	import { formatDateString } from '$lib/utils';
	import Flag from '../primitives/Flag.svelte';
	import Popup from '../primitives/Popup.svelte';

	interface Props {
		visible: boolean;
		entries: LeaderboardEntry[];
		currentLocale: string;
		isLoading?: boolean;
		tracklists: Tracklist[];
		onClose: () => void;
		onShowTimeline?: (entry: LeaderboardEntry) => void;
	}

	let {
		visible,
		entries,
		currentLocale,
		isLoading = false,
		tracklists,
		onClose,
		onShowTimeline = () => {}
	}: Props = $props();

	function getTracklist(tracklistId: string | undefined): Tracklist | undefined {
		return tracklists.find((t) => t.id === tracklistId);
	}

	function getTracklistLabel(
		tracklist: Tracklist | undefined,
		tracklistId: string | undefined
	): string {
		return tracklist ? tracklistDisplayName(tracklist, $_) : (tracklistId ?? '');
	}
</script>

<Popup {visible} {onClose} width="xl">
	<h2 class="mb-5 pr-10 text-left text-2xl font-bold text-cyan-400">
		{$_('leaderboard.tracklistRecordsTitle')}
	</h2>

	{#if isLoading && entries.length === 0}
		<p class="py-6 text-center text-sm text-slate-500">{$_('leaderboard.loading')}</p>
	{:else if entries.length === 0}
		<p class="py-6 text-center text-sm text-slate-500">
			{$_('leaderboard.tracklistRecordsNoScores')}
		</p>
	{:else}
		<div class="max-h-[65vh] overflow-x-auto overflow-y-auto">
			<table
				class="w-full table-auto border-separate border-spacing-y-2 text-left text-xs md:text-sm"
			>
				<colgroup>
					<col />
					<col />
					<col />
					<col />
					<col />
				</colgroup>
				<tbody>
					{#each entries as entry, i (`${entry.tracklist_id}:${entry.target}:${i}`)}
						{@const tracklist = getTracklist(entry.tracklist_id)}
						<tr>
							<td class="pr-3 whitespace-nowrap text-slate-500 tabular-nums">
								{formatDateString(entry.timestamp, currentLocale)}
							</td>
							<td class="pr-3 whitespace-nowrap text-slate-300">
								<span class="inline-flex max-w-64 items-center gap-0.5 align-middle">
									{#if tracklist?.icon}
										<span class="shrink-0 text-slate-400 [&_svg]:h-3.5 [&_svg]:w-3.5">
											{@html tracklist.icon}
										</span>
									{/if}
									<span class="truncate">{getTracklistLabel(tracklist, entry.tracklist_id)}</span>
									<span class="shrink-0 text-slate-500 tabular-nums">({entry.target})</span>
								</span>
							</td>
							<td
								class="pr-3"
								class:text-cyan-300={entry.is_me}
								class:text-slate-300={!entry.is_me && entry.player_name}
								class:text-slate-500={!entry.is_me && !entry.player_name}
							>
								<Flag country={entry.country} class="mr-0.5" faded={!entry.player_name} />
								{entry.player_name ?? $_('leaderboard.anonymous')}
							</td>
							<td class="pr-3 text-right font-bold text-cyan-400 tabular-nums">
								{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}
							</td>
							<td>
								{#if entry.log}
									<button
										type="button"
										onclick={() => onShowTimeline(entry)}
										class="flex cursor-pointer items-center justify-center rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-cyan-400"
										title={$_('leaderboard.showTimeline')}
										aria-label={$_('leaderboard.showTimeline')}
									>
										<SquareStack class="h-3.5 w-3.5" />
									</button>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</Popup>
