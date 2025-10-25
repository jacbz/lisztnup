<script lang="ts">
	import type { GuessCategory } from '$lib/types';
	import { createEventDispatcher, onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		onCategorySelected?: (category: GuessCategory) => void;
	}

	let { onCategorySelected = () => {} }: Props = $props();

	const categories: { id: GuessCategory; color: string }[] = [
		{ id: 'composer', color: '#06b6d4' }, // cyan
		{ id: 'decade', color: '#8b5cf6' }, // violet
		{ id: 'year', color: '#ec4899' }, // pink
		{ id: 'composition', color: '#f59e0b' }, // amber
		{ id: 'type', color: '#10b981' } // emerald
	];

	let rotation = $state(0);
	let isSpinning = $state(false);
	let selectedCategory = $state<GuessCategory | null>(null);

	function spin() {
		if (isSpinning) return;

		isSpinning = true;
		selectedCategory = null;

		// Spin for 3-5 seconds with random final position
		const spins = 5 + Math.random() * 3; // 5-8 full rotations
		const randomOffset = Math.random() * 360;
		const targetRotation = rotation + spins * 360 + randomOffset;

		rotation = targetRotation;

		setTimeout(() => {
			isSpinning = false;
			// Calculate which category was selected
			const normalizedRotation = ((targetRotation % 360) + 360) % 360;
			const segmentSize = 360 / categories.length;
			const categoryIndex =
				Math.floor((360 - normalizedRotation + segmentSize / 2) / segmentSize) % categories.length;

			selectedCategory = categories[categoryIndex].id;
			onCategorySelected(selectedCategory);
		}, 3000);
	}

	function handleTouch(event: TouchEvent) {
		if (!isSpinning) {
			spin();
		}
	}

	function handleClick() {
		if (!isSpinning) {
			spin();
		}
	}
</script>

<div class="relative h-96 w-96">
	<!-- Wheel -->
	<button
		type="button"
		class="wheel-container relative h-full w-full cursor-pointer touch-none overflow-hidden rounded-full"
		onclick={handleClick}
		ontouchstart={handleTouch}
		style="transform: rotate({rotation}deg); transition: transform {isSpinning
			? '3s cubic-bezier(0.25, 0.1, 0.25, 1)'
			: '0.3s ease-out'};"
		aria-label="Spin the wheel"
	>
		{#each categories as category, i}
			{@const angle = (360 / categories.length) * i}
			<div
				class="segment absolute h-full w-full"
				style="transform: rotate({angle}deg); clip-path: polygon(50% 50%, 100% 0, 100% {100 /
					categories.length}%);"
			>
				<div
					class="flex h-full w-full items-center justify-end pr-8"
					style="background: {category.color};"
				>
					<span
						class="text-lg font-bold text-white"
						style="transform: rotate({90 - 360 / categories.length / 2}deg);"
					>
						{$_(`game.categories.${category.id}`)}
					</span>
				</div>
			</div>
		{/each}

		<!-- Center circle overlay -->
		<div
			class="absolute top-1/2 left-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-cyan-400 bg-gray-900 shadow-[0_0_20px_rgba(34,211,238,0.5)]"
		></div>
	</button>

	<!-- Pointer -->
	<div
		class="absolute -top-4 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-t-16 border-r-8 border-l-8 border-t-yellow-400 border-r-transparent border-l-transparent"
		style="filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.8));"
	></div>
</div>

<style>
	.wheel-container {
		box-shadow: 0 0 40px rgba(34, 211, 238, 0.4);
	}

	.segment {
		transform-origin: center;
	}
</style>
