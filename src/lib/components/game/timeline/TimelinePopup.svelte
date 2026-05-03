<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _, locale } from 'svelte-i18n';
	import type { Track } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatYearRange } from '$lib/utils';

	interface Props {
		visible?: boolean;
		playerName: string;
		score: number;
		timestamp?: string;
		tracks: Track[];
		onClose?: () => void;
	}

	let {
		visible = false,
		playerName,
		score,
		timestamp,
		tracks,
		onClose = () => {}
	}: Props = $props();

	let inspectTrack = $state<Track | null>(null);

	const entries = $derived<TimelineEntry[]>(
		tracks.map((track, i) => ({
			id: `saved-${i}`,
			track,
			confirmed: true,
			correct: null
		}))
	);

	function formatEntryDate(ts: string | undefined, loc: string): string {
		if (!ts) return '';
		const d = new Date(ts.includes('T') ? ts : ts.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(loc, { year: 'numeric', month: 'numeric', day: 'numeric' });
	}

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});
</script>

<Popup {visible} {onClose} width="5xl">
	<div class="flex flex-col gap-6">
		<div class="text-center">
			<div class="flex flex-col items-center gap-1">
				<h2 class="text-2xl font-bold text-white">{playerName}</h2>
				<div class="flex items-center gap-3 text-sm font-medium text-slate-400">
					<span class="text-cyan-400">{$_('scoring.pts', { values: { points: score.toLocaleString() } })}</span>
					{#if timestamp}
						<span class="text-slate-600">|</span>
						<span class="tabular-nums">{formatEntryDate(timestamp, $locale || 'en')}</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="flex justify-center">
			<PlayerTimeline
				{playerName}
				playerColor="#22d3ee"
				{entries}
				active={false}
				compact={false}
				acceptingDrop={false}
				onConfirmedCardClick={(entry) => (inspectTrack = entry.track)}
			/>
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
				<TrackInfo track={inspectTrack} bleed="sm" />
			</div>
		</div>
	{/if}
</Popup>
