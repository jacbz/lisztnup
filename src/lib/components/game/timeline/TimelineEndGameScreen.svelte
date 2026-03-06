<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import type { Player, Track } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatYearRange } from '$lib/utils';
	import Home from 'lucide-svelte/icons/home';

	interface FinalTimeline {
		player: Player;
		entries: TimelineEntry[];
	}

	interface Props {
		visible?: boolean;
		cardsToWin: number;
		timelines: FinalTimeline[];
		tracksExhausted?: boolean;
		onHome?: () => void;
	}

	let {
		visible = false,
		cardsToWin,
		timelines,
		tracksExhausted = false,
		onHome = () => {}
	}: Props = $props();

	let inspectTrack = $state<Track | null>(null);

	// Winner: player who reached cardsToWin, or if tracks exhausted, player with most cards
	const winner = $derived.by(() => {
		// First check for a player who reached the target
		const targetWinner = timelines
			.filter((t) => t.entries.length >= cardsToWin)
			.sort((a, b) => b.entries.length - a.entries.length)[0]?.player;
		if (targetWinner) return targetWinner;

		// If tracks exhausted, find the leader(s)
		if (tracksExhausted && timelines.length > 0) {
			const sorted = [...timelines].sort((a, b) => b.entries.length - a.entries.length);
			const maxCards = sorted[0].entries.length;
			const leaders = sorted.filter((t) => t.entries.length === maxCards);
			// Only declare a winner if there's a single leader
			if (leaders.length === 1) return leaders[0].player;
		}

		return null;
	});

	const isDraw = $derived(
		tracksExhausted &&
			!winner &&
			timelines.length > 1 &&
			(() => {
				const sorted = [...timelines].sort((a, b) => b.entries.length - a.entries.length);
				return sorted.length >= 2 && sorted[0].entries.length === sorted[1].entries.length;
			})()
	);

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});
</script>

<Popup {visible} onClose={() => {}} width="5xl" showCloseButton={false}>
	<div class="flex flex-col gap-6">
		<div class="text-center">
			<h2 class="text-4xl font-bold text-cyan-400">{$_('endGame.title')}</h2>
			{#if tracksExhausted}
				<p class="mt-1 text-sm text-slate-400">{$_('endGame.noMoreTracks')}</p>
			{/if}
			{#if winner}
				<p class="mt-2 text-lg text-slate-300">
					{$_('endGame.winner', { values: { name: winner.name } })}
				</p>
			{:else if isDraw}
				<p class="mt-2 text-lg text-slate-300">
					{$_('endGame.tie')}
				</p>
			{/if}
		</div>

		<div class="-my-4 max-h-[50vh] space-y-4 overflow-y-auto px-2 py-8">
			{#each timelines as t (t.player.name)}
				<div class="flex justify-center">
					<PlayerTimeline
						playerName={t.player.name}
						playerColor={t.player.color}
						entries={t.entries}
						active={false}
						compact={false}
						acceptingDrop={false}
						onConfirmedCardClick={(entry) => (inspectTrack = entry.track)}
					/>
				</div>
			{/each}
		</div>

		<div class="flex flex-col gap-3">
			<button
				type="button"
				onclick={onHome}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3.5 text-base font-bold text-cyan-400 transition-all duration-200 hover:border-cyan-400 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
			>
				<Home class="h-5 w-5" />
				{$_('endGame.home')}
			</button>
		</div>
	</div>
</Popup>

<Popup
	visible={!!inspectTrack}
	onClose={() => (inspectTrack = null)}
	width="6xl"
	borderColor="border-cyan-400"
>
	{#if inspectTrack}
		<div class="flex h-full w-full flex-col gap-5">
			<div class="text-center text-5xl font-black tracking-wide text-slate-200">
				{revealYearText}
			</div>
			<div
				class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4"
			>
				<TrackInfo track={inspectTrack} showMirror={false} bleed="sm" />
			</div>
		</div>
	{/if}
</Popup>
