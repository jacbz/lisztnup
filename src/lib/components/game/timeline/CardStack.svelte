<script lang="ts">
	import type { Track } from '$lib/types';
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

		onPointerDown?: (e: PointerEvent) => void;
		topCardContent?: import('svelte').Snippet<[Track]>;
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

<div class="relative flex items-center justify-center">
	{#each visibleCards as c (c.item.id)}
		{@const isTop = c.depth === 0}
		{@const depth = c.depth}

		{@const x = depth * 2}
		{@const y = depth * 2}
		{@const rot = (depth % 2 === 0 ? 1 : -1) * depth * 0.7}

		<!-- Only apply translation offsets here. No transition if dragging to keep 1:1 sync with mouse -->
		{@const activeX = isTop && dragging ? dragTranslate.x : 0}
		{@const activeY = isTop && dragging ? dragTranslate.y : 0}

		<div
			class="absolute"
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
					track={c.item.track}
					size="lg"
					state={isTop && isTurnActive ? 'interactive' : 'face-down'}
					draggable={false}
					borderVariant="neutral"
				>
					{#if isTop && isTurnActive && topCardContent}
						{@render topCardContent(c.item.track)}
					{/if}
				</TimelineCard>
			</div>
		</div>
	{/each}
</div>
