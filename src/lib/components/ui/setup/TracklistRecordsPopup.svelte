<script lang="ts">
	import { ArrowUpDown, Check, SquareStack } from 'lucide-svelte';
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
		onSelectRecord?: (tracklist: Tracklist, target: number) => void;
	}

	let {
		visible,
		entries,
		currentLocale,
		isLoading = false,
		tracklists,
		onClose,
		onShowTimeline = () => {},
		onSelectRecord = () => {}
	}: Props = $props();

	type SortMode = 'date' | 'tracklist' | 'country' | 'points';

	let sortMode = $state<SortMode>('date');
	let showSortMenu = $state(false);

	const sortOptions: SortMode[] = ['date', 'tracklist', 'country', 'points'];
	const tracklistGroupOrder = [
		'difficulty',
		'categories',
		'composers',
		'eras',
		'countries',
		'custom'
	];

	const sortedEntries = $derived.by(() => {
		return [...entries].sort((a, b) => {
			switch (sortMode) {
				case 'tracklist': {
					const aTracklist = getTracklist(a.tracklist_id);
					const bTracklist = getTracklist(b.tracklist_id);
					const aLabel = getTracklistLabel(aTracklist, a.tracklist_id);
					const bLabel = getTracklistLabel(bTracklist, b.tracklist_id);
					const groupCompare =
						getTracklistGroupRank(aTracklist) - getTracklistGroupRank(bTracklist);
					const indexCompare =
						getTracklistIndex(a.tracklist_id) - getTracklistIndex(b.tracklist_id);
					const labelCompare = aLabel.localeCompare(bLabel, currentLocale);
					return (
						groupCompare || indexCompare || labelCompare || a.target - b.target || b.score - a.score
					);
				}
				case 'country':
					return (
						(a.country ?? '').localeCompare(b.country ?? '', currentLocale) ||
						b.score - a.score ||
						a.rank - b.rank
					);
				case 'points':
					return b.score - a.score || a.rank - b.rank;
				case 'date':
				default:
					return a.rank - b.rank;
			}
		});
	});

	function getTracklist(tracklistId: string | undefined): Tracklist | undefined {
		return tracklists.find((t) => t.id === tracklistId);
	}

	function getTracklistGroupRank(tracklist: Tracklist | undefined): number {
		const category = tracklist?.category ?? 'custom';
		const rank = tracklistGroupOrder.indexOf(category);
		return rank === -1 ? tracklistGroupOrder.length : rank;
	}

	function getTracklistIndex(tracklistId: string | undefined): number {
		const index = tracklists.findIndex((t) => t.id === tracklistId);
		return index === -1 ? Number.MAX_SAFE_INTEGER : index;
	}

	function getTracklistLabel(
		tracklist: Tracklist | undefined,
		tracklistId: string | undefined
	): string {
		return tracklist ? tracklistDisplayName(tracklist, $_) : (tracklistId ?? '');
	}

	function getSortLabel(mode: SortMode): string {
		return $_(`leaderboard.tracklistRecordsSort.${mode}`);
	}
</script>

<Popup {visible} {onClose} width="xl">
	<div class="mb-5 flex items-start justify-between gap-3 pr-10">
		<h2 class="text-left text-2xl font-bold text-cyan-400">
			{$_('leaderboard.tracklistRecordsTitle')}
		</h2>
		<div class="relative shrink-0">
			<button
				type="button"
				onclick={() => (showSortMenu = !showSortMenu)}
				class="flex h-9 items-center gap-1.5 rounded-md border border-cyan-400/20 bg-slate-950/60 px-2.5 text-xs font-semibold text-cyan-400 transition-colors hover:border-cyan-400/40 hover:bg-slate-800"
				aria-label={$_('leaderboard.tracklistRecordsSort.label')}
				title={$_('leaderboard.tracklistRecordsSort.label')}
			>
				<ArrowUpDown class="h-3.5 w-3.5" />
				<span>{getSortLabel(sortMode)}</span>
			</button>
			{#if showSortMenu}
				<div
					class="absolute right-0 z-10 mt-1 min-w-36 rounded-md border border-cyan-400/20 bg-slate-950 py-1 shadow-lg"
				>
					{#each sortOptions as option (option)}
						<button
							type="button"
							onclick={() => {
								sortMode = option;
								showSortMenu = false;
							}}
							class="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-slate-300 transition-colors hover:bg-slate-800 hover:text-cyan-300"
						>
							<span>{getSortLabel(option)}</span>
							{#if sortMode === option}
								<Check class="h-3.5 w-3.5 text-cyan-400" />
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

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
					{#each sortedEntries as entry, i (`${entry.tracklist_id}:${entry.target}:${i}`)}
						{@const tracklist = getTracklist(entry.tracklist_id)}
						<tr>
							<td class="pr-3 whitespace-nowrap text-slate-500 tabular-nums">
								{formatDateString(entry.timestamp, currentLocale)}
							</td>
							<td class="pr-3 whitespace-nowrap text-slate-300">
								{#if tracklist}
									<button
										type="button"
										onclick={() => onSelectRecord(tracklist, entry.target)}
										class="inline-flex max-w-64 cursor-pointer items-center gap-0.5 text-left align-middle transition-colors hover:text-cyan-300"
									>
										{#if tracklist.icon}
											<span class="shrink-0 text-slate-400 [&_svg]:h-3.5 [&_svg]:w-3.5">
												{@html tracklist.icon}
											</span>
										{/if}
										<span class="truncate underline decoration-cyan-400/30 underline-offset-2">
											{getTracklistLabel(tracklist, entry.tracklist_id)}
										</span>
										<span class="shrink-0 text-slate-500 tabular-nums">({entry.target})</span>
									</button>
								{:else}
									<span class="inline-flex max-w-64 items-center gap-0.5 align-middle">
										<span class="truncate">{getTracklistLabel(tracklist, entry.tracklist_id)}</span>
										<span class="shrink-0 text-slate-500 tabular-nums">({entry.target})</span>
									</span>
								{/if}
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
							<td
								class="pr-3 text-right font-bold tabular-nums"
								class:text-cyan-300={entry.is_me}
								class:text-slate-300={!entry.is_me}
							>
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
