<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Scroll from 'lucide-svelte/icons/scroll';
	import { SquareStack } from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import Flag from '../primitives/Flag.svelte';
	import { getPlayerToken } from '$lib/stores/identity';
	import { resolveTimelineTracks } from '$lib/utils/search';
	import { gameData } from '$lib/stores/gameData';
	import { get } from 'svelte/store';
	import TimelinePopup from '$lib/components/game/timeline/TimelinePopup.svelte';
	import type { LeaderboardEntry, Track } from '$lib/types';

	interface Props {
		tracklistId?: string;
		cardsToWin: number;
		currentLocale: string;
		enabled?: boolean;
	}

	let {
		tracklistId,
		cardsToWin,
		currentLocale,
		enabled = true
	}: Props = $props();

	let entries = $state<LeaderboardEntry[]>([]);
	let isLoading = $state(false);
	let showExpanded = $state(false);
	let showTimelinePopup = $state(false);
	let timelineTracks = $state<Track[]>([]);
	let timelinePlayerName = $state('');
	let timelineCountry = $state<string | undefined>();
	let timelineScore = $state(0);
	let timelineTimestamp = $state<string | undefined>();

	$effect(() => {
		if (!enabled || !browser || !tracklistId) {
			entries = [];
			isLoading = false;
			return;
		}
		isLoading = true;
		const limit = showExpanded ? 20 : 6;
		const parts = [
			`limit=${limit}`,
			`tracklist=${encodeURIComponent(tracklistId)}`,
			`cardsToWin=${encodeURIComponent(cardsToWin)}`,
			`token=${encodeURIComponent(getPlayerToken())}`
		];
		fetch(`/api/game/leaderboard?${parts.join('&')}`)
			.then((res) => (res.ok ? res.json() : { entries: [] }))
			.then((data) => {
				entries = data.entries ?? [];
			})
			.catch(() => {
				entries = [];
			})
			.finally(() => {
				isLoading = false;
			});
	});

	function handleShowTimeline(entry: LeaderboardEntry) {
		if (!entry.timeline || entry.timeline === '[]') return;
		try {
			const gids = JSON.parse(entry.timeline) as [string, string][];
			const data = get(gameData);
			if (data && gids.length > 0) {
				timelineTracks = resolveTimelineTracks(data, gids);
				timelinePlayerName = entry.player_name || $_('leaderboard.anonymous');
				timelineCountry = entry.country ?? undefined;
				timelineScore = entry.score;
				timelineTimestamp = entry.timestamp;
				showTimelinePopup = true;
			}
		} catch (e) {
			console.error('Failed to parse timeline', e);
		}
	}

	function formatEntryDate(timestamp: string | undefined, locale: string): string {
		if (!timestamp) return '';
		const d = new Date(timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
	}
</script>

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
				<span
					class="mr-2 text-center font-bold"
					class:text-cyan-400={entry.is_me}
					class:text-slate-500={!entry.is_me}
				>
					{i + 1}
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
							onclick={() => handleShowTimeline(entry)}
							class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
						>
							<SquareStack class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
			{/each}
		</div>
		{#if showExpanded && entries.length > 5}
			<div transition:slide={{ duration: 200 }}>
				<div class="mt-1 grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-[clamp(0.375rem,1.5vw,1.5rem)] gap-y-1 text-xs text-left">
					{#each entries.slice(5) as entry, i (i)}
						<span
							class="mr-2 text-center font-bold"
							class:text-cyan-400={entry.is_me}
							class:text-slate-500={!entry.is_me}
						>
							{i + 6}
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
						<span class="text-right">
							{#if entry.timeline && entry.timeline !== '[]'}
								<button
									type="button"
									onclick={() => handleShowTimeline(entry)}
									class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
								>
									<Scroll class="h-3.5 w-3.5" />
								</button>
							{/if}
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

<TimelinePopup
	visible={showTimelinePopup}
	playerName={timelinePlayerName}
	country={timelineCountry}
	score={timelineScore}
	timestamp={timelineTimestamp}
	tracks={timelineTracks}
	onClose={() => (showTimelinePopup = false)}
/>
