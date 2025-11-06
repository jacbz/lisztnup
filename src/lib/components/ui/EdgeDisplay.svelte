<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		visible: boolean;
		children: Snippet;
		hideTop?: boolean;
	}

	let { visible = false, children, hideTop = false }: Props = $props();

	let isAnimatingOut = $state(false);
	let showDisplay = $state(false);

	// Update showDisplay based on visible prop
	$effect(() => {
		if (visible) {
			showDisplay = true;
			isAnimatingOut = false;
		} else if (showDisplay) {
			isAnimatingOut = true;
			const timer = setTimeout(() => {
				showDisplay = false;
				isAnimatingOut = false;
			}, 300); // Match the transition duration

			return () => clearTimeout(timer);
		}
	});

	const positions = [
		{
			name: 'top',
			containerClass: 'fixed top-4 left-1/2 -translate-x-1/2 z-50',
			innerTransform: 'rotate(180deg)',
			hideOnNarrow: false,
			flyParams: { y: -100, duration: 300 }
		},
		{
			name: 'bottom',
			containerClass: 'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
			innerTransform: '',
			hideOnNarrow: false,
			flyParams: { y: 100, duration: 300 }
		},
		{
			name: 'left',
			containerClass: 'fixed left-4 top-1/2 -translate-y-1/2 z-50',
			innerTransform: 'translateX(-25%) rotate(90deg)',
			hideOnNarrow: true,
			flyParams: { x: -100, duration: 300 }
		},
		{
			name: 'right',
			containerClass: 'fixed right-4 top-1/2 -translate-y-1/2 z-50',
			innerTransform: 'translateX(25%) rotate(-90deg)',
			hideOnNarrow: true,
			flyParams: { x: 100, duration: 300 }
		}
	];

	const filteredPositions = $derived(
		hideTop ? positions.filter((p) => p.name !== 'top') : positions
	);
</script>

{#if showDisplay || isAnimatingOut}
	{#each filteredPositions as position (position.name)}
		{#if !isAnimatingOut}
			<div
				class="{position.containerClass} {position.hideOnNarrow
					? 'hidden lg:block'
					: ''} select-none"
				in:fly={position.flyParams}
				out:fly={position.flyParams}
			>
				<div style="transform: {position.innerTransform};">
					{@render children()}
				</div>
			</div>
		{/if}
	{/each}
{/if}
