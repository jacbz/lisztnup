<script lang="ts">
	import { onMount } from 'svelte';
	import { settings } from '$lib/stores';
	import type { BingoGridCell } from '$lib/types';
	import { categories } from '$lib/data/categories';
	import { _ } from 'svelte-i18n';
	import X from 'lucide-svelte/icons/x';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Dialog from '$lib/components/ui/primitives/Dialog.svelte';
	import Logo from '$lib/components/ui/primitives/Logo.svelte';

	let grid = $state<BingoGridCell[][]>([]);
	let showResetDialog = $state(false);
	let showQuitDialog = $state(false);
	let guessText = $state('');
	let guessState = $state<'input' | 'hidden' | 'revealed'>('input');
	let inputElement: HTMLTextAreaElement | undefined = $state();

	// Category weights: composer 7, work 6, era 5, type 4, decade 3 (total 25)
	const CATEGORY_WEIGHTS = {
		composer: 7,
		work: 6,
		era: 5,
		type: 4,
		decade: 3
	};

	// Generate a weighted random grid with constraints
	function generateGrid(): BingoGridCell[][] {
		const grid: BingoGridCell[][] = Array(5)
			.fill(null)
			.map(() => Array(5).fill(null));

		// Create weighted pool (25 items)
		const pool: string[] = [];
		for (const cat of categories) {
			const weight = CATEGORY_WEIGHTS[cat.id as keyof typeof CATEGORY_WEIGHTS] || 0;
			for (let i = 0; i < weight; i++) {
				pool.push(cat.id);
			}
		}

		// Fill grid with constraints
		let attempts = 0;
		const maxAttempts = 1000;

		while (attempts < maxAttempts) {
			attempts++;
			let valid = true;

			// Shuffle pool
			const shuffled = [...pool].sort(() => Math.random() - 0.5);
			let poolIndex = 0;

			// Fill each cell
			for (let row = 0; row < 5; row++) {
				for (let col = 0; col < 5; col++) {
					// Try to place a category
					let placed = false;
					const startIndex = poolIndex;

					while (poolIndex < shuffled.length) {
						const category = shuffled[poolIndex];

						// Check constraints
						if (isValidPlacement(grid, row, col, category)) {
							grid[row][col] = { category, marked: false };
							poolIndex++;
							placed = true;
							break;
						}

						poolIndex++;
						if (poolIndex >= shuffled.length) {
							poolIndex = startIndex;
							break;
						}
					}

					if (!placed) {
						valid = false;
						break;
					}
				}
				if (!valid) break;
			}

			if (valid) {
				return grid;
			}
		}

		// Fallback: simpler generation if constraints can't be satisfied
		console.warn('Could not generate grid with constraints, using fallback');
		return generateSimpleGrid();
	}

	function isValidPlacement(
		grid: BingoGridCell[][],
		row: number,
		col: number,
		category: string
	): boolean {
		// Count category in row
		let rowCount = 0;
		for (let c = 0; c < col; c++) {
			if (grid[row][c]?.category === category) rowCount++;
		}
		if (rowCount >= 2) return false;

		// Count category in column
		let colCount = 0;
		for (let r = 0; r < row; r++) {
			if (grid[r][col]?.category === category) colCount++;
		}
		if (colCount >= 2) return false;

		// Check no more than 2 connected of same color in row
		if (col >= 1 && grid[row][col - 1]?.category === category) {
			if (col >= 2 && grid[row][col - 2]?.category === category) {
				return false;
			}
		}

		// Check no more than 2 connected of same color in column
		if (row >= 1 && grid[row - 1][col]?.category === category) {
			if (row >= 2 && grid[row - 2][col]?.category === category) {
				return false;
			}
		}

		return true;
	}

	function generateSimpleGrid(): BingoGridCell[][] {
		const grid: BingoGridCell[][] = Array(5)
			.fill(null)
			.map(() => Array(5).fill(null));

		const pool: string[] = [];
		for (const cat of categories) {
			const weight = CATEGORY_WEIGHTS[cat.id as keyof typeof CATEGORY_WEIGHTS] || 0;
			for (let i = 0; i < weight; i++) {
				pool.push(cat.id);
			}
		}

		const shuffled = [...pool].sort(() => Math.random() - 0.5);
		let poolIndex = 0;

		for (let row = 0; row < 5; row++) {
			for (let col = 0; col < 5; col++) {
				grid[row][col] = { category: shuffled[poolIndex % shuffled.length], marked: false };
				poolIndex++;
			}
		}

		return grid;
	}

	function saveGrid() {
		settings.update((s) => ({
			...s,
			bingoGrid: grid
		}));
	}

	function loadGrid() {
		const savedGrid = $settings.bingoGrid;
		if (savedGrid && savedGrid.length === 5 && savedGrid[0].length === 5) {
			console.log(
				'Loading saved bingo grid',
				savedGrid.map((row) => row.map((cell) => cell.category))
			);
			grid = savedGrid.map((row) =>
				row.map((cell) => ({
					category: cell.category,
					marked: cell.marked
				}))
			);
		} else {
			console.log('No valid saved grid found, generating new grid', $settings);
			grid = generateGrid();
			saveGrid();
		}
	}

	function toggleCell(rowIndex: number, colIndex: number) {
		grid[rowIndex][colIndex].marked = !grid[rowIndex][colIndex].marked;
		saveGrid();
	}

	function handleReset() {
		showResetDialog = true;
	}

	function confirmReset() {
		grid = generateGrid();
		saveGrid();
		showResetDialog = false;
	}

	function handleHomeClick() {
		showQuitDialog = true;
	}

	function confirmQuit() {
		window.location.href = '/';
	}

	function handleGuessInput() {
		guessState = 'input';
		setTimeout(() => inputElement?.focus(), 100);
	}

	function handleGuessClose() {
		if (guessText.trim()) {
			guessState = 'hidden';
		}
	}

	function handleGuessReveal() {
		guessState = 'revealed';
	}

	function handleGuessClick() {
		if (guessState === 'revealed') {
			handleGuessInput();
		} else if (guessState === 'hidden') {
			handleGuessReveal();
		}
	}

	onMount(() => {
		// Load settings from localStorage
		settings.load();
		loadGrid();
	});
</script>

<svelte:head>
	<title>{$_('app.title')} - Bingo</title>
</svelte:head>

<div class="fixed inset-0 flex flex-col text-white">
	<!-- Header -->
	<div class="absolute flex w-full items-center justify-between p-4 sm:p-6">
		<Logo onClick={handleHomeClick} size="medium" />
		<button
			type="button"
			onclick={handleReset}
			class="flex items-center gap-2 rounded-lg border-2 border-purple-400/30 bg-gray-900/50 px-3 py-2 text-purple-400 transition-all hover:border-purple-400 hover:bg-gray-800/70 sm:px-4"
		>
			<RefreshCw class="h-5 w-5" />
			<span class="hidden sm:inline">{$_('bingo.reset', { default: 'Reset' })}</span>
		</button>
	</div>

	<!-- Main Content - No scroll, flex layout -->
	<div class="flex flex-1 flex-col items-center justify-center overflow-hidden p-4">
		<div
			class="flex h-full w-full max-w-2xl flex-col items-center justify-center gap-12 pt-16 md:p-4 xl:p-4"
		>
			<!-- Grid - Responsive size -->
			<div class="grid aspect-square grid-cols-5 gap-2">
				{#each grid as row, rowIndex}
					{#each row as cell, colIndex}
						{@const categoryDef = categories.find((c) => c.id === cell.category)}
						<button
							type="button"
							onclick={() => toggleCell(rowIndex, colIndex)}
							class="relative aspect-square cursor-pointer rounded-lg border-2 p-2 transition-all"
							style="border-color: {categoryDef?.color1 ||
								'#06b6d4'}; background-color: {cell.marked
								? categoryDef?.color1 + '80'
								: categoryDef?.color1 + '20'};"
						>
							<!-- Category Icon (hidden when marked) -->
							{#if !cell.marked}
								<div class="flex h-full items-center justify-center">
									{#if categoryDef}
										<svg
											viewBox="0 0 24 24"
											class="h-10 w-10 opacity-20 sm:h-16 sm:w-16"
											style="fill: {categoryDef.color1};"
										>
											{#each categoryDef.iconPath as path}
												<path d={path} />
											{/each}
										</svg>
									{/if}
								</div>
							{/if}

							<!-- X Mark when marked -->
							{#if cell.marked}
								<div class="absolute inset-0 flex items-center justify-center rounded-lg">
									<X
										class="h-16 w-16 sm:h-24 sm:w-24"
										style="color: {categoryDef?.color1}; stroke-width: 4;"
									/>
								</div>
							{/if}
						</button>
					{/each}
				{/each}
			</div>

			<!-- Guess Panel - Fills remaining space -->
			<div
				class="flex w-full flex-1 flex-col rounded-lg border-2 border-purple-400/30 bg-gray-900/50 p-4"
			>
				{#if guessState === 'input'}
					<div class="flex h-full flex-col gap-2">
						<textarea
							id="guess-input"
							bind:this={inputElement}
							bind:value={guessText}
							class="flex-1 resize-none rounded-lg border-2 border-purple-400/30 bg-gray-800/50 p-3 text-4xl text-white placeholder-gray-500 focus:border-purple-400 focus:outline-none"
							placeholder={$_('bingo.guessPlaceholder', { default: 'Enter your guess...' })}
						></textarea>
						<button
							type="button"
							onclick={handleGuessClose}
							disabled={!guessText.trim()}
							class="shrink-0 rounded-lg bg-purple-500 px-4 py-2 font-semibold text-white transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
						>
							{$_('bingo.closeGuess', { default: 'Save Guess' })}
						</button>
					</div>
				{:else}
					<button
						type="button"
						onclick={handleGuessClick}
						class="flex h-full w-full flex-col items-center justify-center gap-2 text-5xl transition-all"
					>
						{#if guessState === 'hidden'}
							<div class="absolute text-purple-400">
								{$_('bingo.reveal')}
							</div>
							<div
								class="text-center font-bold text-white"
								style="filter: blur(10px); user-select: none;"
							>
								{guessText}
							</div>
						{:else}
							<div class="text-center font-bold text-white">
								{guessText}
							</div>
						{/if}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>

<Dialog
	visible={showResetDialog}
	title={$_('bingo.resetTitle', { default: 'Reset Grid?' })}
	message={$_('bingo.resetMessage', {
		default: 'This will generate a new random grid and clear all marks. Are you sure?'
	})}
	confirmText={$_('bingo.resetConfirm', { default: 'Reset' })}
	cancelText={$_('bingo.resetCancel', { default: 'Cancel' })}
	onConfirm={confirmReset}
	onCancel={() => (showResetDialog = false)}
/>

<Dialog
	visible={showQuitDialog}
	title={$_('game.quitTitle', { default: 'Leave Game?' })}
	message={$_('game.quitMessage', {
		default: 'Are you sure you want to leave? Your grid will be saved.'
	})}
	confirmText={$_('game.quitConfirm', { default: 'Leave' })}
	cancelText={$_('game.quitCancel', { default: 'Stay' })}
	onConfirm={confirmQuit}
	onCancel={() => (showQuitDialog = false)}
/>
