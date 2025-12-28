<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { GameMode } from '$lib/types';
	import Trophy from 'lucide-svelte/icons/trophy';
	import BadgeQuestionMark from 'lucide-svelte/icons/badge-question-mark';
	import ModeRulesPopup from './ModeRulesPopup.svelte';
	import LifeBuoy from 'lucide-svelte/icons/life-buoy';
	import Crown from 'lucide-svelte/icons/crown';

	interface Props {
		selectedMode?: GameMode | null;
		onModeSelect?: (mode: GameMode) => void;
	}

	let { selectedMode = null, onModeSelect = () => {} }: Props = $props();

	let showRulesPopup = $state(false);
	let selectedModeForRules = $state<GameMode | null>(null);

	function handleModeClick(mode: GameMode) {
		onModeSelect(mode);
	}

	function showRules(event: Event, mode: GameMode) {
		event.stopPropagation();
		selectedModeForRules = mode;
		showRulesPopup = true;
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
			icon: LifeBuoy,
			color: '#a855f7'
		}
	];
</script>

<div class="mx-auto w-full max-w-[1200px]">
	<div class="flex flex-col justify-center gap-4 md:flex-row">
		{#each modes as mode (mode.id)}
			{@const isSelected = selectedMode === mode.id}
			<button
				type="button"
				class="relative flex flex-1 cursor-pointer items-start gap-4 overflow-hidden rounded-2xl border-2 p-6 text-left transition-all duration-300 hover:scale-[1.02]"
				class:shadow-none={!isSelected}
				style={isSelected
					? `border-color: ${mode.color}; box-shadow: 0 0 30px ${mode.color}80;`
					: `border-color: ${mode.color}66;`}
				onclick={() => handleModeClick(mode.id)}
			>
				<!-- Mode Icon -->
				<div
					class="shrink-0 transition-colors"
					class:text-slate-400={!isSelected}
					style={isSelected ? `color: ${mode.color};` : ''}
				>
					<mode.icon class="h-12 w-12" strokeWidth={2} />
				</div>

				<div class="flex-1">
					<!-- Mode Name -->
					<h3
						class="mb-1 text-xl font-bold transition-colors"
						class:text-slate-400={!isSelected}
						style={isSelected ? `color: ${mode.color};` : ''}
					>
						{$_(`modes.${mode.id}.name`)}
					</h3>

					<!-- Mode Description -->
					<p
						class="text-sm leading-relaxed"
						class:text-slate-400={!isSelected}
						style={isSelected ? `color: ${mode.color};` : ''}
					>
						{$_(`modes.${mode.id}.description`)}
					</p>
				</div>

				<!-- Help Button -->
				<div
					role="button"
					tabindex="0"
					class="absolute top-3 right-3 flex cursor-pointer items-center justify-center rounded-full border border-slate-600 p-2 text-slate-400 backdrop-blur-sm transition-all duration-300 hover:scale-125"
					style={isSelected
						? `background: linear-gradient(135deg, ${mode.color}30, ${mode.color}15); border-color: ${mode.color}60; color: ${mode.color}; box-shadow: 0 0 15px ${mode.color}40;`
						: ``}
					onmouseenter={(e) => {
						if (!isSelected) {
							e.currentTarget.style.borderColor = `${mode.color}80`;
							e.currentTarget.style.color = mode.color;
							e.currentTarget.style.boxShadow = `0 0 12px ${mode.color}40`;
						}
					}}
					onmouseleave={(e) => {
						if (!isSelected) {
							e.currentTarget.style.borderColor = 'rgba(75, 85, 99, 0.5)';
							e.currentTarget.style.color = 'rgb(156, 163, 175)';
							e.currentTarget.style.boxShadow = 'none';
						}
					}}
					onclick={(e) => showRules(e, mode.id)}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							showRules(e, mode.id);
						}
					}}
					aria-label="Show rules"
				>
					<BadgeQuestionMark class="h-5 w-5" strokeWidth={2.5} />
				</div>
			</button>
		{/each}
	</div>
</div>

<!-- Rules Popup -->
<ModeRulesPopup
	visible={showRulesPopup}
	mode={selectedModeForRules}
	onClose={() => (showRulesPopup = false)}
/>
