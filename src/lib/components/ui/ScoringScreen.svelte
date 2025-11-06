<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Popup from './Popup.svelte';
	import TrackInfo from './TrackInfo.svelte';
	import { CATEGORY_POINTS, type GuessCategory, type Player, type Track } from '$lib/types';
	import { getCategoryDefinition } from '$lib/data/categories';
	import Check from 'lucide-svelte/icons/check';

	interface Props {
		visible?: boolean;
		mode?: 'classic' | 'buzzer';
		players?: Player[];
		track?: Track | null;
		currentCategory?: GuessCategory | null;
		isSoloMode?: boolean;
		onScore?: (scores: Record<string, number>) => void;
	}

	let {
		visible = false,
		mode = 'classic',
		players = [],
		track = null,
		currentCategory = null,
		isSoloMode = false,
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
			selectedCells = new Set();
			correctPlayer = null;
			wrongPlayer = null;
			selectedCategory = null; // No default for classic solo
		}
	});

	const categories: GuessCategory[] = ['composition', 'composer', 'decade', 'era', 'form'];

	function toggleCell(playerName: string, category: GuessCategory | 'none') {
		const cellKey = `${playerName}:${category}`;
		const newSet = new Set(selectedCells);

		if (newSet.has(cellKey)) {
			newSet.delete(cellKey);
		} else {
			// Remove any other selections for this player
			players.forEach((p) => {
				['none', ...categories].forEach((cat) => {
					const key = `${playerName}:${cat}`;
					if (key !== cellKey) {
						newSet.delete(key);
					}
				});
			});
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
				if (category !== 'none') {
					scores[playerName] = CATEGORY_POINTS[category as GuessCategory];
				}
			});
		} else if (mode === 'buzzer') {
			// Correct player gets points, wrong player loses 1
			if (correctPlayer && currentCategory) {
				scores[correctPlayer] = CATEGORY_POINTS[currentCategory];
			}
			if (wrongPlayer) {
				scores[wrongPlayer] = (scores[wrongPlayer] || 0) - 1;
			}
		}

		onScore(scores);
	}

	// Auto-continue for classic mode when all players have selections
	$effect(() => {
		if (mode === 'classic' && visible && !isSoloMode) {
			// Check if every player has a selection (using name as identifier)
			const allPlayersSelected = players.every((player) => {
				return ['none', ...categories].some((cat) => {
					return selectedCells.has(`${player.name}:${cat}`);
				});
			});

			if (allPlayersSelected) {
				// Auto-continue after a short delay
				const timer = setTimeout(() => {
					handleContinue();
				}, 300);
				return () => clearTimeout(timer);
			}
		}
	});

	// Auto-continue for buzzer mode when both selections are made
	$effect(() => {
		if (mode === 'buzzer' && visible && !isSoloMode) {
			const hasCorrect = correctPlayer !== null;
			const hasWrong = wrongPlayer !== null;

			if (hasCorrect && hasWrong) {
				// Both selected, auto-continue immediately
				handleContinue();
			}
		}
	});

	// Auto-close for solo modes
	$effect(() => {
		if (visible && isSoloMode) {
			if (mode === 'classic' && selectedCategory !== null) {
				// Classic solo: close immediately when a category is selected
				handleContinue();
			}
		}
	});

	function handleCorrectPlayerClick(playerId: string | 'none' | null) {
		// Allow toggling off the current selection
		if (correctPlayer === playerId) {
			correctPlayer = null;
			return;
		}

		// Can't select a player who is already marked as wrong
		if (playerId !== null && playerId !== 'none' && playerId === wrongPlayer) {
			return;
		}

		// Set the new selection
		correctPlayer = playerId;
	}

	function handleWrongPlayerClick(playerId: string | 'none' | null) {
		// Allow toggling off the current selection
		if (wrongPlayer === playerId) {
			wrongPlayer = null;
			return;
		}

		// Can't select a player who is already marked as correct
		if (playerId !== null && playerId !== 'none' && playerId === correctPlayer) {
			return;
		}

		// Set the new selection
		wrongPlayer = playerId;
	}
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
												>{$_('scoring.points', {
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
										>{$_('scoring.points', { values: { points: 0 } })}</span
									>
								</button>
							</div>
						</div>
					{:else if mode === 'classic'}
						<!-- Multi-player Classic Mode: Table Layout -->
						<div class="flex flex-col gap-1 overflow-hidden rounded-xl">
							<!-- Header Row -->
							<div class="grid grid-cols-[120px_repeat(6,1fr)] gap-1">
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
								<div class="grid grid-cols-[120px_repeat(6,1fr)] gap-1">
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
											class="flex cursor-pointer items-center justify-center border-2 bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
											class:border-cyan-400={isSelected}
											class:border-transparent={!isSelected}
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
										class="flex cursor-pointer items-center justify-center border-2 bg-gray-700 p-2 px-2 transition-all duration-200 hover:bg-gray-600"
										class:border-cyan-400={selectedCells.has(`${player.name}:none`)}
										class:border-transparent={!selectedCells.has(`${player.name}:none`)}
										onclick={() => toggleCell(player.name, 'none')}
									>
										{#if selectedCells.has(`${player.name}:none`)}
											<span class="text-base font-bold text-white"
												>{$_('scoring.points', { values: { points: 0 } })}</span
											>
										{/if}
									</button>
								</div>
							{/each}
						</div>
					{:else if mode === 'buzzer'}
						<!-- Buzzer Mode: Simple Selection -->
						<div class="flex flex-col gap-4">
							<p class="text-center text-lg font-semibold text-white">
								{$_('scoring.correctGuess')}
							</p>
							<div class="flex flex-wrap justify-center gap-3">
								{#each players as player}
									<button
										type="button"
										class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3.5 py-2.5 text-sm font-semibold text-white transition-all duration-200"
										class:border-white={correctPlayer === player.name}
										class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={correctPlayer === player.name}
										class:opacity-30={wrongPlayer === player.name}
										class:cursor-not-allowed={wrongPlayer === player.name}
										class:hover:opacity-90={wrongPlayer !== player.name}
										disabled={wrongPlayer === player.name}
										style="background-color: {correctPlayer === player.name
											? player.color
											: 'rgb(55, 65, 81)'}; border-color: {correctPlayer === player.name
											? 'white'
											: player.color};"
										onclick={() => handleCorrectPlayerClick(player.name)}
									>
										<div
											class="mr-2 h-3 w-3 rounded-full"
											class:bg-white={correctPlayer === player.name}
											style:background-color={correctPlayer === player.name
												? 'white'
												: player.color}
										></div>
										{player.name}
									</button>
								{/each}
								<!-- No one option -->
								<button
									type="button"
									class="flex cursor-pointer items-center gap-2 rounded-lg border-2 bg-gray-700 px-3.5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-gray-600"
									class:border-white={correctPlayer === 'none'}
									class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={correctPlayer === 'none'}
									class:border-gray-700={correctPlayer !== 'none'}
									onclick={() => handleCorrectPlayerClick('none')}
								>
									{$_('scoring.noOne')}
								</button>
							</div>

							<p class="mt-2 text-center text-lg font-semibold text-white">
								{$_('scoring.wrongGuess')}
							</p>
							<div class="flex flex-wrap justify-center gap-3">
								{#each players as player}
									<button
										type="button"
										class="flex cursor-pointer items-center gap-2 rounded-lg border-2 px-3.5 py-2.5 text-sm font-semibold text-white transition-all duration-200"
										class:border-white={wrongPlayer === player.name}
										class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={wrongPlayer === player.name}
										class:opacity-30={correctPlayer === player.name}
										class:cursor-not-allowed={correctPlayer === player.name}
										class:hover:opacity-90={correctPlayer !== player.name}
										disabled={correctPlayer === player.name}
										style="background-color: {wrongPlayer === player.name
											? player.color
											: 'rgb(55, 65, 81)'}; border-color: {wrongPlayer === player.name
											? 'white'
											: player.color};"
										onclick={() => handleWrongPlayerClick(player.name)}
									>
										<div
											class="mr-2 h-3 w-3 rounded-full"
											class:bg-white={wrongPlayer === player.name}
											style:background-color={wrongPlayer === player.name ? 'white' : player.color}
										></div>
										{player.name}
									</button>
								{/each}
								<!-- No one option -->
								<button
									type="button"
									class="flex cursor-pointer items-center gap-2 rounded-lg border-2 bg-gray-700 px-3.5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-gray-600"
									class:border-white={wrongPlayer === 'none'}
									class:shadow-[0_0_15px_rgba(255,255,255,0.3)]={wrongPlayer === 'none'}
									class:border-gray-700={wrongPlayer !== 'none'}
									onclick={() => handleWrongPlayerClick('none')}
								>
									{$_('scoring.noOne')}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/snippet}
</Popup>
