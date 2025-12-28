<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		/**
		 * Whether the display is visible.
		 * @default true
		 */
		visible?: boolean;
		/**
		 * The content to display.
		 */
		children: Snippet;
		/**
		 * Whether to hide the top display.
		 * @default false
		 */
		hideTop?: boolean;
		/**
		 * Whether to hide the left and right displays.
		 * @default false
		 */
		hideLeftRight?: boolean;
		/**
		 * The margin of the display.
		 * @default '20px'
		 */
		margin?: string;
	}

	let {
		visible = true,
		children,
		hideTop = false,
		hideLeftRight = false,
		margin = '20px'
	}: Props = $props();
	const positions = [
		{
			name: 'top',
			innerTransform: `translate(-50%, -50%) rotate(180deg) translateY(calc(50dvh - 50% - ${margin}))`,
			hideOnNarrow: false,
			flyParams: { y: -100, duration: 300 }
		},
		{
			name: 'bottom',
			innerTransform: `translate(-50%, -50%) translateY(calc(50dvh - 50% - ${margin}))`,
			hideOnNarrow: false,
			flyParams: { y: 100, duration: 300 }
		},
		{
			name: 'left',
			innerTransform: `translate(-50%, -50%) rotate(90deg) translateY(calc(50vw - 50% - ${margin}))`,
			hideOnNarrow: true,
			flyParams: { x: -100, duration: 300 }
		},
		{
			name: 'right',
			innerTransform: `translate(-50%, -50%) rotate(-90deg) translateY(calc(50vw - 50% - ${margin}))`,
			hideOnNarrow: true,
			flyParams: { x: 100, duration: 300 }
		}
	];

	const filteredPositions = $derived(
		positions.filter(
			(position) =>
				!(hideTop && position.name === 'top') &&
				!(hideLeftRight && (position.name === 'left' || position.name === 'right'))
		)
	);
</script>

{#each filteredPositions as position (position.name)}
	{#if visible}
		<div
			class="fixed top-1/2 left-1/2 {position.hideOnNarrow
				? 'hidden lg:block'
				: ''} pointer-events-none z-100 select-none"
			in:fly={position.flyParams}
			out:fly={position.flyParams}
		>
			<div style="transform: {position.innerTransform};">
				{@render children()}
			</div>
		</div>
	{/if}
{/each}
