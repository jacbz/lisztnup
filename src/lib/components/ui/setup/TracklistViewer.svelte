<script lang="ts">
	import type { Tracklist, Composer } from '$lib/types';
	import { MIN_WORK_SCORE, MAX_WORK_SCORE } from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import { get } from 'svelte/store';
	import Popup from '../primitives/Popup.svelte';
	import ExternalLink from '../primitives/ExternalLink.svelte';
	import { formatLifespan, formatPartName, formatYearRange } from '$lib/utils';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		tracklist?: Tracklist | null;
		onClose?: () => void;
	}

	let { visible = false, tracklist = null, onClose = () => {} }: Props = $props();

	// Table data
	interface TableRow {
		composerGid: string;
		composer: string;
		composerLifespan: string;
		workGid: string;
		work: string;
		parts: { name: string; score: number }[];
		popularity: number; // Work score
		year: string;
	}

	let rawTableData = $state<TableRow[]>([]);
	let sortColumn = $state<'composer' | 'work' | 'popularity' | 'year'>('composer');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let isLoading = $state(false);

	// Load data when tracklist or visibility changes
	$effect(() => {
		if (visible && tracklist) {
			isLoading = true;
			// Use setTimeout to defer heavy computation and prevent UI freeze
			setTimeout(() => {
				loadTracklistData();
				isLoading = false;
			}, 0);
		} else if (!visible) {
			// Reset data and loading state when popup closes
			rawTableData = [];
			isLoading = false;
		}
	});

	// Computed sorted data
	const tableData = $derived.by(() => {
		const sorted = [...rawTableData].sort((a, b) => {
			let aVal: string | number;
			let bVal: string | number;

			switch (sortColumn) {
				case 'composer':
					aVal = a.composer + a.work;
					bVal = b.composer + b.work;
					break;
				case 'work':
					aVal = a.work;
					bVal = b.work;
					break;
				case 'popularity':
					aVal = a.popularity;
					bVal = b.popularity;
					break;
				case 'year':
					// Extract first year for sorting
					aVal = a.year === '-' ? 0 : parseInt(a.year.split('-')[0]);
					bVal = b.year === '-' ? 0 : parseInt(b.year.split('-')[0]);
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

		return sorted;
	});

	function loadTracklistData() {
		if (!tracklist) return;

		const data = get(gameData);
		if (!data) return;

		try {
			const generator = new TracklistGenerator(data, tracklist);
			const { composers, works } = generator.getFilteredData();

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
					composer: composer.name,
					composerLifespan: formatLifespan(composer.birth_year, composer.death_year),
					workGid: work.gid,
					work: work.name,
					parts: work.parts.map((p) => ({ name: p.name, score: p.score })),
					popularity: work.score,
					year: yearStr
				});
			});

			rawTableData = rows;
		} catch (error) {
			console.error('Error loading tracklist data:', error);
			rawTableData = [];
		}
	}

	function handleSort(column: typeof sortColumn) {
		if (sortColumn === column) {
			// Toggle direction if clicking the same column
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			// New column, default to ascending
			sortColumn = column;
			sortDirection = 'asc';
		}
	}

	function renderPopularityStars(score: number): string {
		// Map work score from [MIN_WORK_SCORE, MAX_WORK_SCORE] to [1, 5] stars
		const normalizedScore = ((score - MIN_WORK_SCORE) / (MAX_WORK_SCORE - MIN_WORK_SCORE)) * 4 + 1;
		const clampedScore = Math.max(1, Math.min(5, normalizedScore));

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
		return `<div class="h-1.5 w-5 shrink-0 rounded-full bg-gray-700">
			<div class="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400" style="width: ${normalizedScore}%"></div>
		</div>`;
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border-2 border-cyan-400 bg-gray-900 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<div class="border-b-2 border-cyan-400/30 bg-gray-800/50 p-6">
			<h2 class="text-2xl font-bold text-cyan-400">
				{$_('tracklistViewer.title')}
				{#if tracklist}
					<span class="text-xl text-gray-400">
						- {tracklist.isDefault ? $_(tracklist.name) : tracklist.name}
					</span>
				{/if}
			</h2>
		</div>

		<div class="overflow-y-auto p-6" style="max-height: calc(90vh - 120px);">
			{#if isLoading}
				<div class="flex items-center justify-center py-12">
					<div class="text-center">
						<div
							class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"
						></div>
						<p class="mt-4 text-gray-400">{$_('tracklistViewer.loading')}</p>
					</div>
				</div>
			{:else if tableData.length === 0}
				<p class="text-center text-gray-400">{$_('tracklistViewer.noData')}</p>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b-2 border-cyan-400/30">
								<th
									class="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('composer')}
								>
									{$_('tracklistViewer.columns.composer')}
									{#if sortColumn === 'composer'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('work')}
								>
									{$_('tracklistViewer.columns.work')}
									{#if sortColumn === 'work'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('popularity')}
								>
									{$_('tracklistViewer.columns.popularity')}
									{#if sortColumn === 'popularity'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cursor-pointer px-4 py-3 text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('year')}
								>
									{$_('tracklistViewer.columns.year')}
									{#if sortColumn === 'year'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
							</tr>
						</thead>
						<tbody>
							{#each tableData as row}
								<tr class="border-b border-gray-700 transition-colors hover:bg-gray-800/50">
									<td class="px-4 py-3 text-sm">
										<div class="text-gray-300">
											<span>{row.composer}</span>
											<ExternalLink href="https://musicbrainz.org/artist/{row.composerGid}" />
										</div>
										{#if row.composerLifespan}
											<div class="text-xs text-gray-400">({row.composerLifespan})</div>
										{/if}
									</td>
									<td class="px-4 py-3 text-sm">
										<div class="flex items-center gap-1 text-gray-300">
											<span>{row.work}</span>
											<ExternalLink href="https://musicbrainz.org/work/{row.workGid}" />
										</div>
										{#if row.parts.length > 1 || row.work !== row.parts[0].name}
											<ul class="mt-1 space-y-0.5 pl-4 text-gray-400">
												{#each row.parts as part}
													<li class="flex items-center gap-2">
														{#if row.parts.length > 1}
															{@html renderPartScore(part.score)}
														{/if}
														<span class="flex-1">{formatPartName(part.name, row.work)}</span>
													</li>
												{/each}
											</ul>
										{/if}
									</td>
									<td class="px-4 py-3 text-sm text-yellow-400">
										{@html renderPopularityStars(row.popularity)}
									</td>
									<td class="px-4 py-3 text-sm text-gray-400">{row.year}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</Popup>
