<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { X } from 'lucide-svelte';
	import { CATEGORY_POINTS, type GuessCategory, type Player } from '$lib/types';
	import { getCategoryDefinition } from '$lib/data/categories';

	interface Props {
		player: Player;
		mode: 'classic' | 'buzzer';
		categories: readonly GuessCategory[];
		selectedOption: GuessCategory | 'none' | 'wrong' | null;
		onSelect: (option: GuessCategory | 'none' | 'wrong') => void;
	}

	let { player, mode, categories, selectedOption, onSelect }: Props = $props();

	// Calculate preview score based on selected option
	let previewDelta = $derived(
		(() => {
			if (!selectedOption || selectedOption === 'none') return 0;
			if (selectedOption === 'wrong') return -10;
			return CATEGORY_POINTS[selectedOption as GuessCategory];
		})()
	);

	let currentScore = $derived(player.score);
	let deltaSign = $derived(previewDelta >= 0 ? '+' : '');
</script>

<div
	class="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-800/50 p-4 backdrop-blur-sm"
>
	<!-- Player Header -->
	<div class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-3">
			<div class="h-8 w-1 rounded-full" style="background-color: {player.color};"></div>
			<h3 class="text-xl font-bold text-white">{player.name}</h3>
		</div>
		<div class="text-sm font-semibold text-slate-300">
			{$_('scoring.pointsPreview', {
				values: { current: currentScore, delta: `${deltaSign}${previewDelta}` }
			})}
		</div>
	</div>

	<!-- Option Buttons -->
	<div class="flex flex-wrap justify-center gap-2">
		<!-- No Guess Option -->
		<button
			type="button"
			class="flex cursor-pointer flex-row items-center gap-2 rounded-full border-2 bg-slate-700 px-2 py-1 transition-all duration-200 hover:scale-[1.02]"
			class:border-white={selectedOption === 'none'}
			class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={selectedOption === 'none'}
			class:scale-105={selectedOption === 'none'}
			class:border-transparent={selectedOption !== 'none'}
			onclick={() => onSelect('none')}
		>
			<span class="text-sm font-bold text-white uppercase">{$_('scoring.noGuess')}</span>
			<span class="text-xs font-semibold text-white/80">+0</span>
		</button>

		<!-- Category Buttons -->
		{#each categories as category}
			{@const def = getCategoryDefinition(category)}
			<button
				type="button"
				class="relative flex cursor-pointer flex-row items-center gap-2 overflow-hidden rounded-full border-2 px-2 py-1 transition-all duration-200 hover:scale-[1.02]"
				class:border-white={selectedOption === category}
				class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={selectedOption === category}
				class:scale-105={selectedOption === category}
				class:border-transparent={selectedOption !== category}
				style="background: linear-gradient(135deg, {def.color1}, {def.color2});"
				onclick={() => onSelect(category)}
			>
				<!-- Background Icon -->
				<svg
					class="pointer-events-none absolute inset-0 h-full w-full p-0.5 opacity-30"
					viewBox="0 0 24 24"
					fill="currentColor"
					preserveAspectRatio="xMidYMid meet"
				>
					{#each def.iconPaths as pathData}
						<path d={pathData} />
					{/each}
				</svg>
				<span class="relative z-10 text-sm font-bold text-white uppercase"
					>{$_(`game.categoriesShort.${category}`)}</span
				>
				<span class="relative z-10 text-xs font-semibold text-white/90"
					>+{CATEGORY_POINTS[category]}</span
				>
			</button>
		{/each}

		<!-- Wrong Option (Buzzer Mode Only) -->
		{#if mode === 'buzzer'}
			<button
				type="button"
				class="relative flex cursor-pointer flex-row items-center gap-2 overflow-hidden rounded-full border-2 bg-red-900 px-2 py-1 transition-all duration-200 hover:scale-[1.02]"
				class:border-white={selectedOption === 'wrong'}
				class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={selectedOption === 'wrong'}
				class:scale-105={selectedOption === 'wrong'}
				class:border-transparent={selectedOption !== 'wrong'}
				onclick={() => onSelect('wrong')}
			>
				<!-- Background Icon -->
				<X class="pointer-events-none absolute inset-0 h-full w-full opacity-30" />
				<span class="relative z-10 text-sm font-bold text-white uppercase">Wrong</span>
				<span class="relative z-10 text-xs font-semibold text-white/90">-10</span>
			</button>
		{/if}
	</div>
</div>
