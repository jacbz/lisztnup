<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		visible?: boolean;
		children: Snippet;
		hideTop?: boolean;
		margin?: string;
	}

	let { visible = true, children, hideTop = false, margin = '20px' }: Props = $props();

	const positions = [
		{
			name: 'top',
			innerTransform: `translate(-50%, -50%) rotate(180deg) translateY(calc(50vh - 50% - ${margin}))`,
			hideOnNarrow: false,
			flyParams: { y: -100, duration: 300 }
		},
		{
			name: 'bottom',
			innerTransform: `translate(-50%, -50%) translateY(calc(50vh - 50% - ${margin}))`,
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
		hideTop ? positions.filter((p) => p.name !== 'top') : positions
	);
</script>

{#each filteredPositions as position (position.name)}
	{#if visible}
		<div
			class="fixed top-1/2 left-1/2 {position.hideOnNarrow
				? 'hidden lg:block'
				: ''} z-100 select-none"
			in:fly={position.flyParams}
			out:fly={position.flyParams}
		>
			<div style="transform: {position.innerTransform};">
				{@render children()}
			</div>
		</div>
	{/if}
{/each}
