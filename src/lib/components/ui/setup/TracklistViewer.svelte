<script lang="ts">
	import type { Tracklist, Composer } from '$lib/types';
	import { MIN_WORK_SCORE, MAX_WORK_SCORE } from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator, deezerPlayer, playerState, progress } from '$lib/services';
	import { get } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import Popup from '../primitives/Popup.svelte';
	import ExternalLink from '../primitives/ExternalLink.svelte';
	import PlayerControl from '../gameplay/PlayerControl.svelte';
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
		parts: { name: string; score: number; deezerId: number }[];
		popularity: number; // Work score
		year: string;
	}

	let rawTableData = $state<TableRow[]>([]);
	let sortColumn = $state<'composer' | 'work' | 'popularity' | 'year'>('composer');
	let sortDirection = $state<'asc' | 'desc'>('asc');
	let isLoading = $state(false);

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
			// Stop any playing audio
			if (currentlyPlayingDeezerId !== null) {
				deezerPlayer.pause();
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
					parts: work.parts.map((p) => ({ name: p.name, score: p.score, deezerId: p.deezer })),
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
		return `<div title="${score}" class="h-1.5 w-5 shrink-0 rounded-full bg-gray-700">
				<div class="h-full rounded-full bg-gradient-to-r from-cyan-600 to-cyan-400" style="width: ${normalizedScore}%"></div>
			</div>`;
	}

	// Audio playback functions
	async function handlePlayPart(deezerId: number): Promise<void> {
		try {
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
		deezerPlayer.pause();
		currentlyPlayingDeezerId = null;
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl border-2 border-cyan-400 bg-gray-900 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<div class="border-b-2 border-cyan-400/30 bg-gray-800/50 p-6">
			<div class="flex items-center justify-between">
				<h2 class="text-2xl font-bold text-cyan-400">
					{#if tracklist}
						{tracklist.isDefault ? $_(tracklist.name) : tracklist.name}
					{/if}
				</h2>

				<!-- PlayerControl in header -->
				<div class="relative flex h-12 w-12 items-center justify-center">
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
		</div>

		<div class="overflow-y-auto" style="max-height: calc(90vh - 120px);">
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
				<div class="overflow-y-auto">
					<table class="w-full border-collapse">
						<thead>
							<tr class="border-b-2 border-cyan-400/30">
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('composer')}
								>
									{$_('tracklistViewer.columns.composer')}
									{#if sortColumn === 'composer'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('work')}
								>
									{$_('tracklistViewer.columns.work')}
									{#if sortColumn === 'work'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300"
									onclick={() => handleSort('popularity')}
								>
									{$_('tracklistViewer.columns.popularity')}
									{#if sortColumn === 'popularity'}
										<span class="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</th>
								<th
									class="cell hidden cursor-pointer text-left text-sm font-semibold text-cyan-400 transition-colors hover:text-cyan-300 md:table-cell"
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
									<td class="cell text-sm">
										<div class="text-gray-300">
											<span>{row.composer}</span>
											<ExternalLink href="https://musicbrainz.org/artist/{row.composerGid}" />
										</div>
										{#if row.composerLifespan}
											<div class="text-xs text-gray-400">({row.composerLifespan})</div>
										{/if}
									</td>
									<td class="cell text-sm">
										<div class="text-gray-300">
											{#if row.parts.length === 1}
												<!-- Single part: work name is clickable -->
												<button
													type="button"
													onclick={() => handlePlayPart(row.parts[0].deezerId)}
													class="cursor-pointer text-left transition-colors hover:text-cyan-400 {currentlyPlayingDeezerId ===
													row.parts[0].deezerId
														? 'font-semibold text-cyan-400'
														: ''}"
												>
													{row.work}
													{#if row.year}
														<span class="text-xs opacity-80 md:hidden"> ({row.year})</span>
													{/if}
												</button>
											{:else}
												<!-- Multiple parts: work name not clickable -->
												<span>{row.work}</span>
												{#if row.year}
													<span class="text-xs opacity-80 md:hidden"> ({row.year})</span>
												{/if}
											{/if}
											<ExternalLink href="https://musicbrainz.org/work/{row.workGid}" />
										</div>
										{#if row.parts.length > 1 || row.work !== row.parts[0].name}
											<ul class="mt-1 space-y-0.5 pl-2 text-gray-400 md:pl-4">
												{#each row.parts as part}
													<li class="flex items-center gap-2">
														{#if row.parts.length > 1}
															{@html renderPartScore(part.score)}
														{/if}
														<button
															type="button"
															onclick={() => handlePlayPart(part.deezerId)}
															class="flex-1 cursor-pointer text-left transition-colors hover:text-cyan-400 {currentlyPlayingDeezerId ===
															part.deezerId
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
									<td class="cell text-sm text-yellow-400" title={row.popularity + ''}>
										{@html renderPopularityStars(row.popularity)}
									</td>
									<td class="cell hidden text-sm text-gray-400 md:table-cell">{row.year}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</Popup>

<style>
	@reference "../../../../app.css";
	.cell {
		@apply px-2 py-2 align-top md:px-4 md:py-3;
	}
</style>
