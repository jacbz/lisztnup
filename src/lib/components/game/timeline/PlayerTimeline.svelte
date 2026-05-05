<script lang="ts">
	import type { Track } from '$lib/models';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import { _ } from 'svelte-i18n';
	import { formatYearRange } from '$lib/utils';
	import TimelineCard from './TimelineCard.svelte';
	import Flame from 'lucide-svelte/icons/flame';
	import { STREAK_THRESHOLD } from '$lib/logic/timelineGame.svelte';
	import { calculateStreakMult } from '$lib/logic/timelineScoring';
	import {
		discardTimelineCard,
		flyTimelineCardFromCenter,
		getStreakGlow,
		rotateVector,
		timelineCardDiscardStyle,
		timelineCardRestStyle
	} from '$lib/logic/timelineMotion';

	export interface TimelineEntry {
		id: string;
		track: Track;
		confirmed: boolean;
		correct: boolean | null;
		isDiscarding?: boolean;
	}

	interface Props {
		playerName: string;
		playerColor: string;
		entries: TimelineEntry[];
		active?: boolean;
		compact?: boolean;
		acceptingDrop?: boolean;
		draggingEntryId?: string | null;
		isDragging?: boolean;
		dragKind?: 'none' | 'center' | 'pending';
		dragTranslate?: { x: number; y: number };
		helpText?: string;
		showConfirm?: boolean;
		confirmDisabled?: boolean;
		confirmLabel?: string;
		timerSeconds?: number | null;
		onConfirm?: () => void;
		onConfirmedCardClick?: (entry: TimelineEntry) => void;
		bindEl?: (el: HTMLDivElement | null) => void;
		onPendingPointerDown?: (entryId: string, ev: PointerEvent) => void;
		rotation?: number;
		isVertical?: boolean;
		streakCount?: number;
		score?: number;
		hideHeader?: boolean;
		hideCount?: boolean;
		animateCards?: boolean;
		fixedWidth?: number | null;
	}

	let {
		playerName,
		playerColor,
		entries,
		active = false,
		compact = false,
		acceptingDrop = false,
		draggingEntryId = null,
		isDragging = false,
		dragKind = 'none',
		dragTranslate = { x: 0, y: 0 },
		helpText = '',
		showConfirm = false,
		confirmDisabled = true,
		confirmLabel = 'Confirm',
		timerSeconds = null as number | null,
		onConfirm = () => {},
		onConfirmedCardClick = () => {},
		bindEl = () => {},
		onPendingPointerDown = () => {},
		rotation = 0,
		isVertical = false,
		streakCount = 0,
		score = 0,
		hideHeader = false,
		hideCount = false,
		animateCards = true,
		fixedWidth = null
	}: Props = $props();

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		bindEl(el);
	});

	const cardSize = $derived(active && !compact ? 'sm' : 'xs');
	const fixedWidthStyle = $derived(
		typeof fixedWidth === 'number' && fixedWidth > 0 ? `width: ${Math.ceil(fixedWidth)}px;` : ''
	);

	const flameGlow = $derived.by(() => {
		return getStreakGlow(streakCount, active);
	});

	const localDragTranslate = $derived(rotateVector(dragTranslate.x, dragTranslate.y, rotation));

	function flyFromCenter(node: Element, params: { delay?: number; duration?: number } = {}) {
		return flyTimelineCardFromCenter(node, {
			...params,
			rotation,
			duration: animateCards ? (params.duration ?? 400) : 0
		});
	}
</script>

<div
	class={`relative w-fit transition-all duration-300 ease-out ${isVertical ? 'max-w-[92dvh]' : 'max-w-[92vw]'}`}
	data-rotation={rotation}
	style={fixedWidthStyle}
>
	{#if helpText || showConfirm}
		<div
			class="absolute right-0 bottom-[calc(100%+1rem)] left-0 z-10 flex flex-col items-center justify-center gap-0.5 p-1 backdrop-blur-xs md:bottom-[calc(100%)]"
		>
			<div class="min-w-0 truncate text-[11px] font-semibold text-slate-300 select-none">
				{helpText}
			</div>
			{#if showConfirm}
				<button
					in:fly={{ y: 10, duration: 300 }}
					type="button"
					onclick={onConfirm}
					disabled={confirmDisabled}
					class="text-md my-1 shrink-0 rounded-xl border-2 border-cyan-400 bg-slate-900 px-8 py-1.5 font-bold text-cyan-400 transition-all hover:bg-slate-800 hover:shadow-[0_0_18px_rgba(34,211,238,0.45)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-900"
				>
					{#if timerSeconds !== null && timerSeconds !== undefined}
						<span class="flex items-center justify-center gap-2">
							{#if !confirmDisabled}
								<span>{confirmLabel}</span>
							{/if}
							<span class="text-sm font-black tabular-nums">{timerSeconds}</span>
						</span>
					{:else}
						{confirmLabel}
					{/if}
				</button>
			{/if}
		</div>
	{/if}

	<div
		bind:this={el}
		class={`relative flex items-center justify-center gap-1 rounded-xl border bg-slate-950/30 transition-all duration-300 md:gap-1.5 ${helpText || showConfirm ? 'mt-6' : ''} ${active ? `rounded-tl-none py-2` : 'min-w-25 px-1.5 py-1.5'} ${acceptingDrop ? 'border-cyan-400/40' : 'border-slate-700/40'}`}
		style="{active
			? `box-shadow: ${flameGlow || (acceptingDrop ? `0 0 25px rgba(34,211,238,0.35)` : `0 0 15px ${playerColor}44`)}; min-width: ${isVertical ? '92dvh' : '92vw'}; container-type: inline-size;`
			: flameGlow
				? `box-shadow: ${flameGlow};`
				: ''}--entry-count: {Math.max(entries.length, 1)}; --gap: calc(var(--spacing) * 1.5);"
	>
		{#if !hideHeader}
			<div
				class={`pointer-events-none absolute flex items-center gap-1 rounded-lg border border-slate-700/50 bg-slate-950/50 px-2 whitespace-nowrap transition-all ${active ? 'top-0 left-0 z-100 -translate-y-full rounded-br-none rounded-bl-none py-0.5 text-xs text-slate-200' : '-top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-300'}`}
			>
				<div class="h-2 w-2 shrink-0 rounded-full" style="background-color: {playerColor};"></div>
				<div class="max-w-[28ch] truncate font-semibold tracking-wide select-none">
					{playerName}
				</div>
				{#if score > 0}
					<span class="text-slate-600">|</span>
					<div class="font-bold text-cyan-400 tabular-nums">
						{$_('scoring.pts', { values: { points: Math.round(score).toLocaleString() } })}
					</div>
				{/if}
				{#if streakCount >= STREAK_THRESHOLD && active}
					<span class="text-slate-600">|</span>
					<div class="flex items-center gap-0.5 text-orange-400">
						<Flame class="h-3.5 w-3.5" />
						<span class="text-xs font-bold">{calculateStreakMult(streakCount).toFixed(2)}×</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if !hideCount}
			<div
				class={`absolute transition-all ${active ? 'top-1 left-2 text-xs' : 'top-0.75 left-1 text-[10px]'} opacity-50`}
			>
				{entries.length}
			</div>
		{/if}
		<!-- Dummy card to maintain spacing when empty -->
		{#if entries.length === 0}
			<div class="pointer-events-none opacity-0">
				<TimelineCard
					state="face-down"
					draggable={false}
					size={cardSize}
					borderVariant="neutral"
					yearText=""
				/>
			</div>
		{/if}
		{#each entries as entry (entry.id)}
			{@const yearText = formatYearRange(entry.track.work.begin_year, entry.track.work.end_year, {
				preferEndYearWhenRange: true
			})}
			{@const isPendingMove = isDragging && dragKind === 'pending' && draggingEntryId === entry.id}

			<div
				data-timeline-entry
				data-entry-id={entry.id}
				animate:flip={{ duration: animateCards ? 250 : 0 }}
				class="relative"
				class:z-50={isPendingMove}
				class:z-10={!entry.confirmed && !isPendingMove}
			>
				<div
					class="transition-all duration-500 ease-in-out"
					style={entry.isDiscarding ? timelineCardDiscardStyle : timelineCardRestStyle}
					out:discardTimelineCard={{ duration: animateCards ? 600 : 0 }}
				>
					<div
						class:will-change-transform={isPendingMove}
						style={isPendingMove
							? `transform: translate3d(${localDragTranslate.x}px, ${localDragTranslate.y}px, 0);`
							: ''}
						in:flyFromCenter={{ duration: 600 }}
					>
						<TimelineCard
							state={entry.confirmed ? 'revealed' : 'face-down'}
							draggable={!entry.confirmed && !entry.isDiscarding}
							size={cardSize}
							borderVariant={entry.confirmed && entry.correct === false
								? 'wrong'
								: entry.confirmed && entry.correct === true
									? 'correct'
									: 'neutral'}
							{yearText}
							onClick={() => !entry.isDiscarding && onConfirmedCardClick(entry)}
							onPointerDown={(ev) => !entry.isDiscarding && onPendingPointerDown(entry.id, ev)}
						/>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>
