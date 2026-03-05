<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Popup from '../primitives/Popup.svelte';
	import ScoringCard from '../primitives/ScoringCard.svelte';
	import TrackInfo from '../gameplay/TrackInfo.svelte';
	import { CATEGORY_POINTS, type GuessCategory, type Player, type Track } from '$lib/types';
	import { ArrowRight } from 'lucide-svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		visible?: boolean;
		mode?: 'classic' | 'buzzer';
		players?: Player[];
		track?: Track | null;
		currentCategory?: GuessCategory | null;
		categories?: readonly GuessCategory[];
		revealedCategories?: GuessCategory[]; // For buzzer mode: categories shown so far
		onScore?: (scores: Record<string, number>) => void;
	}

	let {
		visible = false,
		mode = 'classic',
		players = [],
		track = null,
		categories = ['work', 'composer', 'decade', 'era', 'type'] as const,
		revealedCategories = [],
		onScore = () => {}
	}: Props = $props();

	// For classic mode: track selected option per player
	// For buzzer mode: track selected option per player
	let playerSelections = $state<Map<string, GuessCategory | 'none' | 'wrong'>>(new Map());

	// Reset state when popup becomes visible
	$effect(() => {
		if (visible) {
			// Default all players to 'none'
			const defaults = new SvelteMap<string, GuessCategory | 'none' | 'wrong'>();
			players.forEach((player) => {
				defaults.set(player.name, 'none');
			});
			playerSelections = defaults;
		}
	});

	function handlePlayerSelect(playerName: string, option: GuessCategory | 'none' | 'wrong') {
		const newSelections = new SvelteMap(playerSelections);
		newSelections.set(playerName, option);
		playerSelections = newSelections;
	}

	function handleContinue() {
		const scores: Record<string, number> = {};

		if (mode === 'classic') {
			// Calculate scores from player selections (using name as identifier)
			playerSelections.forEach((option, playerName) => {
				if (option !== 'none' && option !== 'wrong') {
					scores[playerName] = CATEGORY_POINTS[option as GuessCategory];
				}
			});
		} else if (mode === 'buzzer') {
			// Buzzer mode scoring
			playerSelections.forEach((option, playerName) => {
				if (option === 'wrong') {
					// Wrong guess: penalty points (min 10, max category points)
					const penalty = Math.min(
						10,
						Math.max(...revealedCategories.map((c) => CATEGORY_POINTS[c]))
					);
					scores[playerName] = (scores[playerName] || 0) - penalty;
				} else if (option !== 'none') {
					// Correct guess: award points for the category
					scores[playerName] = CATEGORY_POINTS[option as GuessCategory];
				}
				// 'none' means no score change
			});
		}

		onScore(scores);
	}
</script>

<Popup {visible} onClose={() => {}} width="w-[900px] max-w-[95vw]" showCloseButton={false}>
	<div class="mb-4 grid grid-cols-1 gap-8 md:grid-cols-[1fr_1fr]">
		<!-- Left: Track Info -->
		<div class="flex flex-col gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-5">
			<TrackInfo {track} bleed="md" showMirror={players.length > 1} />
		</div>

		<!-- Right: Scoring Section -->
		<div class="flex flex-col">
			<h2 class="mb-2 text-center text-3xl font-bold text-cyan-400">
				{$_('scoring.title')}
			</h2>
			<p class="mb-6 text-center text-sm text-slate-400">
				{$_('scoring.selectCategory')}
			</p>
			{#if mode === 'classic'}
				<div class="flex flex-col gap-3">
					{#each players as player (player.name)}
						<ScoringCard
							{player}
							{mode}
							{categories}
							selectedOption={playerSelections.get(player.name) || null}
							onSelect={(option) => handlePlayerSelect(player.name, option)}
						/>
					{/each}
				</div>
			{:else if mode === 'buzzer'}
				<!-- Buzzer Mode: Scoring Cards -->
				<div class="flex flex-col gap-3">
					{#each players as player (player.name)}
						<ScoringCard
							{player}
							{mode}
							categories={revealedCategories}
							selectedOption={playerSelections.get(player.name) || null}
							onSelect={(option) => handlePlayerSelect(player.name, option)}
						/>
					{/each}
				</div>
			{/if}

			<!-- Confirm Button -->
			<div class="mt-auto flex justify-center">
				<button
					type="button"
					class="mt-6 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 font-bold text-cyan-400 transition-all duration-200 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]"
					onclick={handleContinue}
				>
					{$_('common.confirm')}
					<ArrowRight class="h-5 w-5" />
				</button>
			</div>
		</div>
	</div>
</Popup>
