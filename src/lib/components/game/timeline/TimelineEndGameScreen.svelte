<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import type { Player, Track } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatYearRange } from '$lib/utils';

	interface FinalTimeline {
		player: Player;
		entries: TimelineEntry[];
	}

	interface Props {
		visible?: boolean;
		cardsToWin: number;
		timelines: FinalTimeline[];
		onHome?: () => void;
		onPlayAgain?: () => void;
	}

	let {
		visible = false,
		cardsToWin,
		timelines,
		onHome = () => {},
		onPlayAgain = () => {}
	}: Props = $props();

	let inspectTrack = $state<Track | null>(null);

	const winner = $derived(
		timelines
			.filter((t) => t.entries.length >= cardsToWin)
			.sort((a, b) => b.entries.length - a.entries.length)[0]?.player ?? null
	);

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});
</script>

<Popup {visible} onClose={() => {}} width="5xl" padding="lg" showCloseButton={false}>
	<div class="flex flex-col gap-6">
		<div class="text-center">
			<h2 class="text-4xl font-bold text-cyan-400">{$_('timeline.gameOver')}</h2>
			{#if winner}
				<p class="mt-2 text-lg text-slate-300">
					{$_('timeline.winner', { values: { name: winner.name } })}
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
						active={true}
						compact={false}
						acceptingDrop={false}
						onConfirmedCardClick={(entry) => (inspectTrack = entry.track)}
					/>
				</div>
			{/each}
		</div>

		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			<button
				type="button"
				onclick={onPlayAgain}
				class="rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 font-bold text-cyan-400 transition-all hover:bg-slate-800 hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] active:scale-95"
			>
				{$_('game.playAgain')}
			</button>
			<button
				type="button"
				onclick={onHome}
				class="rounded-xl border-2 border-slate-600 bg-slate-900 px-6 py-3 font-bold text-slate-200 transition-all hover:bg-slate-800 active:scale-95"
			>
				{$_('game.home')}
			</button>
		</div>
	</div>
</Popup>

<Popup
	visible={!!inspectTrack}
	onClose={() => (inspectTrack = null)}
	width="6xl"
	padding="lg"
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
				<TrackInfo track={inspectTrack} showUpsideDown={false} />
			</div>
		</div>
	{/if}
</Popup>
