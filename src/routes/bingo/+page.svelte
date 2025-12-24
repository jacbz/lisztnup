<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly, scale } from 'svelte/transition';
	import { settings } from '$lib/stores';
	import type { BingoGridCell, GuessCategory } from '$lib/types';
	import { allCategories, getCategoryDefinition } from '$lib/data/categories';
	import { _ } from 'svelte-i18n';
	import X from 'lucide-svelte/icons/x';
	import RefreshCw from 'lucide-svelte/icons/refresh-cw';
	import Printer from 'lucide-svelte/icons/printer';
	import Dialog from '$lib/components/ui/primitives/Dialog.svelte';
	import Logo from '$lib/components/ui/primitives/Logo.svelte';

	let grid = $state<BingoGridCell[][]>([]);
	let showResetDialog = $state(false);
	let showQuitDialog = $state(false);
	let guessText = $state('');
	let guessState = $state<'input' | 'hidden' | 'revealed'>('input');
	let inputElement: HTMLTextAreaElement | undefined = $state();
	let winningCells = $state<Set<string>>(new Set());

	// Category weights: composer 7, work 6, era 5, type 4, decade 3 (total 25)
	const CATEGORY_WEIGHTS = {
		composer: 6,
		work: 6,
		era: 5,
		type: 4,
		decade: 4
	};

	// Generate a weighted random grid with constraints
	function generateGrid(): BingoGridCell[][] {
		const grid: BingoGridCell[][] = Array(5)
			.fill(null)
			.map(() => Array(5).fill(null));

		// Create weighted pool (25 items)
		const pool: GuessCategory[] = [];
		for (const cat of allCategories) {
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

		const pool: GuessCategory[] = [];
		for (const cat of allCategories) {
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

	function checkVictory() {
		const newWinningCells = new Set<string>();

		// Check rows
		for (let row = 0; row < 5; row++) {
			if (grid[row].every((cell) => cell.marked)) {
				for (let col = 0; col < 5; col++) {
					newWinningCells.add(`${row}-${col}`);
				}
			}
		}

		// Check columns
		for (let col = 0; col < 5; col++) {
			if (grid.every((row) => row[col].marked)) {
				for (let row = 0; row < 5; row++) {
					newWinningCells.add(`${row}-${col}`);
				}
			}
		}

		// Check diagonal (top-left to bottom-right)
		if (grid.every((row, i) => row[i].marked)) {
			for (let i = 0; i < 5; i++) {
				newWinningCells.add(`${i}-${i}`);
			}
		}

		// Check diagonal (top-right to bottom-left)
		if (grid.every((row, i) => row[4 - i].marked)) {
			for (let i = 0; i < 5; i++) {
				newWinningCells.add(`${i}-${4 - i}`);
			}
		}

		winningCells = newWinningCells;
	}

	function toggleCell(rowIndex: number, colIndex: number) {
		grid[rowIndex][colIndex].marked = !grid[rowIndex][colIndex].marked;
		saveGrid();
		checkVictory();
	}

	function handleReset() {
		showResetDialog = true;
	}

	function confirmReset() {
		grid = generateGrid();
		saveGrid();
		winningCells = new Set();
		showResetDialog = false;
	}

	function handleHomeClick() {
		showQuitDialog = true;
	}

	function confirmQuit() {
		window.location.href = '/';
	}

	function handlePrint() {
		window.print();
	}

	function handleGuessInput() {
		guessText = '';
		guessState = 'input';
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
		checkVictory();
	});
</script>

<svelte:head>
	<title>{$_('app.title')} - Bingo</title>
	<style>
		@keyframes winningGlow {
			0%,
			100% {
				box-shadow:
					0 0 20px rgba(255, 255, 255, 0.4),
					0 0 10px rgba(255, 255, 255, 0.3);
				border-color: rgba(255, 255, 255, 0.8);
			}
			50% {
				box-shadow:
					0 0 40px rgba(255, 255, 255, 0.8),
					0 0 20px rgba(255, 255, 255, 0.6),
					0 0 10px rgba(255, 255, 255, 0.4);
				border-color: rgba(255, 255, 255, 1);
			}
		}

		.winning-cell {
			animation: winningGlow 2s ease-in-out infinite;
		}

		@media print {
			@page {
				margin: 0;
				size: auto;
			}

			body {
				margin: 0;
				padding: 0;
			}

			/* Hide buttons and guess box */
			.no-print {
				display: none !important;
			}

			/* Show footer only on print */
			.print-only {
				display: block !important;
			}

			.grid {
				width: 100%;
			}

			/* Disable animations on print */
			.winning-cell {
				animation: none !important;
			}
		}

		/* Hide footer on screen */
		.print-only {
			display: none;
		}
	</style>
</svelte:head>

<div class="fixed inset-0 flex flex-col text-white">
	{#if grid.length > 0}
		<!-- Header -->
		<div
			class="absolute flex w-full items-center justify-between p-4 sm:p-6"
			transition:fly={{ y: -100, duration: 500, delay: 300 }}
		>
			<Logo onClick={handleHomeClick} size="medium" />
			<div class="no-print flex gap-2">
				<button
					type="button"
					onclick={handlePrint}
					class="flex items-center gap-2 rounded-lg border-2 border-purple-400/30 bg-slate-900/50 px-3 py-2 text-purple-400 transition-all hover:border-purple-400 hover:bg-slate-800/70 sm:px-4"
				>
					<Printer class="h-5 w-5" />
					<span class="hidden sm:inline">{$_('bingo.print', { default: 'Print' })}</span>
				</button>
				<button
					type="button"
					onclick={handleReset}
					class="flex items-center gap-2 rounded-lg border-2 border-purple-400/30 bg-slate-900/50 px-3 py-2 text-purple-400 transition-all hover:border-purple-400 hover:bg-slate-800/70 sm:px-4"
				>
					<RefreshCw class="h-5 w-5" />
					<span class="hidden sm:inline">{$_('bingo.reset', { default: 'Reset' })}</span>
				</button>
			</div>
		</div>
		<!-- Main Content -->
		<div
			class="flex flex-1 flex-col items-center justify-center overflow-hidden p-4"
			transition:scale={{ duration: 800 }}
		>
			<div
				class="flex h-full w-full max-w-2xl flex-col items-center justify-center gap-12 pt-16 md:p-4 xl:p-4"
			>
				<!-- Grid - Responsive size -->
				<div class="grid grid-cols-5 gap-1 md:gap-2">
					{#each grid as row, rowIndex}
						{#each row as cell, colIndex}
							{@const categoryDef = getCategoryDefinition(cell.category)}
							{@const isWinning = winningCells.has(`${rowIndex}-${colIndex}`)}
							<button
								type="button"
								onclick={() => toggleCell(rowIndex, colIndex)}
								class="relative flex aspect-square cursor-pointer items-center justify-center rounded-lg border-2 p-2 transition-all"
								class:winning-cell={isWinning}
								style="border-color: {isWinning
									? '#ffffff'
									: categoryDef?.color1 || '#06b6d4'}; background-color: {isWinning
									? '#ffffff40'
									: cell.marked
										? categoryDef?.color1 + '80'
										: categoryDef?.color1 + '20'}; --cell-bg-unmarked: {(categoryDef?.color1 ||
									'#06b6d4') + '20'};"
							>
								<!-- Category Icon (hidden when marked) -->
								<div
									class="w-14 items-center justify-center sm:w-16 lg:w-20"
									class:opacity-0={cell.marked}
								>
									{#if categoryDef}
										<svg viewBox="0 0 24 24" class="opacity-30" style="fill: {categoryDef.color1};">
											{#each categoryDef.iconPaths as path}
												<path d={path} />
											{/each}
										</svg>
									{/if}
								</div>

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
					class="no-print flex w-full flex-1 flex-col overflow-hidden rounded-lg border-2 border-purple-500"
					transition:fade={{ duration: 300, delay: 800 }}
				>
					{#if guessState === 'input'}
						<div class="flex h-full flex-col gap-2">
							<!-- svelte-ignore a11y_autofocus -->
							<textarea
								id="guess-input"
								bind:this={inputElement}
								bind:value={guessText}
								autofocus
								class="flex-1 resize-none rounded-lg p-3 text-center text-4xl text-white placeholder-slate-500 focus:outline-none"
								placeholder={$_('bingo.guessPlaceholder')}
							></textarea>
							<button
								type="button"
								onclick={handleGuessClose}
								disabled={!guessText.trim()}
								class="shrink-0 bg-purple-500 px-4 py-2 font-semibold text-white transition-all hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{$_('bingo.closeGuess')}
							</button>
						</div>
					{:else}
						<button
							type="button"
							onclick={handleGuessClick}
							class="relative flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg text-5xl transition-all"
						>
							{#if guessState === 'hidden'}
								<div
									class="pointer-events-none absolute inset-0 z-10 bg-black/30 backdrop-blur-2xl"
									in:fade={{ duration: 220 }}
									out:fade={{ duration: 220 }}
								></div>
								<div
									class="absolute inset-0 z-20 flex items-center justify-center text-4xl font-light text-purple-400"
									in:fade={{ duration: 200 }}
									out:fade={{ duration: 160 }}
								>
									{$_('bingo.reveal')}
								</div>
							{/if}
							<div
								class="relative z-0 text-center font-bold text-white"
								class:select-none={guessState === 'hidden'}
							>
								{guessText}
							</div>
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Footer (Print Only) -->
	<div class="print-only absolute bottom-4 w-full text-center text-slate-400">
		<span class="text-sm">{$_('footer.madeBy')}</span>
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
