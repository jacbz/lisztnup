<script lang="ts">
	import type { Tracklist, Composer, Work, Part } from '$lib/types';
	import { MIN_WORK_SCORE, MAX_WORK_SCORE } from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator, deezerPlayer, playerState, progress } from '$lib/services';
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import ExternalLink from '../primitives/ExternalLink.svelte';
	import PlayerControl from '../gameplay/PlayerControl.svelte';
	import { filterWorks } from '$lib/utils/search';
	import { formatComposerName, formatLifespan, formatPartName, formatYearRange } from '$lib/utils';
	import { _ } from 'svelte-i18n';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import ChevronsRight from 'lucide-svelte/icons/chevrons-right';
	import ChevronsLeft from 'lucide-svelte/icons/chevrons-left';
	import Plus from 'lucide-svelte/icons/plus';
	import Check from 'lucide-svelte/icons/check';
	import Ban from 'lucide-svelte/icons/ban';

	interface Props {
		visible?: boolean;
		tracklist?: Tracklist | null;
		/** When true, show action buttons (Add/Remove) per work */
		showActions?: boolean;
		/** Set of work GIDs that are already selected (shown as checked in action column) */
		includedWorkGids?: Set<string>;
		/** Set of work GIDs that are in the current filtered tracklist (visual indicator only) */
		tracklistWorkGids?: Set<string>;
		/** Callback when user wants to add a work */
		onAddWork?: (workGid: string) => void;
		/** Callback when user wants to remove a work */
		onRemoveWork?: (workGid: string) => void;
		/** Action mode: 'include' shows Add/Added, 'exclude' shows Exclude/Excluded */
		actionMode?: 'include' | 'exclude';
	}

	let {
		visible = false,
		tracklist = null,
		showActions = false,
		includedWorkGids = new Set<string>(),
		tracklistWorkGids = new Set<string>(),
		onAddWork = () => {},
		onRemoveWork = () => {},
		actionMode = 'include'
	}: Props = $props();

	// Table data
	interface TableRow {
		composerGid: string;
		composerSortName: string;
		composer: string;
		composerLifespan: string;
		workGid: string;
		work: string;
		parts: { name: string; score: number; deezerIds: number[] }[];
		popularity: number; // Work score
		year: string;
	}

	let rawTableData = $state<TableRow[]>([]);
	let searchQuery = $state('');
	let sortColumn = $state<'composer' | 'work' | 'popularity' | 'year'>('composer');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let hasManualSort = $state(false);
	let isLoading = $state(false);

	// Pagination
	const PAGE_SIZE = 200;
	let page = $state(1);

	// Scroll container reference to scroll to top on page change
	let contentScrollEl: HTMLElement | null = null;

	// Audio playback state
	let currentlyPlayingDeezerId = $state<number | null>(null);

	// Track the current round state for PlayerControl
	const playbackState = $derived({
		isPlaying: currentlyPlayingDeezerId !== null && $playerState.isPlaying,
		playbackEnded: currentlyPlayingDeezerId !== null && !$playerState.isPlaying && $progress >= 1,
		isRevealed: false // Never reveal in tracklist viewer
	});

	// Load data when tracklist or visibility changes
	$effect(() => {
		if (visible) {
			isLoading = true;
			// Use setTimeout to defer heavy computation and prevent UI freeze
			setTimeout(() => {
				loadTracklistData();
			}, 0);
		} else if (!visible) {
			// Reset data and loading state when popup closes
			rawTableData = [];
			filteredRawData = [];
			isLoading = false;
			// Clear search and pagination when closing
			searchQuery = '';
			hasManualSort = false;
			page = 1;
			// Reset sort to default
			sortColumn = 'composer';
			sortDirection = 'asc';
			// Stop any playing audio
			if (currentlyPlayingDeezerId !== null) {
				deezerPlayer.stop();
				currentlyPlayingDeezerId = null;
			}
		}
	});

	onMount(() => {
		deezerPlayer.setIgnoreTrackLength(true);

		return () => {
			// Cleanup on unmount
			if (currentlyPlayingDeezerId !== null) {
				deezerPlayer.destroy();
			}
		};
	});

	onDestroy(() => {
		if (currentlyPlayingDeezerId !== null) {
			deezerPlayer.destroy();
		}
	});

	const normalizeWorkName = (name: string): string => {
		// Normalize work name for comparison, replace all punctuation
		return name
			.trim()
			.toLowerCase()
			.replaceAll(/\p{P}+/gu, '');
	};

	// Computed sorted data
	const tableData = $derived.by(() => {
		const shouldSort = !searchQuery.trim() || hasManualSort;

		if (!shouldSort) {
			const start = (page - 1) * PAGE_SIZE;
			const end = start + PAGE_SIZE;
			return filteredRawData.slice(start, end);
		}

		const sorted = [...filteredRawData].sort((a, b) => {
			let aVal: string | number;
			let bVal: string | number;

			switch (sortColumn) {
				case 'work':
					aVal = normalizeWorkName(a.work);
					bVal = normalizeWorkName(b.work);
					break;
				case 'popularity':
					aVal = a.popularity;
					bVal = b.popularity;
					break;
				case 'year':
					// Extract first year for sorting, be defensive in case year is missing
					const ay = a.year ?? '-';
					const by = b.year ?? '-';
					aVal = ay === '-' ? 0 : parseInt(ay.split('-')[0]);
					bVal = by === '-' ? 0 : parseInt(by.split('-')[0]);
					break;
				default:
					aVal = a.composerSortName + ' ' + normalizeWorkName(a.work);
					bVal = b.composerSortName + ' ' + normalizeWorkName(b.work);
					break;
			}

			if (typeof aVal === 'string' && typeof bVal === 'string') {
				const comparison = aVal.localeCompare(bVal);
				return sortDirection === 'asc' ? comparison : -comparison;
			} else {
				const comparison = (aVal as number) - (bVal as number);
				return sortDirection === 'asc' ? comparison : -comparison;
			}
		});

		// Paginate sorted data to avoid rendering huge lists at once
		const start = (page - 1) * PAGE_SIZE;
		const end = start + PAGE_SIZE;

		return sorted.slice(start, end);
	});

	// Filtered raw data (apply search) and total pages for UI
	// Perform filtering asynchronously (debounced) to avoid freezing the UI during large searches.
	let filteredRawData = $state<TableRow[]>([]);
	let _searchTimeout: number | null = null;

	// Recalculate filteredRawData whenever rawTableData or searchQuery changes, but do it
	// asynchronously so the main thread can remain responsive. Show the loading spinner
	// while filtering is in progress.
	$effect(() => {
		// Clear any pending work
		if (_searchTimeout) {
			clearTimeout(_searchTimeout as unknown as number);
			_searchTimeout = null;
		}

		// If there is no query, set immediately (but still defer briefly to avoid layout thrash)
		if (!searchQuery || !searchQuery.trim()) {
			// No search query: populate immediately to avoid showing an empty table on open
			// Do NOT toggle `isLoading` here — keep the loading indicator controlled by
			// the data loader so the spinner remains visible until `loadTracklistData`
			// finishes and clears `isLoading`.
			filteredRawData = rawTableData;
			hasManualSort = false;
			page = 1;
			return;
		}

		// Debounce and perform heavy filtering off the immediate event (keeps UI responsive)
		isLoading = true;
		const DEBOUNCE_MS = 120;
		_searchTimeout = setTimeout(() => {
			try {
				filteredRawData = filterWorks<TableRow>(rawTableData, searchQuery);
			} catch (err) {
				console.error('Error filtering works:', err);
				filteredRawData = [];
			}
			isLoading = false;
			hasManualSort = false;
			page = 1;
		}, DEBOUNCE_MS) as unknown as number;

		// Cleanup when dependencies change
		return () => {
			if (_searchTimeout) {
				clearTimeout(_searchTimeout as unknown as number);
				_searchTimeout = null;
			}
		};
	});

	const totalPages = $derived.by(() => Math.max(1, Math.ceil(filteredRawData.length / PAGE_SIZE)));

	function loadTracklistData() {
		const data = get(gameData);
		if (!data) return;

		try {
			let composers: Composer[];
			let works: Work[];

			if (tracklist) {
				// Use tracklist filtering
				const generator = new TracklistGenerator(data, tracklist);
				const filteredData = generator.getFilteredData();
				composers = filteredData.composers;
				works = filteredData.works;
			} else {
				// Show whole library - no filtering
				composers = data.composers;
				works = data.works;
			}

			// Create a map of composer GIDs to composer objects
			const composerMap = new Map<string, Composer>();
			composers.forEach((c) => composerMap.set(c.gid, c));

			// Build table rows
			const rows: TableRow[] = [];

			works.forEach((work) => {
				const composer = composerMap.get(work.composer);
				if (!composer) return;

				// Format year
				const yearStr = formatYearRange(work.begin_year, work.end_year);

				// Create work row
				rows.push({
					composerGid: composer.gid,
					composer: formatComposerName(composer.name),
					composerSortName: composer.name,
					composerLifespan: formatLifespan(composer.birth_year, composer.death_year),
					workGid: work.gid,
					work: work.name,
					parts: work.parts.map((p: Part) => ({
						name: p.name,
						score: p.score,
						deezerIds: p.deezer
					})),
					popularity: work.score,
					year: yearStr
				});
			});

			rawTableData = rows;
			// Reset to first page whenever we load new data
			page = 1;
			// Loading complete for the loader that triggered this
			isLoading = false;
		} catch (error) {
			console.error('Error loading tracklist data:', error);
			rawTableData = [];
		}
	}

	function handleSort(column: typeof sortColumn) {
		hasManualSort = true;
		if (sortColumn === column) {
			// Toggle direction if clicking the same column (keep current page)
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			// New column: set sort column and reset to first page
			sortColumn = column;
			sortDirection = 'asc';
			page = 1;
		}
	}

	function gotoPage(n: number) {
		if (n < 1) n = 1;
		if (n > totalPages) n = totalPages;
		page = n;

		// Scroll content container to top so the user sees the beginning of the page
		try {
			if (contentScrollEl && typeof contentScrollEl.scrollTo === 'function') {
				contentScrollEl.scrollTo({ top: 0 });
			}
		} catch (e) {
			// ignore if scroll behavior not supported
		}
	}

	function prevPage() {
		gotoPage(page - 1);
	}

	function nextPage() {
		gotoPage(page + 1);
	}

	function renderPopularityStars(score: number): string {
		// Map work score from [MIN_WORK_SCORE, MAX_WORK_SCORE] to [0.5, 5] stars
		const maxScore = MAX_WORK_SCORE - 1; // Avoid maxing out at exact max
		const normalizedScore = ((score - MIN_WORK_SCORE) / (maxScore - MIN_WORK_SCORE)) * 4.5 + 0.5;
		const clampedScore = Math.max(0.5, Math.min(5, normalizedScore));

		// Create 5 stars with continuous gradient
		const fullStars = Math.floor(clampedScore);
		const fraction = clampedScore - fullStars;

		let stars = '';
		for (let i = 0; i < 5; i++) {
			if (i < fullStars) {
				stars += '★';
			} else if (i === fullStars && fraction > 0) {
				// Partial star using gradient
				const percentage = fraction * 100;
				stars += `<span style="background: linear-gradient(90deg, currentColor ${percentage}%, transparent ${percentage}%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">★</span>`;
			}
		}
		return stars;
	}

	function renderPartScore(score: number): string {
		// For parts, show a subtle gradient bar from 50 to 100 (parts are always above 50)
		const normalizedScore = Math.max(0, Math.min(100, ((score - 50) / 50) * 100));
		return `<div title="${score.toFixed(1)}" class="h-1.5 w-5 shrink-0 rounded-full bg-slate-700">
				<div class="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400" style="width: ${normalizedScore}%"></div>
			</div>`;
	}

	// Audio playback functions
	async function handlePlayPart(deezerIds: number[]): Promise<void> {
		try {
			// Get random deezer ID from available IDs
			const randomIndex = Math.floor(Math.random() * deezerIds.length);
			const deezerId = deezerIds[randomIndex];

			// If same track is playing, stop it
			if (currentlyPlayingDeezerId === deezerId && $playerState.isPlaying) {
				stopPlayback();
				return;
			}

			// Load and play the track
			await deezerPlayer.load(deezerId);
			deezerPlayer.play();

			currentlyPlayingDeezerId = deezerId;
		} catch (error) {
			console.error('Error playing part:', error);
			currentlyPlayingDeezerId = null;
		}
	}

	function stopPlayback(): void {
		deezerPlayer.stop();
		currentlyPlayingDeezerId = null;
	}
</script>

<div class="flex h-full flex-col">
	<!-- Search bar and player control -->
	<div class="flex items-center gap-3 px-4 py-3">
		<input
			type="search"
			bind:value={searchQuery}
			oninput={() => (page = 1)}
			placeholder={$_('tracklistViewer.searchPlaceholder') || 'Search composer, title or works'}
			class="flex-1 rounded border border-slate-700 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
		/>
		<div class="relative flex h-12 w-12 shrink-0 items-center justify-center">
			<PlayerControl
				visible={currentlyPlayingDeezerId !== null && !playbackState.playbackEnded}
				isPlaying={playbackState.isPlaying}
				playbackEnded={playbackState.playbackEnded}
				isRevealed={playbackState.isRevealed}
				progress={$progress}
				track={null}
				playerSize={48}
				onStop={stopPlayback}
				onReveal={() => {}}
				onNext={() => {}}
			/>
		</div>
	</div>

	<div class="flex-1 overflow-y-auto" bind:this={contentScrollEl}>
		{#if isLoading}
			<div class="flex h-full items-center justify-center">
				<div class="text-center">
					<div
						class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"
					></div>
					<p class="mt-4 text-slate-400">{$_('tracklistViewer.loading')}</p>
				</div>
			</div>
		{:else}
			{@render paginationControls()}

			{#if tableData.length === 0}
				<p class="text-center text-slate-400">{$_('tracklistViewer.noData')}</p>
			{:else}
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b-2 border-cyan-400/30">
								{#if showActions}
									<th class="cell w-16 text-center text-sm font-semibold text-cyan-400"></th>
								{/if}
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('composer')}
								>
									{$_('tracklistViewer.columns.composer')}
									{#if sortColumn === 'composer' && (!searchQuery.trim() || hasManualSort)}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('work')}
								>
									{$_('tracklistViewer.columns.work')}
									{#if sortColumn === 'work' && (!searchQuery.trim() || hasManualSort)}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('popularity')}
								>
									{$_('tracklistViewer.columns.popularity')}
									{#if sortColumn === 'popularity' && (!searchQuery.trim() || hasManualSort)}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell hidden cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300 md:table-cell"
									onclick={() => handleSort('year')}
								>
									{$_('tracklistViewer.columns.year')}
									{#if sortColumn === 'year' && (!searchQuery.trim() || hasManualSort)}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								{@const isIncluded = includedWorkGids.has(row.workGid)}
								{@const isInTracklist = tracklistWorkGids.has(row.workGid)}
								<tr
									class="border-b border-slate-700 transition-colors hover:bg-slate-800/50 {isInTracklist &&
									showActions &&
									actionMode === 'include'
										? 'bg-cyan-500/5'
										: ''}"
								>
									{#if showActions}
										<td class="cell text-center">
											{#if isIncluded}
												<button
													type="button"
													onclick={() => onRemoveWork(row.workGid)}
													class="inline-flex items-center justify-center rounded-lg bg-green-500/20 p-1.5 text-green-400 transition-colors hover:bg-red-500/20 hover:text-red-400"
													title={actionMode === 'include'
														? $_('tracklistEditor.curation.removeWork')
														: $_('tracklistEditor.curation.removeExclusion')}
												>
													<Check class="h-4 w-4" />
												</button>
											{:else if isInTracklist && actionMode === 'include'}
												<span
													class="inline-flex items-center justify-center rounded-lg p-1.5 text-cyan-500/40"
													title={$_('tracklistEditor.curation.alreadyInTracklist')}
												>
													<Check class="h-4 w-4" />
												</span>
											{:else}
												<button
													type="button"
													onclick={() => onAddWork(row.workGid)}
													class="inline-flex items-center justify-center rounded-lg bg-slate-700 p-1.5 text-slate-400 transition-colors hover:bg-cyan-500/20 hover:text-cyan-400"
													title={actionMode === 'include'
														? $_('tracklistEditor.curation.addWork')
														: $_('tracklistEditor.curation.excludeWork')}
												>
													{#if actionMode === 'exclude'}
														<Ban class="h-4 w-4" />
													{:else}
														<Plus class="h-4 w-4" />
													{/if}
												</button>
											{/if}
										</td>
									{/if}
									<td class="cell text-sm">
										<div class="text-slate-300">
											<span>{row.composer}</span>
											<ExternalLink
												href="https://musicbrainz.org/artist/{row.composerGid}"
												hideOnMobile={true}
											/>
										</div>
										{#if row.composerLifespan}
											<div class="text-xs text-slate-400">({row.composerLifespan})</div>
										{/if}
									</td>
									<td class="cell text-sm">
										<div class="text-slate-300">
											{#if row.parts.length === 1}
												<button
													type="button"
													onclick={() => handlePlayPart(row.parts[0].deezerIds)}
													class="cursor-pointer text-left transition-colors hover:text-cyan-400 {currentlyPlayingDeezerId &&
													row.parts[0].deezerIds.includes(currentlyPlayingDeezerId)
														? 'font-semibold text-cyan-400'
														: ''}"
												>
													{row.work}
													{#if row.year}
														<span class="text-xs opacity-80 md:hidden"> ({row.year})</span>
													{/if}
													<ExternalLink
														href="https://musicbrainz.org/work/{row.workGid}"
														hideOnMobile={true}
													/>
												</button>
											{:else}
												<span>{row.work}</span>
												{#if row.year}
													<span class="text-xs opacity-80 md:hidden"> ({row.year})</span>
												{/if}
												<ExternalLink
													href="https://musicbrainz.org/work/{row.workGid}"
													hideOnMobile={true}
												/>
											{/if}
										</div>
										{#if row.parts.length > 1 || row.work !== row.parts[0].name}
											<ul class="mt-1 space-y-0.5 pl-2 text-slate-400 md:pl-4">
												{#each row.parts as part}
													<li class="flex items-center gap-2">
														{#if row.parts.length > 1}
															{@html renderPartScore(part.score)}
														{/if}
														<button
															type="button"
															onclick={() => handlePlayPart(part.deezerIds)}
															class="flex-1 cursor-pointer text-left transition-colors hover:text-cyan-400 {currentlyPlayingDeezerId &&
															part.deezerIds.includes(currentlyPlayingDeezerId)
																? 'font-semibold text-cyan-400'
																: ''}"
														>
															{formatPartName(part.name, row.work)}
														</button>
													</li>
												{/each}
											</ul>
										{/if}
									</td>
									<td class="cell text-sm text-yellow-400" title={row.popularity.toFixed(1)}>
										{@html renderPopularityStars(row.popularity)}
									</td>
									<td class="cell hidden text-sm text-slate-400 md:table-cell">{row.year}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}

			{@render paginationControls()}
		{/if}
	</div>
</div>

{#snippet paginationControls()}
	{#if filteredRawData.length > PAGE_SIZE}
		<div class="flex items-center justify-center px-4 py-1">
			<div class="flex items-center space-x-2">
				<button
					type="button"
					onclick={() => gotoPage(1)}
					class="rounded bg-slate-700 px-2 py-1 text-slate-200 disabled:opacity-50"
					disabled={page <= 1}
				>
					<ChevronsLeft class="h-5" />
				</button>
				<button
					type="button"
					onclick={() => prevPage()}
					class="rounded bg-slate-700 px-2 py-1 text-slate-200 disabled:opacity-50"
					disabled={page <= 1}
					title="Previous page"
				>
					<ChevronLeft class="h-5" />
				</button>
				<div class="px-2 text-slate-300">{page} / {totalPages}</div>
				<button
					type="button"
					onclick={() => nextPage()}
					class="rounded bg-slate-700 px-2 py-1 text-slate-200 disabled:opacity-50"
					disabled={page >= totalPages}
					title="Next page"
				>
					<ChevronRight class="h-5" />
				</button>
				<button
					type="button"
					onclick={() => gotoPage(totalPages)}
					class="rounded bg-slate-700 px-2 py-1 text-slate-200 disabled:opacity-50"
					disabled={page >= totalPages}
				>
					<ChevronsRight class="h-5" />
				</button>
			</div>
		</div>
	{/if}
{/snippet}

<style>
	@reference "../../../../app.css";
	.cell {
		@apply px-2 py-2 align-top md:px-4 md:py-3;
	}
</style>
