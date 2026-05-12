<script lang="ts">
	import { tick } from 'svelte';
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import Flag from '$lib/components/ui/primitives/Flag.svelte';
	import { _, locale } from 'svelte-i18n';
	import type { Track } from '$lib/models';
	import type { TimelineReplayLog, TimelineReplayTurn } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatDateString, formatYearRange } from '$lib/utils';
	import Flame from 'lucide-svelte/icons/flame';
	import { get } from 'svelte/store';
	import { getStreakTextStyle, getStreakGlow } from '$lib/logic/timelineMotion';
	import { Zap } from 'lucide-svelte';

	const REPLAY_STEP_WIDTH_REM = 2.25;

	interface ReplayTrack extends Track {
		isMissing?: boolean;
	}

	interface Props {
		visible?: boolean;
		playerName: string;
		country?: string | null;
		score: number;
		attempts?: number;
		averageTime?: number | null;
		longestStreak?: number | null;
		timestamp?: string;
		tracks: Track[];
		log?: TimelineReplayLog | null;
		onClose?: () => void;
	}

	let {
		visible = false,
		playerName,
		country,
		score,
		attempts = 0,
		averageTime = null,
		longestStreak = null,
		timestamp,
		tracks,
		log = null,
		onClose = () => {}
	}: Props = $props();

	let inspectTrack = $state<ReplayTrack | null>(null);
	let inspectDisplayYear = $state<number | null>(null);
	let selectedStep = $state(0);
	let touchedSlider = $state(false);
	let sliderOpenKey = $state(0);
	let timelineEl: HTMLDivElement | null = $state(null);
	let finalTimelineWidth = $state(0);
	let sliderOpenCounter = 0;
	let wasVisible = false;
	let measureTimelineTimeout: ReturnType<typeof setTimeout> | null = null;

	const turns = $derived<TimelineReplayTurn[]>(
		Array.isArray(log?.turns) ? log.turns.filter(isReplayTurn) : []
	);
	const maxStep = $derived(turns.length);
	const correctCount = $derived(turns.filter((turn) => turn.ok).length);
	const accuracyPercent = $derived(attempts > 0 ? Math.round((correctCount / attempts) * 100) : 0);
	const resolvedTracks = $derived(tracks.filter(isResolvedTrack));
	const trackByPart = $derived(
		new Map(resolvedTracks.map((track) => [track.part.gid, track] as const))
	);
	const replaySteps = $derived(range(turns.length + 1));

	const entries = $derived<TimelineEntry[]>(
		log ? buildReplayEntries(log, selectedStep, touchedSlider) : buildFinalEntries()
	);

	$effect(() => {
		if (visible && !wasVisible) {
			wasVisible = true;
			selectedStep = maxStep;
			touchedSlider = false;
			sliderOpenKey = ++sliderOpenCounter;
			finalTimelineWidth = 0;
			if (measureTimelineTimeout) clearTimeout(measureTimelineTimeout);
			measureTimelineTimeout = setTimeout(measureVisibleTimelineWidth, 320);
		} else if (!visible) {
			wasVisible = false;
			finalTimelineWidth = 0;
			if (measureTimelineTimeout) {
				clearTimeout(measureTimelineTimeout);
				measureTimelineTimeout = null;
			}
		}
	});

	const formatEntryDate = formatDateString;

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		if (inspectDisplayYear !== null) return String(inspectDisplayYear);
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});

	function buildFinalEntries(): TimelineEntry[] {
		return resolvedTracks.map((track, i) => ({
			id: `saved-${i}`,
			track,
			confirmed: true,
			correct: null
		}));
	}

	function isResolvedTrack(track: Track | null | undefined): track is Track {
		return !!track?.part?.gid && !!track.work;
	}

	function isReplayTurn(turn: unknown): turn is TimelineReplayTurn {
		if (!turn || typeof turn !== 'object') return false;
		const candidate = turn as Partial<TimelineReplayTurn>;
		return (
			typeof candidate.part === 'string' &&
			(candidate.index === null || typeof candidate.index === 'number') &&
			typeof candidate.ok === 'boolean' &&
			(candidate.seconds === null || typeof candidate.seconds === 'number') &&
			typeof candidate.points === 'number' &&
			typeof candidate.streakMult === 'number'
		);
	}

	async function measureVisibleTimelineWidth() {
		await tick();
		requestAnimationFrame(() => {
			finalTimelineWidth = timelineEl?.getBoundingClientRect().width ?? 0;
		});
	}

	function insertAt<T>(items: T[], index: number | null, item: T) {
		const bounded = Math.max(0, Math.min(index ?? items.length, items.length));
		items.splice(bounded, 0, item);
	}

	function buildReplayEntries(replay: TimelineReplayLog, step: number, showFinalBorder: boolean) {
		let initialTrack = replay.initial ? trackByPart.get(replay.initial) : null;
		if (!initialTrack && replay.initial) {
			initialTrack = createMissingTrack(replay.initial, replay.initialYear);
		}

		const result: TimelineEntry[] = initialTrack
			? [
					{
						id: `initial-${initialTrack.part.gid}`,
						track: initialTrack,
						confirmed: true,
						correct: null,
						displayYear: getReplayDisplayYear(initialTrack, replay.initialYear)
					}
				]
			: [];

		for (let i = 0; i < Math.min(step, turns.length); i++) {
			const turn = turns[i];
			let track = trackByPart.get(turn.part);
			if (!track) {
				if (turn.year !== undefined) {
					track = createMissingTrack(turn.part, turn.year);
				} else {
					continue;
				}
			}

			const isActiveStep = i === step - 1;
			if (turn.ok) {
				insertAt(result, turn.index, {
					id: `turn-${i}-${turn.part}`,
					track,
					confirmed: true,
					correct: isActiveStep && (step < turns.length || showFinalBorder) ? true : null,
					displayYear: getReplayDisplayYear(track, turn.year)
				});
			} else if (isActiveStep && turn.index !== null) {
				insertAt(result, turn.index, {
					id: `turn-${i}-${turn.part}`,
					track,
					confirmed: true,
					correct: false,
					displayYear: getReplayDisplayYear(track, turn.year)
				});
			}
		}

		return result;
	}

	function createMissingTrack(gid: string, year: number): ReplayTrack {
		return {
			part: { gid, name: '?', deezer: [], score: 0 },
			work: { gid: '?', name: '?', begin_year: year, end_year: year },
			composer: { name: '?', birth_year: 0, death_year: 0 },
			isMissing: true
		} as unknown as ReplayTrack;
	}

	function getReplayDisplayYear(track: Track, logYear: number | undefined): number | undefined {
		if (track.work.begin_year !== null || track.work.end_year !== null) return undefined;
		return typeof logYear === 'number' && Number.isFinite(logYear) ? logYear : undefined;
	}

	function stepTimeLabel(turn: TimelineReplayTurn): string {
		return turn.seconds === null
			? ''
			: $_('timeline.secondsShort', { values: { seconds: turn.seconds.toFixed(1) } });
	}

	function replayStepLabel(step: number): string {
		return get(_)('timeline.replayStep', { values: { step } });
	}

	function range(length: number): number[] {
		return Array.from(Array(length).keys());
	}

	function pointWeight(turn: TimelineReplayTurn): number {
		const p = Math.abs(turn.points);
		let weight: number;
		if (p <= 100) {
			weight = 300;
		} else if (p <= 1200) {
			weight = 300 + Math.round(((p - 100) / 1100) * 200);
		} else {
			const magnitude = Math.min(p, 6000);
			weight = 500 + Math.round(((magnitude - 1200) / 4800) * 400);
		}

		// Ensure wrong turns are readable even with low consolation points
		if (!turn.ok) {
			weight = Math.max(weight, 500);
		}
		return weight;
	}

	function pointClass(turn: TimelineReplayTurn): string {
		if (turn.ok && turn.streakMult >= 1.35) return '';
		return turn.points > 0 ? 'text-cyan-300' : 'text-slate-500';
	}

	function getTurnStreakStyle(turn: TimelineReplayTurn): string {
		if (turn.streakMult < 1.35) return '';
		const glow = getStreakGlow(turn.streakMult, false);
		const color = getStreakTextStyle(turn.streakMult);
		return `${color} ${glow ? `text-shadow: ${glow};` : ''}`;
	}

	function pointStyle(turn: TimelineReplayTurn): string {
		const color = turn.ok && turn.streakMult >= 1.35 ? getStreakTextStyle(turn.streakMult) : '';
		return `${color} font-weight: ${pointWeight(turn)};`;
	}

	function stepCircleClass(step: number): string {
		const isSelected = selectedStep === step;
		const isPastOrSelected = selectedStep >= step;
		const glow = isSelected ? 'shadow-[0_0_10px_rgba(34,211,238,0.5)]' : '';
		const fill = isPastOrSelected ? stepCircleFillClass(step) : 'bg-slate-950';

		if (step === 0) return `border-slate-600 ${fill} ${glow}`;
		if (step === turns.length) return `border-amber-400 ${fill} ${glow}`;
		return `${turns[step - 1]?.ok ? 'border-green-400' : 'border-red-400'} ${fill} ${glow}`;
	}

	function stepCircleFillClass(step: number): string {
		if (step === 0) return 'bg-slate-600';
		if (step === turns.length) return 'bg-amber-400';
		return turns[step - 1]?.ok ? 'bg-green-400' : 'bg-red-400';
	}

	const sliderProgress = $derived(maxStep > 0 ? (selectedStep / maxStep) * 100 : 0);
</script>

<Popup {visible} {onClose} width="auto">
	<div class="flex flex-col gap-6">
		<div class="text-center">
			<div class="flex flex-col items-center gap-1">
				<h2 class="flex items-center gap-3 text-2xl font-bold text-white">
					<Flag {country} size="md" />
					{playerName}
				</h2>
				<div class="flex items-center gap-3 text-sm font-medium text-slate-400">
					<span class="text-cyan-400"
						>{$_('scoring.pts', { values: { points: score.toLocaleString() } })}</span
					>
					{#if timestamp}
						<span class="text-slate-600">|</span>
						<span class="tabular-nums">{formatEntryDate(timestamp, $locale || 'en')}</span>
					{/if}
				</div>
				<div
					class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400"
				>
					{#if attempts > 0}
						<span>
							{$_('timeline.accuracy', {
								values: {
									correct: correctCount,
									total: attempts,
									percentage: accuracyPercent
								}
							})}
						</span>
					{/if}
					{#if averageTime !== null}
						<span class="flex items-center gap-1 tabular-nums">
							<Zap class="h-3 w-3 text-cyan-400/80" />
							{$_('timeline.averageTime', { values: { seconds: averageTime.toFixed(1) } })}
						</span>
					{/if}
					{#if longestStreak}
						<span class="flex items-center gap-0.5 text-orange-400/80">
							<Flame class="h-3 w-3" />
							{$_('timeline.longestStreak', { values: { count: longestStreak } })}
						</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="relative flex justify-center">
			<PlayerTimeline
				{playerName}
				playerColor="#22d3ee"
				{entries}
				active={false}
				compact={false}
				acceptingDrop={false}
				hideCount={true}
				hideHeader={true}
				animateCards={touchedSlider}
				fixedWidth={finalTimelineWidth}
				bindEl={(el) => (timelineEl = el)}
				onConfirmedCardClick={(entry) => {
					inspectTrack = entry.track;
					inspectDisplayYear = entry.displayYear ?? null;
				}}
			/>
		</div>

		{#if log && turns.length > 0}
			<div
				class="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto overflow-y-visible px-2 pt-0 md:-mx-8 md:max-w-[calc(100%+4rem)] md:px-4"
				style="touch-action: pan-x;"
			>
				<div
					class="relative min-w-full"
					style="--step-count: {turns.length + 1}; width: max(100%, {(turns.length + 1) *
						REPLAY_STEP_WIDTH_REM}rem);"
				>
					<div
						class="grid items-end"
						style="grid-template-columns: repeat({turns.length + 1}, minmax(2.25rem, 1fr));"
					>
						<div></div>
						{#each turns as turn, i (i)}
							<div
								class="flex flex-col justify-end text-center text-[11px] leading-none tabular-nums"
							>
								<div
									class="relative flex flex-col items-center justify-end gap-0.5 {pointClass(turn)}"
									style={pointStyle(turn)}
								>
									{#if turn.ok && turn.streakMult >= 1.35}
										<div class="flex items-center">
											<Flame class="h-2.5 w-2.5 shrink-0" />
											<span
												class="text-[10px] font-bold tracking-tighter tabular-nums"
												style={getTurnStreakStyle(turn)}>{turn.streakMult.toFixed(2)}×</span
											>
										</div>
									{/if}
									<span>+{turn.points.toLocaleString()}</span>
								</div>
								{#if i === turns.length - 1 && log.completionBonus > 0}
									<div class="font-bold text-amber-400">
										+{log.completionBonus.toLocaleString()}
									</div>
								{/if}
							</div>
						{/each}
					</div>

					{#key sliderOpenKey}
						<div class="relative mt-1 h-5">
							<div
								class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-700/80"
								style="left: calc(50% / var(--step-count)); right: calc(50% / var(--step-count));"
							>
								<div
									class="h-full rounded-full bg-cyan-400/70 shadow-[0_0_14px_rgba(34,211,238,0.45)] transition-[width] ease-out {touchedSlider
										? 'duration-200'
										: 'duration-1000'}"
									style="width: {touchedSlider ? sliderProgress : 100}%; animation: {touchedSlider
										? 'none'
										: 'replay-rail-fill 1000ms ease-out both'}; transform-origin: left;"
								></div>
							</div>
							<div
								class="absolute inset-0 grid items-center"
								style="grid-template-columns: repeat({turns.length + 1}, minmax(2.25rem, 1fr));"
							>
								{#each replaySteps as i (i)}
									<button
										type="button"
										onclick={() => {
											selectedStep = i;
											touchedSlider = true;
										}}
										class="relative z-10 flex h-5 cursor-pointer items-center justify-center"
										aria-label={replayStepLabel(i)}
									>
										<span class="h-3 w-3 rounded-full border-2 transition-all {stepCircleClass(i)}"
										></span>
									</button>
								{/each}
							</div>
							<input
								type="range"
								min="0"
								max={maxStep}
								step="1"
								bind:value={selectedStep}
								oninput={() => (touchedSlider = true)}
								aria-label={replayStepLabel(selectedStep)}
								class="replay-step-range absolute inset-0 z-20 h-5 w-full cursor-pointer opacity-0"
							/>
						</div>
					{/key}

					<div
						class="mt-2 grid items-start"
						style="grid-template-columns: repeat({turns.length + 1}, minmax(2.25rem, 1fr));"
					>
						<div></div>
						{#each turns as turn, i (turn.part + '-' + i)}
							<div
								class="min-h-4 text-center text-[11px] leading-tight text-slate-400 tabular-nums"
							>
								<div>{stepTimeLabel(turn)}</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</Popup>

<Popup
	visible={!!inspectTrack}
	onClose={() => {
		inspectTrack = null;
		inspectDisplayYear = null;
	}}
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
				{#if inspectTrack.isMissing}
					<div class="flex h-full flex-col items-center justify-center gap-4 text-center">
						<div class="max-w-md text-xl font-medium text-slate-400">
							{$_('timeline.trackMissing')}
						</div>
					</div>
				{:else}
					<TrackInfo track={inspectTrack} showMirror={false} bleed="sm" fixedWidth={true} />
				{/if}
			</div>
		</div>
	{/if}
</Popup>

<style>
	@keyframes replay-rail-fill {
		from {
			transform: scaleX(0);
		}
		to {
			transform: scaleX(1);
		}
	}

	@media (pointer: coarse) {
		.replay-step-range {
			pointer-events: none;
		}
	}
</style>
