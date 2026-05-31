<script lang="ts">
	import type { Composer, Work, WorkCategory } from '$lib/models';
	import type { Tracklist } from '$lib/types';
	import { gameData, isDataLoaded } from '$lib/stores';
	import { get } from 'svelte/store';
	import { formatComposerName, formatLifespan } from '$lib/utils';
	import Popup from '../primitives/Popup.svelte';
	import TrackTable from './TrackTable.svelte';
	import ComposerCloud from './ComposerCloud.svelte';
	import { TracklistGenerator } from '$lib/services';
	import { tracklistDisplayName } from '$lib/data/defaultTracklists';
	import { _ } from 'svelte-i18n';
	import Library from 'lucide-svelte/icons/library';
	import ListMusic from 'lucide-svelte/icons/list-music';
	import ChevronLeft from 'lucide-svelte/icons/chevron-left';
	import List from 'lucide-svelte/icons/list';
	import composerIcon from '$lib/assets/icons/composer.svg?raw';
	import { SvelteSet } from 'svelte/reactivity';

	interface BrowserCatalogData {
		composers: readonly Composer[];
		works: readonly Work[];
		workCountByComposerGid?: ReadonlyMap<string, number>;
	}

	interface Props {
		visible?: boolean;
		tracklist?: Tracklist | null;
		onClose?: () => void;
	}

	let { visible = false, tracklist = null, onClose = () => {} }: Props = $props();

	// View state: 'cloud' = composer word cloud, 'table' = all works, 'composer' = single composer
	type ViewMode = 'cloud' | 'table' | 'composer';
	let viewMode = $state<ViewMode>('cloud');
	let selectedComposerGid = $state<string | null>(null);
	let selectedCategories = $state(new Set<WorkCategory>());
	let contentReady = $state(false);

	const catalogData = $derived.by<BrowserCatalogData | null>(() => {
		if (!visible || !contentReady) return null;
		const data = get(gameData);
		if (!data) return null;

		if (tracklist) {
			const generator = new TracklistGenerator(data, tracklist);
			return generator.getFilteredData();
		}

		return {
			composers: data.getComposersWithWorks(),
			works: data.works,
			workCountByComposerGid: data.getWorkCountByComposerGid()
		};
	});

	const selectedComposer = $derived.by(() => {
		if (!selectedComposerGid) return null;
		return catalogData?.composers.find((c) => c.gid === selectedComposerGid) || null;
	});

	function handleSelectComposer(gid: string) {
		selectedComposerGid = gid;
		viewMode = 'composer';
	}

	function handleShowAllWorks() {
		viewMode = 'table';
	}

	function handleBack() {
		if (viewMode === 'composer') {
			selectedComposerGid = null;
			selectedCategories = new SvelteSet<WorkCategory>();
		}
		viewMode = 'cloud';
	}

	function handleToggleCategory(cat: WorkCategory) {
		const next = new SvelteSet(selectedCategories);
		if (next.has(cat)) {
			next.delete(cat);
		} else {
			next.add(cat);
		}
		selectedCategories = next;
	}

	$effect(() => {
		if (!visible) {
			contentReady = false;
			return;
		}

		contentReady = false;
		let firstFrame = 0;
		let secondFrame = 0;
		firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => {
				contentReady = true;
			});
		});

		return () => {
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
		};
	});

	$effect(() => {
		if (!visible) {
			viewMode = tracklist ? 'table' : 'cloud';
			selectedComposerGid = null;
			selectedCategories = new SvelteSet<WorkCategory>();
		}
	});
</script>

<Popup {visible} {onClose} width="screen" overflow="hidden" padding="none">
	<div class="flex h-full flex-col text-left">
		<!-- Header -->
		<div class="border-b-2 border-cyan-400/30 bg-slate-800/50 p-4 md:p-6">
			<div class="flex items-center gap-3">
				{#if viewMode !== 'cloud' && !tracklist}
					<button
						type="button"
						onclick={handleBack}
						class="rounded-lg p-1.5 text-cyan-400 transition-colors hover:bg-slate-700"
					>
						<ChevronLeft class="h-5 w-5" />
					</button>
				{/if}

				<h2 class="flex items-center gap-2 text-xl font-bold text-cyan-400 md:text-2xl">
					{#if tracklist}
						<ListMusic class="h-5 w-5 md:h-6 md:w-6" />
						{tracklistDisplayName(
							tracklist,
							$_
						)}{:else if viewMode === 'composer' && selectedComposer}
						{@html composerIcon}
						{formatComposerName(selectedComposer.name)}
						<span class="text-sm font-normal text-slate-400">
							({formatLifespan(selectedComposer.birth_year, selectedComposer.death_year)})
						</span>
					{:else if viewMode === 'table'}
						<List class="h-5 w-5 md:h-6 md:w-6" />
						{$_('libraryViewer.allWorks')}
					{:else}
						<Library class="h-5 w-5 md:h-6 md:w-6" />
						{$_('trackTable.library')}
					{/if}
				</h2>

				<!-- Show "All Works" button in cloud view -->
				{#if viewMode === 'cloud' && !tracklist}
					<button
						type="button"
						onclick={handleShowAllWorks}
						class="mr-8 ml-auto flex items-center gap-1.5 rounded-lg bg-slate-700/60 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700 hover:text-cyan-400"
					>
						<List class="h-4 w-4" />
						<span class="hidden sm:inline">{$_('libraryViewer.allWorks')}</span>
					</button>
				{/if}
			</div>
		</div>

		<!-- Content -->
		<div class="flex-1 overflow-hidden">
			{#if !$isDataLoaded || !contentReady || !catalogData}
				<div class="flex h-full items-center justify-center">
					<p class="text-slate-400">{$_('trackTable.loading')}</p>
				</div>
			{:else if !tracklist}
				<!-- Composer word cloud -->
				<div class="h-full overflow-y-auto" class:hidden={viewMode !== 'cloud'}>
					<div class="mx-auto max-w-5xl">
						<ComposerCloud
							composers={catalogData.composers}
							works={catalogData.works}
							workCountByComposerGid={catalogData.workCountByComposerGid}
							onSelectComposer={handleSelectComposer}
						/>
					</div>
				</div>
			{/if}

			{#if $isDataLoaded && contentReady && catalogData && (viewMode !== 'cloud' || tracklist)}
				<!-- Table view (all works or single composer) -->
				<TrackTable
					{visible}
					{tracklist}
					composers={catalogData.composers}
					works={catalogData.works}
					selectedComposerGid={viewMode === 'composer' ? selectedComposerGid : null}
					{selectedCategories}
					onToggleCategory={handleToggleCategory}
					showCategoryFilter={true}
				/>
			{/if}
		</div>
	</div>
</Popup>
