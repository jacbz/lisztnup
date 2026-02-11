<script lang="ts">
	import type { Track } from '$lib/types';
	import { flip } from 'svelte/animate';
	import { quintOut } from 'svelte/easing';
	import { formatYearRange } from '$lib/utils';
	import TimelineCard from './TimelineCard.svelte';

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
		isDealing?: boolean;
		helpText?: string;
		showConfirm?: boolean;
		confirmDisabled?: boolean;
		confirmLabel?: string;
		onConfirm?: () => void;
		onConfirmedCardClick?: (entry: TimelineEntry) => void;
		bindEl?: (el: HTMLDivElement | null) => void;
		onPendingPointerDown?: (entryId: string, ev: PointerEvent) => void;
		rotation?: number;
		isVertical?: boolean;
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
		isDealing = false,
		helpText = '',
		showConfirm = false,
		confirmDisabled = true,
		confirmLabel = 'Confirm',
		onConfirm = () => {},
		onConfirmedCardClick = () => {},
		bindEl = () => {},
		onPendingPointerDown = () => {},
		rotation = 0,
		isVertical = false
	}: Props = $props();

	let el: HTMLDivElement | null = $state(null);
	$effect(() => {
		bindEl(el);
	});

	const cardSize = $derived(active && !compact ? 'sm' : 'xs');

	function rotateVector(x: number, y: number, angleDeg: number) {
		const rad = (-angleDeg * Math.PI) / 180;
		const cos = Math.cos(rad);
		const sin = Math.sin(rad);
		return {
			x: x * cos - y * sin,
			y: x * sin + y * cos
		};
	}

	const localDragTranslate = $derived(rotateVector(dragTranslate.x, dragTranslate.y, rotation));

	// Custom transition to simulate flying from the stack (center screen)
	function flyFromCenter(node: Element, { delay = 0, duration = 400, easing = quintOut }) {
		const rect = node.getBoundingClientRect();
		// Screen center
		const centerX = window.innerWidth / 2;
		const centerY = window.innerHeight / 2;

		// Target center
		const targetX = rect.left + rect.width / 2;
		const targetY = rect.top + rect.height / 2;

		const dx = centerX - targetX;
		const dy = centerY - targetY;

		const local = rotateVector(dx, dy, rotation);

		return {
			delay,
			duration,
			easing,
			css: (t: number, u: number) => `
				transform: translate(${u * local.x}px, ${u * local.y}px) scale(${0.2 + 0.8 * t});
				opacity: ${t};
			`
		};
	}
</script>

<div
	class={`relative w-fit transition-all duration-300 ease-out ${isVertical ? 'max-w-[92dvh]' : 'max-w-[92vw]'}`}
	data-rotation={rotation}
>
	{#if helpText || showConfirm}
		<div
			class="absolute right-0 bottom-[calc(100%)] left-0 z-10 flex flex-col items-center justify-center gap-0.5 p-1 backdrop-blur-xs"
		>
			<div class="min-w-0 truncate text-[11px] font-semibold text-slate-300 select-none">
				{helpText}
			</div>
			{#if showConfirm}
				<button
					type="button"
					onclick={onConfirm}
					disabled={confirmDisabled}
					class="shrink-0 rounded-xl border-2 border-cyan-400 bg-slate-900 px-3 py-1 text-xs font-bold text-cyan-400 transition-all hover:bg-slate-800 hover:shadow-[0_0_18px_rgba(34,211,238,0.45)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-900"
				>
					{confirmLabel}
				</button>
			{/if}
		</div>
	{/if}

	<div
		bind:this={el}
		class={`relative flex items-center justify-center gap-1.5 rounded-xl border bg-slate-950/30 transition-all duration-300 ${helpText || showConfirm ? 'mt-6' : ''} ${active ? `rounded-tl-none py-2` : 'min-w-[100px] px-1.5 py-1.5'} ${acceptingDrop ? 'border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.35)]' : 'border-slate-700/40'}`}
		style="{active
			? `box-shadow: 0 0 30px ${playerColor}55; min-width: ${isVertical ? '92dvh' : '92vw'};`
			: ''}container-type: inline-size; --entry-count: {Math.max(
			entries.length,
			1
		)}; --gap: calc(var(--spacing) * 1.5);"
	>
		<div
			class={`pointer-events-none absolute flex items-center gap-2 rounded-lg border border-slate-700/50 bg-slate-950/50 px-2 ${active ? 'top-0 left-0 z-100 -translate-y-full rounded-br-none rounded-bl-none py-0.5 text-xs text-slate-200' : '-top-2 left-1/2 -translate-x-1/2 text-[10px] text-slate-300'}`}
		>
			<div class="h-2 w-2 rounded-full" style="background-color: {playerColor};"></div>
			<div class="max-w-[28ch] truncate font-semibold tracking-wide select-none">{playerName}</div>
		</div>

		<div
			class={`absolute ${active ? 'top-1 left-2 text-xs' : 'top-0.75 left-1 text-[10px]'} opacity-50`}
		>
			{entries.length}
		</div>
		<!-- Dummy card to maintain spacing when empty -->
		{#if entries.length === 0}
			<div class="pointer-events-none opacity-0">
				<TimelineCard
					track={{ work: { begin_year: 0, end_year: 0 } } as Track}
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
				animate:flip={{ duration: 250 }}
				class="relative"
			>
				<div
					class="transition-all duration-500 ease-in-out"
					style={entry.isDiscarding
						? 'transform: translateY(120px) rotate(15deg) scale(0.9); opacity: 0; pointer-events: none;'
						: 'transform: translateY(0) rotate(0) scale(1); opacity: 1;'}
				>
					<div
						class:z-50={isPendingMove}
						class:will-change-transform={isPendingMove}
						style={isPendingMove
							? `transform: translate3d(${localDragTranslate.x}px, ${localDragTranslate.y}px, 0);`
							: ''}
						in:flyFromCenter={{ duration: 600 }}
					>
						<TimelineCard
							track={entry.track}
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
