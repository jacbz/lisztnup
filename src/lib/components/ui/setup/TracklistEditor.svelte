<script lang="ts">
	import type { Tracklist, CategoryWeights, TracklistConfig, ComposerFilter } from '$lib/types';
	import {
		DEFAULT_CATEGORY_WEIGHTS,
		DEFAULT_TRACKLIST_CONFIG,
		MIN_WORK_SCORE_ROUNDED,
		MAX_WORK_SCORE_ROUNDED
	} from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator, SettingsService } from '$lib/services';
	import { DEFAULT_TRACKLISTS } from '$lib/data/defaultTracklists';
	import { get } from 'svelte/store';
	import Popup from '../primitives/Popup.svelte';
	import Slider from '../primitives/Slider.svelte';
	import RangeSlider from '../primitives/RangeSlider.svelte';
	import ToggleButton from '../primitives/ToggleButton.svelte';
	import { _ } from 'svelte-i18n';
	import { formatComposerName } from '$lib/utils';

	interface Props {
		visible?: boolean;
		tracklist?: Tracklist | null;
		onSave?: (tracklist: Tracklist) => void;
		onCancel?: () => void;
	}

	let {
		visible = false,
		tracklist = null,
		onSave = () => {},
		onCancel = () => {}
	}: Props = $props();

	// Local state for editing (not reactive to prop changes to avoid infinite loop)
	let name = $state('');
	let description = $state('');
	let config = $state<TracklistConfig>(JSON.parse(JSON.stringify(DEFAULT_TRACKLIST_CONFIG)));
	let originalTracklist = $state<Tracklist | null>(null);

	// Track which filters are enabled
	let categoryWeightsEnabled = $state(false);
	let composerFilterEnabled = $state(false);
	let yearFilterEnabled = $state(false);
	let workScoreRangeEnabled = $state(true);
	let limitWorksFromComposerEnabled = $state(false);
	let maxTracksFromSingleWorkEnabled = $state(false);
	let nameFilterEnabled = $state(false);
	let enablePopularityWeighting = $state(true);

	// Composer filter mode state
	let composerFilterMode = $state<'include' | 'exclude' | 'topN'>('include');
	let selectedComposers = $state<string[]>([]);
	let topNCount = $state(50);
	let composerSearchTerm = $state('');

	// Name filter state
	let nameFilterInput = $state('');
	let nameFilters = $state<string[]>([]);

	// Error state
	let nameError = $state<string | null>(null);

	// Preview state
	let previewInfo = $state<{ composers: number; works: number; tracks: number } | null>(null);
	let previewComposers = $state<
		Array<{
			name: string;
			gid: string;
			workCount: number;
			trackCount: number;
			works: Array<{ name: string }>;
		}>
	>([]);
	let previewCategories = $state<
		Array<{ category: string; composerCount: number; workCount: number; trackCount: number }>
	>([]);

	// Initialize from tracklist ONLY when visible changes to true
	$effect(() => {
		if (visible && tracklist !== originalTracklist) {
			originalTracklist = tracklist;
			nameError = null; // Clear any previous errors

			if (tracklist) {
				name = tracklist.name;
				description = tracklist.description;
				config = JSON.parse(JSON.stringify(tracklist.config)); // Deep clone

				// Set enabled flags
				categoryWeightsEnabled = config.categoryWeights !== undefined;
				workScoreRangeEnabled = config.workScoreRange !== undefined;
				limitWorksFromComposerEnabled = config.limitWorksFromComposer !== undefined;
				maxTracksFromSingleWorkEnabled = config.maxTracksFromSingleWork !== undefined;
				yearFilterEnabled = config.yearFilter !== undefined;
				nameFilterEnabled = config.nameFilter !== undefined && config.nameFilter.length > 0;
				enablePopularityWeighting = config.enablePopularityWeighting ?? true;

				// Name filter
				nameFilters = config.nameFilter ? [...config.nameFilter] : [];
				nameFilterInput = '';

				// Composer filter
				composerFilterEnabled = config.composerFilter !== undefined;
				if (config.composerFilter) {
					composerFilterMode = config.composerFilter.mode;
					if (
						config.composerFilter.mode === 'include' ||
						config.composerFilter.mode === 'exclude'
					) {
						selectedComposers = [...config.composerFilter.composers];
					} else {
						topNCount = config.composerFilter.count;
					}
				}
			} else {
				// Reset for new tracklist
				name = '';
				description = '';
				config = JSON.parse(JSON.stringify(DEFAULT_TRACKLIST_CONFIG));
				categoryWeightsEnabled = false;
				composerFilterEnabled = false;
				yearFilterEnabled = false;
				workScoreRangeEnabled = true;
				limitWorksFromComposerEnabled = false;
				maxTracksFromSingleWorkEnabled = false;
				nameFilterEnabled = false;
				enablePopularityWeighting = true;
				composerFilterMode = 'include';
				selectedComposers = [];
				topNCount = 50;
				nameFilters = [];
				nameFilterInput = '';
			}

			updatePreview();
		}
	});

	// Update preview when config changes
	$effect(() => {
		// Track dependencies for preview
		const deps = [
			categoryWeightsEnabled,
			composerFilterEnabled,
			yearFilterEnabled,
			workScoreRangeEnabled,
			limitWorksFromComposerEnabled,
			maxTracksFromSingleWorkEnabled,
			nameFilterEnabled,
			enablePopularityWeighting,
			JSON.stringify(config),
			JSON.stringify(nameFilters)
		];

		if (visible) {
			updatePreview();
		}
	});

	function updatePreview() {
		const data = get(gameData);
		if (!data) {
			previewInfo = null;
			previewComposers = [];
			previewCategories = [];
			return;
		}

		try {
			// Build temporary tracklist for preview
			const tempTracklist: Tracklist = {
				name: 'preview',
				description: 'preview',
				isDefault: false,
				config: buildCurrentConfig()
			};

			const generator = new TracklistGenerator(data, tempTracklist);
			previewInfo = generator.getInfo();

			// Build composer list with work details
			const composerWorkMap = new Map<
				string,
				{ name: string; gid: string; works: Array<{ name: string }>; trackCount: number }
			>();

			// Access filtered works from generator
			const filteredData = generator.getFilteredData();

			filteredData.works.forEach((work) => {
				if (!composerWorkMap.has(work.composer)) {
					const composer = data.composers.find((c) => c.gid === work.composer);
					if (composer) {
						composerWorkMap.set(work.composer, {
							name: composer.name,
							gid: composer.gid,
							works: [],
							trackCount: 0
						});
					}
				}
				const composerData = composerWorkMap.get(work.composer);
				if (composerData) {
					composerData.works.push({ name: work.name });
					composerData.trackCount += work.parts.length;
				}
			});

			// Convert to array and sort by work count (descending)
			previewComposers = Array.from(composerWorkMap.values())
				.map((composer) => ({
					...composer,
					workCount: composer.works.length
				}))
				.sort((a, b) => b.workCount - a.workCount);

			// Build category breakdown
			const categoryMap = new Map<
				string,
				{ composers: Set<string>; workCount: number; trackCount: number }
			>();
			filteredData.works.forEach((work) => {
				if (!categoryMap.has(work.type)) {
					categoryMap.set(work.type, { composers: new Set(), workCount: 0, trackCount: 0 });
				}
				const categoryData = categoryMap.get(work.type)!;
				categoryData.composers.add(work.composer);
				categoryData.workCount++;
				categoryData.trackCount += work.parts.length;
			});

			// Convert to array and sort by work count (descending)
			previewCategories = Array.from(categoryMap.entries())
				.map(([category, data]) => ({
					category,
					composerCount: data.composers.size,
					workCount: data.workCount,
					trackCount: data.trackCount
				}))
				.sort((a, b) => b.workCount - a.workCount);
		} catch (error) {
			console.error('Error generating preview:', error);
			previewInfo = { composers: 0, works: 0, tracks: 0 };
			previewComposers = [];
			previewCategories = [];
		}
	}

	function buildCurrentConfig(): TracklistConfig {
		const newConfig: TracklistConfig = {};

		if (categoryWeightsEnabled && config.categoryWeights) {
			newConfig.categoryWeights = config.categoryWeights;
		}

		if (composerFilterEnabled) {
			const filter = buildComposerFilter();
			if (filter) {
				newConfig.composerFilter = filter;
			}
		}

		if (yearFilterEnabled && config.yearFilter) {
			newConfig.yearFilter = config.yearFilter;
		}

		if (workScoreRangeEnabled && config.workScoreRange) {
			newConfig.workScoreRange = config.workScoreRange;
		}

		if (limitWorksFromComposerEnabled && config.limitWorksFromComposer !== undefined) {
			newConfig.limitWorksFromComposer = config.limitWorksFromComposer;
		}

		if (maxTracksFromSingleWorkEnabled && config.maxTracksFromSingleWork !== undefined) {
			newConfig.maxTracksFromSingleWork = config.maxTracksFromSingleWork;
		}

		if (nameFilterEnabled && nameFilters.length > 0) {
			newConfig.nameFilter = nameFilters;
		}

		// Always include enablePopularityWeighting (defaults to true)
		newConfig.enablePopularityWeighting = enablePopularityWeighting;

		return newConfig;
	}

	function buildComposerFilter(): ComposerFilter | undefined {
		if (!composerFilterEnabled) return undefined;

		if (composerFilterMode === 'include') {
			return { mode: 'include', composers: selectedComposers };
		} else if (composerFilterMode === 'exclude') {
			return { mode: 'exclude', composers: selectedComposers };
		} else {
			return { mode: 'topN', count: topNCount };
		}
	}

	function handleCategoryWeightChange(category: keyof CategoryWeights, value: number) {
		if (config.categoryWeights) {
			config.categoryWeights = { ...config.categoryWeights, [category]: value };
		}
	}

	function toggleCategoryWeights() {
		categoryWeightsEnabled = !categoryWeightsEnabled;
		if (categoryWeightsEnabled) {
			config.categoryWeights = config.categoryWeights || { ...DEFAULT_CATEGORY_WEIGHTS };
		} else {
			config.categoryWeights = undefined;
		}
	}

	function toggleComposerFilter() {
		composerFilterEnabled = !composerFilterEnabled;
		if (!composerFilterEnabled) {
			selectedComposers = [];
		}
	}

	function toggleYearFilter() {
		yearFilterEnabled = !yearFilterEnabled;
		if (yearFilterEnabled) {
			config.yearFilter = config.yearFilter || [1400, 2000];
		} else {
			config.yearFilter = undefined;
		}
	}

	function toggleWorkScoreRange() {
		workScoreRangeEnabled = !workScoreRangeEnabled;
		if (workScoreRangeEnabled) {
			config.workScoreRange = config.workScoreRange || [
				MIN_WORK_SCORE_ROUNDED,
				MAX_WORK_SCORE_ROUNDED
			];
		} else {
			config.workScoreRange = undefined;
		}
	}

	function toggleLimitWorksFromComposer() {
		limitWorksFromComposerEnabled = !limitWorksFromComposerEnabled;
		if (limitWorksFromComposerEnabled) {
			config.limitWorksFromComposer = config.limitWorksFromComposer ?? 0.1; // Default 10%
		} else {
			config.limitWorksFromComposer = undefined;
		}
	}

	function toggleMaxTracksFromSingleWork() {
		maxTracksFromSingleWorkEnabled = !maxTracksFromSingleWorkEnabled;
		if (maxTracksFromSingleWorkEnabled) {
			config.maxTracksFromSingleWork = config.maxTracksFromSingleWork ?? 3;
		} else {
			config.maxTracksFromSingleWork = undefined;
		}
	}

	function toggleNameFilter() {
		nameFilterEnabled = !nameFilterEnabled;
		if (!nameFilterEnabled) {
			nameFilters = [];
			nameFilterInput = '';
		}
	}

	function addNameFilter() {
		const trimmed = nameFilterInput.trim();
		if (trimmed && !nameFilters.includes(trimmed)) {
			nameFilters = [...nameFilters, trimmed];
			nameFilterInput = '';
		}
	}

	function removeNameFilter(filter: string) {
		nameFilters = nameFilters.filter((f) => f !== filter);
	}

	function handleNameFilterKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			addNameFilter();
		}
	}

	function toggleComposer(composerGid: string) {
		if (selectedComposers.includes(composerGid)) {
			selectedComposers = selectedComposers.filter((c) => c !== composerGid);
		} else {
			selectedComposers = [...selectedComposers, composerGid];
		}
	}

	function selectAllComposers() {
		const data = get(gameData);
		if (data) {
			selectedComposers = data.composers.map((c) => c.gid);
		}
	}

	function selectNoneComposers() {
		selectedComposers = [];
	}

	function handleSave() {
		if (!name.trim()) {
			nameError = 'Name cannot be empty';
			return;
		}

		// Check for duplicate names (excluding the current tracklist being edited)
		const customTracklists = SettingsService.loadCustomTracklists();
		const allTracklists = [...DEFAULT_TRACKLISTS, ...customTracklists];

		// Allow saving if we're editing the same tracklist (name unchanged) or renaming to a unique name
		const isDuplicate = allTracklists.some(
			(t) => t.name === name.trim() && t.name !== originalTracklist?.name
		);

		if (isDuplicate) {
			nameError = 'A tracklist with this name already exists';
			return;
		}

		nameError = null;

		const savedTracklist: Tracklist = {
			name: name.trim(),
			description: description.trim(),
			isDefault: false,
			config: buildCurrentConfig()
		};

		// Pass the old name if it's being renamed
		const oldName =
			originalTracklist?.name !== savedTracklist.name ? originalTracklist?.name : undefined;
		SettingsService.saveCustomTracklist(savedTracklist, oldName);

		onSave(savedTracklist);
	}

	// Get filtered and sorted composer list for UI
	const composerList = $derived.by(() => {
		const data = get(gameData);
		if (!data) return [];

		let composers = [...data.composers];

		// Filter by search term
		if (composerSearchTerm.trim()) {
			const search = composerSearchTerm.toLowerCase();
			composers = composers.filter((c) => c.name.toLowerCase().includes(search));
		}

		// Sort alphabetically
		composers.sort((a, b) => a.name.localeCompare(b.name));

		return composers;
	});
</script>

<Popup {visible} onClose={onCancel} width="5xl">
	<h2 class="mb-6 text-2xl font-bold text-cyan-400">
		{originalTracklist ? $_('tracklistEditor.editTitle') : $_('tracklistEditor.createTitle')}
	</h2>

	<div class="grid gap-6 lg:grid-cols-3">
		<!-- Left column: Filters (2/3 width) -->
		<div class="space-y-4 lg:col-span-2">
			<!-- Name and Description -->
			<div class="space-y-3">
				<div>
					<label for="tracklist-name" class="mb-1 block text-sm font-semibold text-cyan-300">
						{$_('tracklistEditor.name')}
					</label>
					<input
						id="tracklist-name"
						type="text"
						bind:value={name}
						oninput={() => (nameError = null)}
						placeholder="My Custom Tracklist"
						class="w-full rounded-lg border-2 {nameError
							? 'border-red-500'
							: 'border-slate-700'} bg-slate-800 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
					/>
					{#if nameError}
						<p class="mt-1 text-sm text-red-500">{nameError}</p>
					{/if}
				</div>
				<div>
					<label for="tracklist-desc" class="mb-1 block text-sm font-semibold text-cyan-300">
						{$_('tracklistEditor.description')}
					</label>
					<textarea
						id="tracklist-desc"
						bind:value={description}
						placeholder="Description of your tracklist..."
						rows="2"
						class="w-full rounded-lg border-2 border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
					></textarea>
				</div>
			</div>

			<h3 class="mb-1 text-lg font-semibold text-purple-400">{$_('tracklistEditor.filters')}</h3>
			<p class="text-sm text-slate-400">{$_('tracklistEditor.filtersDescription')}</p>

			<!-- Work Score Range (Popularity) -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300">{$_('tracklistEditor.workScoreRange')}</span>
						<p class="text-xs text-slate-400">{$_('tracklistEditor.workScoreRangeDesc')}</p>
					</div>
					<ToggleButton value={workScoreRangeEnabled} onToggle={toggleWorkScoreRange} />
				</div>
				{#if workScoreRangeEnabled && config.workScoreRange}
					<RangeSlider
						bind:valueMin={config.workScoreRange[0]}
						bind:valueMax={config.workScoreRange[1]}
						min={MIN_WORK_SCORE_ROUNDED}
						max={MAX_WORK_SCORE_ROUNDED}
						step={0.1}
						label=""
					/>
				{/if}
			</div>

			<!-- Category Weights -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300">{$_('tracklistEditor.categoryWeights')}</span>
						<p class="text-xs text-slate-400">{$_('tracklistEditor.categoryWeightsDesc')}</p>
					</div>
					<ToggleButton value={categoryWeightsEnabled} onToggle={toggleCategoryWeights} />
				</div>
				{#if categoryWeightsEnabled && config.categoryWeights}
					<div class="grid grid-cols-2 gap-3">
						{#each Object.keys(config.categoryWeights) as category}
							<Slider
								value={config.categoryWeights[category as keyof CategoryWeights]}
								min={0}
								max={10}
								step={0.1}
								label={$_(`settings.categories.${category}`)}
								showValue={false}
								onChange={(val) =>
									handleCategoryWeightChange(category as keyof CategoryWeights, val)}
							/>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Composer Filter -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300">{$_('tracklistEditor.composerFilter')}</span>
						<p class="text-xs text-slate-400">{$_('tracklistEditor.composerFilterDesc')}</p>
					</div>
					<ToggleButton value={composerFilterEnabled} onToggle={toggleComposerFilter} />
				</div>
				{#if composerFilterEnabled}
					<!-- Mode selector -->
					<div class="mb-3 flex gap-2">
						<button
							type="button"
							onclick={() => (composerFilterMode = 'include')}
							class="flex-1 rounded-lg px-3 py-2 text-sm {composerFilterMode === 'include'
								? 'bg-cyan-500 text-white'
								: 'bg-slate-700 text-slate-300'}"
						>
							{$_('tracklistEditor.includeMode')}
						</button>
						<button
							type="button"
							onclick={() => (composerFilterMode = 'exclude')}
							class="flex-1 rounded-lg px-3 py-2 text-sm {composerFilterMode === 'exclude'
								? 'bg-cyan-500 text-white'
								: 'bg-slate-700 text-slate-300'}"
						>
							{$_('tracklistEditor.excludeMode')}
						</button>
						<button
							type="button"
							onclick={() => (composerFilterMode = 'topN')}
							class="flex-1 rounded-lg px-3 py-2 text-sm {composerFilterMode === 'topN'
								? 'bg-cyan-500 text-white'
								: 'bg-slate-700 text-slate-300'}"
						>
							{$_('tracklistEditor.topNMode')}
						</button>
					</div>

					{#if composerFilterMode === 'topN'}
						<!-- Top N slider -->
						<Slider
							value={topNCount}
							min={5}
							max={200}
							step={5}
							label={$_('tracklistEditor.topNComposers')}
							showValue={true}
							onChange={(val) => (topNCount = val)}
						/>
					{:else}
						<!-- Composer selection -->
						<div class="space-y-2">
							<div class="flex gap-2">
								<input
									type="text"
									bind:value={composerSearchTerm}
									placeholder={$_('tracklistEditor.searchComposers')}
									class="flex-1 rounded-lg border-2 border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
								/>
								<button
									type="button"
									onclick={selectAllComposers}
									class="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
									title={$_('tracklistEditor.selectAll')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M20 6 9 17l-5-5"></path>
									</svg>
								</button>
								<button
									type="button"
									onclick={selectNoneComposers}
									class="rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-600"
									title={$_('tracklistEditor.selectNone')}
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path d="M18 6 6 18"></path>
										<path d="m6 6 12 12"></path>
									</svg>
								</button>
							</div>
							<div
								class="max-h-48 overflow-y-auto rounded-lg border-2 border-slate-700 bg-slate-800 p-2"
							>
								<div class="grid grid-cols-2 gap-1">
									{#each composerList as composer}
										<label
											class="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-700"
										>
											<input
												type="checkbox"
												checked={selectedComposers.includes(composer.gid)}
												onchange={() => toggleComposer(composer.gid)}
												class="rounded border-slate-600 bg-slate-700 text-cyan-500 focus:ring-cyan-500"
											/>
											<span class="text-slate-300">{composer.name}</span>
										</label>
									{/each}
								</div>
							</div>
							<p class="text-xs text-slate-400">
								{selectedComposers.length}
								{$_('tracklistEditor.composersSelected')}
							</p>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Year Filter -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300">{$_('tracklistEditor.yearFilter')}</span>
						<p class="text-xs text-slate-400">{$_('tracklistEditor.yearFilterDesc')}</p>
					</div>
					<ToggleButton value={yearFilterEnabled} onToggle={toggleYearFilter} />
				</div>
				{#if yearFilterEnabled && config.yearFilter}
					<RangeSlider
						bind:valueMin={config.yearFilter[0]}
						bind:valueMax={config.yearFilter[1]}
						min={1400}
						max={2000}
						step={10}
						label=""
					/>
				{/if}
			</div>

			<!-- Name Filter -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300">{$_('tracklistEditor.nameFilter')}</span>
						<p class="text-xs text-slate-400">{$_('tracklistEditor.nameFilterDesc')}</p>
					</div>
					<ToggleButton value={nameFilterEnabled} onToggle={toggleNameFilter} />
				</div>
				{#if nameFilterEnabled}
					<div class="space-y-2">
						<!-- Input field with add button -->
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={nameFilterInput}
								onkeydown={handleNameFilterKeydown}
								placeholder={$_('tracklistEditor.nameFilterPlaceholder')}
								class="flex-1 rounded-lg border-2 border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
							/>
							<button
								type="button"
								onclick={addNameFilter}
								disabled={!nameFilterInput.trim()}
								class="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
							>
								{$_('tracklistEditor.nameFilterAdd')}
							</button>
						</div>

						<!-- Chips display -->
						{#if nameFilters.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each nameFilters as filter}
									{@const isRegex = filter.startsWith('/') && filter.endsWith('/')}
									{@const displayText = isRegex ? filter.slice(1, -1) : filter}
									<div
										class="flex items-center gap-2 rounded-full border-2 px-3 py-1 text-sm {isRegex
											? 'border-purple-500 bg-purple-500/20 text-purple-300'
											: 'border-cyan-500 bg-cyan-500/20 text-cyan-300'}"
									>
										<span class={isRegex ? 'font-mono text-xs' : ''}>{displayText}</span>
										<button
											type="button"
											onclick={() => removeNameFilter(filter)}
											class="hover:text-white"
											aria-label="Remove filter"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												viewBox="0 0 20 20"
												fill="currentColor"
											>
												<path
													fill-rule="evenodd"
													d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
													clip-rule="evenodd"
												/>
											</svg>
										</button>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Limit Works from Composer -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300"
							>{$_('tracklistEditor.limitWorksFromComposer')}</span
						>
						<p class="text-xs text-slate-400">
							{$_('tracklistEditor.limitWorksFromComposerDesc')}
						</p>
					</div>
					<ToggleButton
						value={limitWorksFromComposerEnabled}
						onToggle={toggleLimitWorksFromComposer}
					/>
				</div>
				{#if limitWorksFromComposerEnabled && config.limitWorksFromComposer !== undefined}
					<Slider
						value={Math.round(config.limitWorksFromComposer * 100 * 10) / 10}
						min={0.1}
						max={30}
						step={0.1}
						label=""
						showValue={true}
						valueSuffix="%"
						onChange={(val) => (config.limitWorksFromComposer = val / 100)}
					/>
				{/if}
			</div>

			<!-- Max Tracks from Single Work -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300"
							>{$_('tracklistEditor.maxTracksFromSingleWork')}</span
						>
						<p class="text-xs text-slate-400">
							{$_('tracklistEditor.maxTracksFromSingleWorkDesc')}
						</p>
					</div>
					<ToggleButton
						value={maxTracksFromSingleWorkEnabled}
						onToggle={toggleMaxTracksFromSingleWork}
					/>
				</div>
				{#if maxTracksFromSingleWorkEnabled && config.maxTracksFromSingleWork !== undefined}
					<Slider
						value={config.maxTracksFromSingleWork}
						min={1}
						max={20}
						step={1}
						label=""
						showValue={true}
						onChange={(val) => (config.maxTracksFromSingleWork = val)}
					/>
				{/if}
			</div>

			<!-- Popularity Weighting -->
			<div class="rounded-lg border-2 border-slate-700 bg-slate-800/50 p-4">
				<div class="flex items-center justify-between">
					<div>
						<span class="font-semibold text-cyan-300"
							>{$_('tracklistEditor.enablePopularityWeighting')}</span
						>
						<p class="text-xs text-slate-400">
							{$_('tracklistEditor.enablePopularityWeightingDesc')}
						</p>
					</div>
					<ToggleButton
						value={enablePopularityWeighting}
						onToggle={() => (enablePopularityWeighting = !enablePopularityWeighting)}
					/>
				</div>
			</div>
		</div>

		<!-- Right column: Preview (1/3 width) -->
		<div class="lg:col-span-1">
			<div class="sticky top-6 rounded-lg border-2 border-purple-500 bg-slate-800/50 p-4">
				<h3 class="mb-3 text-lg font-bold text-purple-400">{$_('tracklistEditor.preview')}</h3>
				{#if previewInfo}
					<div class="space-y-3">
						<!-- Summary stats -->
						<div class="space-y-2 text-sm">
							<div class="flex justify-between">
								<span class="text-slate-400">{$_('tracklistEditor.previewComposers')}</span>
								<span
									class="rounded-full bg-yellow-500/20 px-2 py-0.5 font-semibold text-yellow-300"
									>{previewInfo.composers}</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-400">{$_('tracklistEditor.previewWorks')}</span>
								<span class="rounded-full bg-cyan-500/20 px-2 py-0.5 font-semibold text-cyan-300"
									>{previewInfo.works}</span
								>
							</div>
							<div class="flex justify-between">
								<span class="text-slate-400">{$_('tracklistEditor.previewTracks')}</span>
								<span
									class="rounded-full bg-purple-500/20 px-2 py-0.5 font-semibold text-purple-300"
									>{previewInfo.tracks}</span
								>
							</div>
						</div>

						<!-- Categories breakdown -->
						{#if previewCategories.length > 0}
							<div class="border-t border-slate-700 pt-3">
								<h4 class="mb-2 text-xs font-semibold text-slate-400 uppercase">Categories</h4>
								<div class="space-y-1 rounded-lg border border-slate-700 bg-slate-800/30 p-2">
									{#each previewCategories as category}
										<div class="flex items-center justify-between rounded px-2 py-1 text-xs">
											<span class="text-slate-300 capitalize"
												>{$_(`settings.categories.${category.category}`)}</span
											>
											<div class="flex gap-1 text-xs">
												<span
													class="rounded-full bg-yellow-500/20 px-2 py-0.5 font-semibold text-yellow-300"
												>
													{category.composerCount}
												</span>
												<span
													class="rounded-full bg-cyan-500/20 px-2 py-0.5 font-semibold text-cyan-300"
												>
													{category.workCount}
												</span>
												<span
													class="rounded-full bg-purple-500/20 px-2 py-0.5 font-semibold text-purple-300"
												>
													{category.trackCount}
												</span>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Composer list -->
						{#if previewComposers.length > 0}
							<div class="border-t border-slate-700 pt-3">
								<h4 class="mb-2 text-xs font-semibold text-slate-400 uppercase">Composers</h4>
								<div
									class="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/30 p-2"
								>
									{#each previewComposers as composer}
										<div
											class="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-slate-700/50"
											title={composer.works
												.slice(0, 20)
												.map((w) => w.name)
												.join('\n') +
												(composer.works.length > 20
													? `\n... and ${composer.works.length - 20} more`
													: '')}
										>
											<span class="truncate text-slate-300"
												>{formatComposerName(composer.name)}</span
											>
											<div class="ml-2 flex shrink-0 gap-1">
												<span
													class="rounded-full bg-cyan-500/20 px-2 py-0.5 text-xs font-semibold text-cyan-300"
												>
													{composer.workCount}
												</span>
												<span
													class="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-semibold text-purple-300"
												>
													{composer.trackCount}
												</span>
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-slate-400">{$_('tracklistEditor.previewLoading')}</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Action Buttons -->
	<div class="mt-6 flex gap-3">
		<button
			type="button"
			onclick={onCancel}
			class="flex-1 rounded-xl border-2 border-slate-700 bg-slate-800 px-6 py-3 font-semibold text-slate-300 transition-all hover:border-cyan-400/50 hover:bg-slate-700 active:scale-95"
		>
			{$_('tracklistEditor.cancel')}
		</button>
		<button
			type="button"
			onclick={handleSave}
			disabled={!name.trim()}
			class="flex-1 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{$_('tracklistEditor.save')}
		</button>
	</div>
</Popup>
