<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Track } from '$lib/models';
	import TimelineCard from './TimelineCard.svelte';

	interface Props {
		// Expects items with unique IDs to prevent DOM recycling issues
		items: { track: Track; id: string }[];
		maxDepth?: number;

		isTurnActive?: boolean;
		draggable?: boolean;
		dragging?: boolean;
		dragTranslate?: { x: number; y: number };
		dragScale?: number;
		dragOrigin?: { x: number; y: number };
		suppressReleaseAnimation?: boolean;
		statusLabel?: string | null;

		onPointerDown?: (e: PointerEvent) => void;
		topCardContent?: import('svelte').Snippet;
	}

	let {
		items,
		maxDepth = 6,
		isTurnActive = false,
		draggable = false,
		dragging = false,
		dragTranslate = { x: 0, y: 0 },
		dragScale = 1,
		dragOrigin = { x: 0, y: 0 },
		suppressReleaseAnimation = false,
		statusLabel = null,
		onPointerDown = () => {},
		topCardContent
	}: Props = $props();

	const visibleCards = $derived(
		items
			.slice(0, maxDepth)
			.map((item, i) => ({
				item,
				depth: i
			}))
			.reverse()
	);
</script>

<div class="relative mx-auto flex h-40 w-40 items-center justify-center md:h-48 md:w-48">
	{#if statusLabel}
		<div
			class="pointer-events-none absolute bottom-full left-1/2 z-50 mb-4 -translate-x-1/2 whitespace-nowrap"
			in:fly={{ y: -20, duration: 300 }}
			out:fly={{ y: -20, duration: 300 }}
		>
			<div
				class="rounded-full border border-cyan-400/30 bg-slate-900/80 px-4 py-1.5 text-sm font-bold text-cyan-400 shadow-lg backdrop-blur-md"
			>
				{statusLabel}
			</div>
		</div>
	{/if}

	{#each visibleCards as c (c.item.id)}
		{@const isTop = c.depth === 0}
		{@const depth = c.depth}

		{@const x = depth * 2}
		{@const y = depth * 2}
		{@const rot = (depth % 2 === 0 ? 1 : -1) * depth * 0.7}

		<!-- Only apply translation offsets here. No transition if dragging to keep 1:1 sync with mouse -->
		{@const activeX = isTop && dragging ? dragTranslate.x : 0}
		{@const activeY = isTop && dragging ? dragTranslate.y : 0}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="absolute top-0 left-0"
			class:pointer-events-none={!isTop}
			class:cursor-grab={isTop && draggable && !dragging}
			class:cursor-grabbing={isTop && dragging}
			class:will-change-transform={isTop && dragging}
			class:transition-transform={!dragging && !(isTop && suppressReleaseAnimation)}
			class:duration-200={!dragging && !(isTop && suppressReleaseAnimation)}
			class:ease-out={!dragging && !(isTop && suppressReleaseAnimation)}
			style={`
				z-index: ${maxDepth - depth}; 
				transform: translate3d(${x + activeX}px, ${y + activeY}px, 0) rotate(${rot}deg);
				box-shadow: 0 ${depth * 2}px ${depth * 10}px rgba(0,0,0,0.35);
				${isTop && dragging ? 'filter: drop-shadow(0 12px 24px rgba(0,0,0,0.6));' : ''}
			`}
			onpointerdown={(e) => isTop && draggable && onPointerDown(e)}
		>
			<!-- Inner wrapper handles Scaling and Origin changes. 
			     ALWAYS allow transition here to smooth out scale changes when dragging near timeline -->
			<div
				class:will-change-transform={isTop && dragging}
				class:transition-transform={true}
				class:duration-300={true}
				class:ease-out={true}
				style={isTop && dragging
					? `transform-origin: ${dragOrigin.x}px ${dragOrigin.y}px; transform: scale(${dragScale});`
					: ''}
			>
				<TimelineCard
					size="lg"
					state={isTop && isTurnActive ? 'interactive' : 'face-down'}
					draggable={false}
					borderVariant="neutral"
				>
					{#if isTop && isTurnActive && topCardContent}
						{@render topCardContent()}
					{/if}
				</TimelineCard>
			</div>
		</div>
	{/each}
</div>
