<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Popup from '../primitives/Popup.svelte';
	import TrackInfo from '../gameplay/TrackInfo.svelte';
	import { CATEGORY_POINTS, type GuessCategory, type Player, type Track } from '$lib/types';
	import { getCategoryDefinition } from '$lib/data/categories';

	interface Props {
		visible?: boolean;
		mode?: 'classic' | 'buzzer';
		players?: Player[];
		track?: Track | null;
		currentCategory?: GuessCategory | null;
		isSoloMode?: boolean;
		categories?: readonly GuessCategory[];
		revealedCategories?: GuessCategory[]; // For buzzer mode: categories shown so far
		onScore?: (scores: Record<string, number>) => void;
	}

	let {
		visible = false,
		mode = 'classic',
		players = [],
		track = null,
		isSoloMode = false,
		categories = ['work', 'composer', 'decade', 'era', 'type'] as const,
		revealedCategories = [],
		onScore = () => {}
	}: Props = $props();

	// For classic mode: table of players × categories (including None)
	// For buzzer mode: correct player + wrong player
	let selectedCells = $state<Set<string>>(new Set()); // Format: "playerId:category" or "playerId:none"
	let correctPlayer = $state<string | 'none' | null>(null); // null = not selected, 'none' = explicitly no one
	let wrongPlayer = $state<string | 'none' | null>(null); // null = not selected, 'none' = explicitly no one
	let selectedCategory = $state<GuessCategory | 'none' | null>(null); // For solo mode

	// Reset state when popup becomes visible
	$effect(() => {
		if (visible) {
			// In Classic mode, default all players to 'none'
			if (mode === 'classic' && !isSoloMode) {
				const defaultSelections = new Set<string>();
				players.forEach((player) => {
					defaultSelections.add(`${player.name}:none`);
				});
				selectedCells = defaultSelections;
			} else if (mode === 'buzzer' && !isSoloMode) {
				// In Buzzer mode, also default all players to 'none'
				const defaultSelections = new Set<string>();
				players.forEach((player) => {
					defaultSelections.add(`${player.name}:none`);
				});
				selectedCells = defaultSelections;
			} else {
				selectedCells = new Set();
			}
			correctPlayer = null;
			wrongPlayer = null;
			selectedCategory = null; // No default for classic solo
		}
	});

	function toggleCell(playerName: string, category: GuessCategory | 'none' | 'wrong') {
		const cellKey = `${playerName}:${category}`;
		const newSet = new Set(selectedCells);

		if (!newSet.has(cellKey)) {
			if (mode === 'buzzer' && category !== 'none') {
				// Buzzer mode: only one player can score positive, only one can score negative (wrong)
				if (category === 'wrong') {
					// Clear any other player's 'wrong' selection and set this player to 'none' if they had a positive score
					players.forEach((p) => {
						// Clear wrong from all other players
						const wrongKey = `${p.name}:wrong`;
						if (wrongKey !== cellKey && newSet.has(wrongKey)) {
							newSet.delete(wrongKey);
							newSet.add(`${p.name}:none`);
						}
					});
					// If this player had a positive score, remove it
					[...categories, ...revealedCategories].forEach((cat) => {
						const key = `${playerName}:${cat}`;
						newSet.delete(key);
					});
				} else {
					// Positive score category: clear all other players' positive scores set "no guess"
					players.forEach((p) => {
						[...categories, ...revealedCategories].forEach((cat) => {
							const key = `${p.name}:${cat}`;
							if (key !== cellKey) {
								newSet.delete(key);
								if (!newSet.has(`${p.name}:wrong`)) {
									newSet.add(`${p.name}:none`);
								}
							}
						});
					});
					// If this player had 'wrong', remove it
					const wrongKey = `${playerName}:wrong`;
					newSet.delete(wrongKey);
				}
				// Remove 'none' from this player
				const noneKey = `${playerName}:none`;
				newSet.delete(noneKey);
			} else {
				// Classic mode or 'none' selection: Remove any other selections for this player only
				players.forEach((p) => {
					['none', 'wrong', ...categories].forEach((cat) => {
						const key = `${playerName}:${cat}`;
						if (key !== cellKey) {
							newSet.delete(key);
						}
					});
				});
			}
			newSet.add(cellKey);
		}

		selectedCells = newSet;
	}

	function handleContinue() {
		const scores: Record<string, number> = {};

		if (isSoloMode) {
			// Solo mode scoring
			if (
				mode === 'classic' &&
				selectedCategory &&
				selectedCategory !== 'none' &&
				players.length > 0
			) {
				// Award points for the selected category to the solo player (using name as identifier)
				scores[players[0].name] = CATEGORY_POINTS[selectedCategory];
			}
			// For buzzer solo: not implemented (solo buzzer mode removed)
		} else if (mode === 'classic') {
			// Calculate scores from selected cells (using name as identifier)
			selectedCells.forEach((cellKey) => {
				const [playerName, category] = cellKey.split(':');
				if (category !== 'none' && category !== 'wrong') {
					scores[playerName] = CATEGORY_POINTS[category as GuessCategory];
				}
			});
		} else if (mode === 'buzzer') {
			// New buzzer mode scoring based on table selections
			selectedCells.forEach((cellKey) => {
				const [playerName, category] = cellKey.split(':');
				if (category === 'wrong') {
					// Wrong guess: penalty points (min 10, max category points)
					const penalty = Math.min(
						10,
						Math.max(...revealedCategories.map((c) => CATEGORY_POINTS[c]))
					);
					scores[playerName] = (scores[playerName] || 0) - penalty;
				} else if (category !== 'none') {
					// Correct guess: award points for the category
					scores[playerName] = CATEGORY_POINTS[category as GuessCategory];
				}
				// 'none' means no score change
			});
		}

		onScore(scores);
	}

	// Auto-close for solo modes (Classic only)
	$effect(() => {
		if (visible && isSoloMode) {
			if (mode === 'classic' && selectedCategory !== null) {
				// Classic solo: close immediately when a category is selected
				handleContinue();
			}
		}
	});
</script>

<Popup {visible} onClose={() => {}}>
	{#snippet children()}
		<div
			class="max-h-[90vh] w-[900px] max-w-[95vw] overflow-y-auto rounded-3xl border-2 border-cyan-400 bg-gray-900 p-8"
		>
			<h2 class="mb-6 text-center text-3xl font-bold text-cyan-400">
				{$_('scoring.title')}
			</h2>

			<div class="mb-4 grid grid-cols-1 gap-8 md:grid-cols-[1fr_1fr]">
				<!-- Left: Track Info -->
				<div class="flex flex-col gap-3 rounded-2xl border border-gray-700 bg-gray-900 p-5">
					<TrackInfo {track} />
				</div>

				<!-- Right: Scoring Table -->
				<div class="flex flex-col">
					{#if isSoloMode && mode === 'classic'}
						<!-- Solo Classic Mode: Big Category Buttons -->
						<div class="flex flex-col">
							<div class="grid grid-cols-2 gap-3">
								<!-- Category buttons -->
								{#each categories as category}
									{@const def = getCategoryDefinition(category)}
									{#if def}
										<button
											type="button"
											class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[3px] bg-gray-700 px-4 py-6 transition-all duration-200 hover:scale-[1.02]"
											class:border-white={selectedCategory === category}
											class:shadow-[0_0_20px_rgba(255,255,255,0.3)]={selectedCategory === category}
											class:scale-105={selectedCategory === category}
											class:border-transparent={selectedCategory !== category}
											style="background: linear-gradient(135deg, {def.color1}, {def.color2});"
											onclick={() => (selectedCategory = category)}
										>
											<span class="text-2xl font-bold text-white uppercase"
												>{$_(`game.categories.${category}`)}</span
											>
											<span class="text-lg font-semibold text-white/90"
												>{$_('scoring.pointsAwarded', {
													values: { points: CATEGORY_POINTS[category] }
												})}</span
											>
										</button>
									{/if}
								{/each}
								<!-- Wrong button -->
								<button
									type="button"
									class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-[3px] bg-gray-500 px-4 py-6 transition-all duration-200 hover:scale-[1.02]"
									class:border-white={selectedCategory === 'none'}
									class:shadow-[0_0_20px_rgba(255,255,255,0.3)]={selectedCategory === 'none'}
									class:scale-105={selectedCategory === 'none'}
									class:border-transparent={selectedCategory !== 'none'}
									onclick={() => (selectedCategory = 'none')}
								>
									<span class="text-2xl font-bold text-white uppercase">{$_('scoring.wrong')}</span>
									<span class="text-lg font-semibold text-white/90"
										>{$_('scoring.pointsAwarded', { values: { points: 0 } })}</span
									>
								</button>
							</div>
						</div>
					{:else if mode === 'classic'}
						<!-- Multi-player Classic Mode: Table Layout -->
						<div class="flex flex-col gap-1 overflow-hidden rounded-xl">
							<!-- Header Row -->
							<div
								class="grid gap-1"
								style="grid-template-columns: 100px repeat({categories.length +
									1}, minmax(50px, 1fr));"
							>
								<div
									class="flex items-center justify-start bg-gray-700 p-2 px-2 pl-3 text-sm font-bold text-white uppercase"
								>
									{$_('scoring.player')}
								</div>
								{#each categories as category}
									{@const def = getCategoryDefinition(category)}
									{#if def}
										<div
											class="flex flex-col items-center justify-center gap-0.5 p-2 px-2 py-2 text-sm font-bold text-white uppercase"
											style="background: linear-gradient(135deg, {def.color1}, {def.color2});"
										>
											<span class="text-sm">{$_(`game.categoriesShort.${category}`)}</span>
											<span class="text-xs opacity-80">+{CATEGORY_POINTS[category]}</span>
										</div>
									{/if}
								{/each}
								<div
									class="flex flex-col items-center justify-center gap-0.5 bg-gray-700 p-2 px-2 py-2 text-sm font-bold text-white uppercase"
								>
									{$_('scoring.wrong')}
								</div>
							</div>

							<!-- Player Rows -->
							{#each players as player}
								<div
									class="grid gap-1"
									style="grid-template-columns: 100px repeat({categories.length +
										1}, minmax(50px, 1fr));"
								>
									<div
										class="flex items-center justify-start border-l-[3px] bg-gray-800 p-2 px-2 pl-3 font-semibold text-white"
										style="border-left-color: {player.color};"
									>
										{player.name}
									</div>
									<!-- Category columns -->
									{#each categories as category}
										{@const def = getCategoryDefinition(category)}
										{@const isSelected = selectedCells.has(`${player.name}:${category}`)}
										<button
											type="button"
											class="flex cursor-pointer items-center justify-center bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
											style={isSelected && def
												? `background: linear-gradient(135deg, ${def.color1}, ${def.color2});`
												: ''}
											onclick={() => toggleCell(player.name, category)}
										>
											<span
												class="text-base font-bold text-white transition-opacity duration-200"
												class:opacity-0={!isSelected}
												class:opacity-100={isSelected}
											>
												+{CATEGORY_POINTS[category]}
											</span>
										</button>
									{/each}
									<!-- Wrong option -->
									<button
										type="button"
										class="flex cursor-pointer items-center justify-center bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
										onclick={() => toggleCell(player.name, 'none')}
									>
										{#if selectedCells.has(`${player.name}:none`)}
											<span class="text-base font-bold text-white">+0</span>
										{/if}
									</button>
								</div>
							{/each}
						</div>
					{:else if mode === 'buzzer'}
						<!-- Buzzer Mode: Table Layout (similar to Classic) -->
						<div class="flex flex-col gap-1 overflow-hidden rounded-xl">
							<!-- Header Row -->
							<div
								class="grid gap-1"
								style="grid-template-columns: 100px repeat({revealedCategories.length +
									2}, minmax(50px, 1fr));"
							>
								<div
									class="flex items-center justify-start bg-gray-700 p-2 px-2 pl-3 text-sm font-bold text-white uppercase"
								>
									{$_('scoring.player')}
								</div>
								<div
									class="flex flex-col items-center justify-center gap-0.5 bg-gray-700 p-2 px-2 py-2 text-sm font-bold text-white uppercase"
								>
									{$_('scoring.noGuess')}
								</div>
								{#each revealedCategories as category}
									{@const def = getCategoryDefinition(category)}
									{#if def}
										<div
											class="flex flex-col items-center justify-center gap-0.5 p-2 px-2 py-2 text-sm font-bold text-white uppercase"
											style="background: linear-gradient(135deg, {def.color1}, {def.color2});"
										>
											<span class="text-sm">{$_(`game.categoriesShort.${category}`)}</span>
											<span class="text-xs opacity-80">+{CATEGORY_POINTS[category]}</span>
										</div>
									{/if}
								{/each}
								<div
									class="flex flex-col items-center justify-center gap-0.5 bg-red-900 p-2 px-2 py-2 text-sm font-bold text-white uppercase"
								>
									<span class="text-sm">{$_('scoring.wrong')}</span>
									<span class="text-xs opacity-80">-10</span>
								</div>
							</div>

							<!-- Player Rows -->
							{#each players as player}
								<div
									class="grid gap-1"
									style="grid-template-columns: 100px repeat({revealedCategories.length +
										2}, minmax(50px, 1fr));"
								>
									<div
										class="flex items-center justify-start border-l-[3px] bg-gray-800 p-2 px-2 pl-3 font-semibold text-white"
										style="border-left-color: {player.color};"
									>
										{player.name}
									</div>
									<!-- No guess column -->
									<button
										type="button"
										class="flex cursor-pointer items-center justify-center bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
										onclick={() => toggleCell(player.name, 'none')}
									>
										{#if selectedCells.has(`${player.name}:none`)}
											<span class="text-base font-bold text-white">+0</span>
										{/if}
									</button>
									<!-- Category columns -->
									{#each revealedCategories as category}
										{@const def = getCategoryDefinition(category)}
										{@const isSelected = selectedCells.has(`${player.name}:${category}`)}
										<button
											type="button"
											class="flex cursor-pointer items-center justify-center bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
											style={isSelected && def
												? `background: linear-gradient(135deg, ${def.color1}, ${def.color2});`
												: ''}
											onclick={() => toggleCell(player.name, category)}
										>
											<span
												class="text-base font-bold text-white transition-opacity duration-200"
												class:opacity-0={!isSelected}
												class:opacity-100={isSelected}
											>
												+{CATEGORY_POINTS[category]}
											</span>
										</button>
									{/each}
									<!-- Wrong option -->
									<button
										type="button"
										class="flex cursor-pointer items-center justify-center bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
										class:bg-red-900!={selectedCells.has(`${player.name}:wrong`)}
										onclick={() => toggleCell(player.name, 'wrong')}
									>
										<span
											class="text-base font-bold text-white transition-opacity duration-200"
											class:opacity-0={!selectedCells.has(`${player.name}:wrong`)}
											class:opacity-100={selectedCells.has(`${player.name}:wrong`)}
										>
											-10
										</span>
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Confirm Button (for non-solo modes) -->
			{#if !isSoloMode}
				<div class="mt-6 flex justify-center">
					<button
						type="button"
						class="rounded-xl bg-cyan-500 px-8 py-3 text-lg font-bold text-white shadow-lg transition-all duration-200 hover:bg-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.5)]"
						onclick={handleContinue}
					>
						{$_('common.confirm')}
					</button>
				</div>
			{/if}
		</div>
	{/snippet}
</Popup>
