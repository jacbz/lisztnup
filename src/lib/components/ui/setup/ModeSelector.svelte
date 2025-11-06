<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { GameMode } from '$lib/types';
	import Trophy from 'lucide-svelte/icons/trophy';
	import HelpCircle from 'lucide-svelte/icons/help-circle';
	import Dialog from '../primitives/Dialog.svelte';
	import Grid3X3 from 'lucide-svelte/icons/grid-3x3';
	import Crown from 'lucide-svelte/icons/crown';

	interface Props {
		selectedMode?: GameMode | null;
		onModeSelect?: (mode: GameMode) => void;
	}

	let { selectedMode = null, onModeSelect = () => {} }: Props = $props();

	let showRulesDialog = $state(false);
	let selectedModeForRules = $state<GameMode | null>(null);

	function handleModeClick(mode: GameMode) {
		onModeSelect(mode);
	}

	function showRules(event: Event, mode: GameMode) {
		event.stopPropagation();
		selectedModeForRules = mode;
		showRulesDialog = true;
	}
	const modes = [
		{
			id: 'classic' as GameMode,
			icon: Trophy,
			color: '#f59e0b'
		},
		{
			id: 'buzzer' as GameMode,
			icon: Crown,
			color: '#ef4444'
		},
		{
			id: 'bingo' as GameMode,
			icon: Grid3X3,
			color: '#a855f7'
		}
	];
</script>

<div class="mx-auto w-full max-w-[1200px]">
	<div class="flex flex-col justify-center gap-4 md:flex-row">
		{#each modes as mode}
			{@const isSelected = selectedMode === mode.id}
			<button
				type="button"
				class="relative flex flex-1 cursor-pointer items-start gap-4 overflow-hidden rounded-2xl border-2 p-6 text-left backdrop-blur-xl transition-all duration-300 hover:scale-[1.02]"
				class:shadow-none={!isSelected}
				style={isSelected
					? `border-color: ${mode.color}; box-shadow: 0 0 30px ${mode.color}80;`
					: `border-color: ${mode.color}66;`}
				onclick={() => handleModeClick(mode.id)}
			>
				<!-- Mode Icon -->
				<div
					class="shrink-0 transition-colors"
					class:text-gray-400={!isSelected}
					style={isSelected ? `color: ${mode.color};` : ''}
				>
					<mode.icon class="h-12 w-12" strokeWidth={2} />
				</div>

				<div class="flex-1">
					<!-- Mode Name -->
					<h3
						class="mb-1 text-xl font-bold transition-colors"
						class:text-gray-400={!isSelected}
						style={isSelected ? `color: ${mode.color};` : ''}
					>
						{$_(`modes.${mode.id}.name`)}
					</h3>

					<!-- Mode Description -->
					<p class="text-sm leading-relaxed text-gray-400">
						{$_(`modes.${mode.id}.description`)}
					</p>
				</div>

				<!-- Help Button -->
				<div
					role="button"
					tabindex="0"
					class="absolute top-2 right-2 flex cursor-pointer items-center justify-center rounded-full border border-gray-600 p-1.5 text-gray-400 transition-all duration-200 hover:scale-110 hover:border-gray-500 hover:text-white"
					onclick={(e) => showRules(e, mode.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							showRules(e, mode.id);
						}
					}}
					aria-label="Show rules"
				>
					<HelpCircle class="h-4 w-4" />
				</div>
			</button>
		{/each}
	</div>
</div>

<!-- Rules Dialog -->
{#if selectedModeForRules}
	<Dialog
		visible={showRulesDialog}
		title={$_(`modes.${selectedModeForRules}.name`)}
		message={$_(`modes.${selectedModeForRules}.rules`)}
		confirmText={$_('tracklistEditor.close', { default: 'Close' })}
		onConfirm={() => (showRulesDialog = false)}
		onCancel={() => (showRulesDialog = false)}
		cancelText=""
	/>
{/if}
