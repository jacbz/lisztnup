<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';
	import { ALL_EDGES, type PlayerEdge } from '$lib/types';

	interface Props {
		/**
		 * Whether the display is visible.
		 * @default true
		 */
		visible?: boolean;
		/**
		 * The content to display.
		 */
		children: Snippet<[{ rotation: number }]>;
		/**
		 * Which screen edges to render the content on. Each rendered edge orients
		 * the content towards the player seated there.
		 * @default ALL_EDGES
		 */
		edges?: PlayerEdge[];
		/**
		 * The margin of the display.
		 * @default '20px'
		 */
		margin?: string;
		/**
		 * Whether to disable pointer events on the display.
		 * @default true
		 */
		disablePointerEvents?: boolean;
	}

	let {
		visible = true,
		children,
		edges = ALL_EDGES,
		margin = '20px',
		disablePointerEvents = true
	}: Props = $props();
	const positions = $derived([
		{
			name: 'top',
			rotation: 180,
			innerTransform: `translate(-50%, -50%) rotate(180deg) translateY(calc(50dvh - 50% - ${margin}))`,
			hideOnNarrow: false,
			flyParams: { y: -100, duration: 300 }
		},
		{
			name: 'bottom',
			rotation: 0,
			innerTransform: `translate(-50%, -50%) translateY(calc(50dvh - 50% - ${margin}))`,
			hideOnNarrow: false,
			flyParams: { y: 100, duration: 300 }
		},
		{
			name: 'left',
			rotation: 90,
			innerTransform: `translate(-50%, -50%) rotate(90deg) translateY(calc(50vw - 50% - ${margin}))`,
			hideOnNarrow: true,
			flyParams: { x: -100, duration: 300 }
		},
		{
			name: 'right',
			rotation: -90,
			innerTransform: `translate(-50%, -50%) rotate(-90deg) translateY(calc(50vw - 50% - ${margin}))`,
			hideOnNarrow: true,
			flyParams: { x: 100, duration: 300 }
		}
	] satisfies Array<{ name: PlayerEdge; [key: string]: unknown }>);

	const filteredPositions = $derived(positions.filter((position) => edges.includes(position.name)));
</script>

{#each filteredPositions as position (position.name)}
	{#if visible}
		<div
			class="fixed top-1/2 left-1/2 {position.hideOnNarrow ? 'hidden lg:block' : ''} z-100"
			class:pointer-events-none={disablePointerEvents}
			class:select-none={disablePointerEvents}
			in:fly={position.flyParams}
			out:fly={position.flyParams}
		>
			<div style="transform: {position.innerTransform};">
				{@render children({ rotation: position.rotation })}
			</div>
		</div>
	{/if}
{/each}
