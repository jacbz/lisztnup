<script lang="ts">
	import type { Tracklist } from '$lib/types';
	import { gameData, toast } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import { SettingsService } from '$lib/services';
	import { DEFAULT_TRACKLISTS, cloneTracklist } from '$lib/data/defaultTracklists';
	import { get } from 'svelte/store';
	import Popup from '../primitives/Popup.svelte';
	import Dialog from '../primitives/Dialog.svelte';
	import TracklistEditor from './TracklistEditor.svelte';
	import TracklistViewer from './TracklistViewer.svelte';
	import ShareLinkPopup from './ShareLinkPopup.svelte';
	import { _ } from 'svelte-i18n';
	import { compress } from '$lib/utils';
	import ListMusic from 'lucide-svelte/icons/list-music';
	import Copy from 'lucide-svelte/icons/copy';
	import Edit from 'lucide-svelte/icons/edit';
	import ShareIcon from 'lucide-svelte/icons/share';
	import Trash from 'lucide-svelte/icons/trash';
	import Library from 'lucide-svelte/icons/library';

	interface Props {
		visible?: boolean;
		selectedTracklist?: Tracklist;
		onSelect?: (tracklist: Tracklist) => void;
		onClose?: () => void;
	}

	let {
		visible = false,
		selectedTracklist = DEFAULT_TRACKLISTS[0], // Very Easy by default
		onSelect = () => {},
		onClose = () => {}
	}: Props = $props();

	// Load custom tracklists
	let customTracklists = $state<Tracklist[]>(SettingsService.loadCustomTracklists());

	// Group tracklists by category
	const groupedTracklists = $derived.by(() => {
		const allTracklists = [...DEFAULT_TRACKLISTS, ...customTracklists];
		const groups: Record<string, Tracklist[]> = {
			difficulty: [],
			categories: [],
			composers: [],
			eras: [],
			custom: []
		};

		allTracklists.forEach((tracklist) => {
			const category = tracklist.category || (tracklist.isDefault ? 'difficulty' : 'custom');
			if (groups[category]) {
				groups[category].push(tracklist);
			}
		});

		return groups;
	});

	// Editor state
	let showEditor = $state(false);
	let editingTracklist = $state<Tracklist | null>(null);

	// Viewer state
	let showViewer = $state(false);
	let viewingTracklist = $state<Tracklist | null>(null);

	// Delete confirmation dialog state
	let showDeleteDialog = $state(false);
	let tracklistToDelete = $state<Tracklist | null>(null);

	// Share popup state
	let showSharePopup = $state(false);
	let shareUrl = $state('');

	// Compute tracklist info for each tracklist
	const tracklistInfoMap = $derived.by(() => {
		const data = get(gameData);
		if (!data) return {} as Record<string, { composers: number; works: number; tracks: number }>;

		const map: Record<string, { composers: number; works: number; tracks: number }> = {};

		// Calculate info for each tracklist in all groups
		Object.values(groupedTracklists)
			.flat()
			.forEach((tracklist) => {
				try {
					const generator = new TracklistGenerator(data, tracklist);
					map[tracklist.name] = generator.getInfo();
				} catch (error) {
					console.error(`Error getting info for tracklist ${tracklist.name}:`, error);
					map[tracklist.name] = { composers: 0, works: 0, tracks: 0 };
				}
			});

		return map;
	});

	function handleSelect(tracklist: Tracklist) {
		onSelect(tracklist);
		onClose();
	}

	function handleClone(tracklist: Tracklist) {
		// For default tracklists, pass translated name and description
		const translatedName = tracklist.isDefault ? $_(tracklist.name) : undefined;
		const translatedDescription = tracklist.isDefault ? $_(tracklist.description) : undefined;

		const cloned = cloneTracklist(
			tracklist,
			customTracklists,
			translatedName,
			translatedDescription
		);
		editingTracklist = cloned;
		showEditor = true;
	}

	function handleEdit(tracklist: Tracklist) {
		editingTracklist = tracklist;
		showEditor = true;
	}

	function handleView(tracklist: Tracklist) {
		viewingTracklist = tracklist;
		showViewer = true;
	}

	function handleBrowseLibrary() {
		viewingTracklist = null;
		showViewer = true;
	}

	async function handleShare(tracklist: Tracklist) {
		try {
			// Ignore null values in JSON to reduce size
			const json = JSON.stringify(tracklist, (k, v) => v ?? undefined);
			const compressed = await compress(json);
			const baseUrl = window.location.origin + window.location.pathname;
			shareUrl = `${baseUrl}?addTracklist=${encodeURIComponent(compressed)}`;
			showSharePopup = true;
		} catch (error) {
			toast.error('Failed to create share link');
		}
	}

	function handleCreateNew() {
		editingTracklist = null;
		showEditor = true;
	}

	function handleDeleteClick(tracklist: Tracklist) {
		tracklistToDelete = tracklist;
		showDeleteDialog = true;
	}

	function confirmDelete() {
		if (tracklistToDelete) {
			SettingsService.deleteCustomTracklist(tracklistToDelete.name);
			customTracklists = SettingsService.loadCustomTracklists();

			// If deleted tracklist was selected, switch to Medium (default)
			if (selectedTracklist.name === tracklistToDelete.name) {
				onSelect(DEFAULT_TRACKLISTS[1]);
			}

			tracklistToDelete = null;
		}
		showDeleteDialog = false;
	}

	function cancelDelete() {
		tracklistToDelete = null;
		showDeleteDialog = false;
	}

	function handleSaveTracklist(tracklist: Tracklist) {
		// SettingsService.saveCustomTracklist is now called in TracklistEditor.handleSave
		customTracklists = SettingsService.loadCustomTracklists();
		showEditor = false;
		editingTracklist = null;
	}

	function handleCancelEdit() {
		showEditor = false;
		editingTracklist = null;
	}

	function handleCloseViewer() {
		showViewer = false;
		viewingTracklist = null;
	}

	function handleCloseSharePopup() {
		showSharePopup = false;
		shareUrl = '';
	}

	// Helper to check if two tracklists are the same
	function isSameTracklist(a: Tracklist, b: Tracklist): boolean {
		return a.name === b.name && a.isDefault === b.isDefault;
	}
</script>

<Popup visible={visible && !showEditor && !showViewer} {onClose} width="3xl">
	<div class="mb-5 flex flex-col justify-between gap-4 md:flex-row">
		<h2 class="text-3xl font-bold text-cyan-400">
			{$_('tracklistSelector.title')}
		</h2>

		<!-- Browse Library Button -->
		<div class="md:mr-9">
			<button
				type="button"
				onclick={handleBrowseLibrary}
				class="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm text-white transition-all hover:bg-purple-500 focus:ring-2 focus:ring-purple-400 focus:outline-none"
			>
				<Library class="h-4 w-4" />
				<span>{$_('tracklistSelector.browseLibrary')}</span>
			</button>
		</div>
	</div>

	<!-- Tracklist Selection by Category -->
	<div class="space-y-6">
		<!-- Difficulty -->
		{#if groupedTracklists.difficulty.length > 0}
			<div>
				<h3 class="mb-3 text-lg font-semibold text-purple-400">
					{$_('tracklistEditor.categoryDifficulty')}
				</h3>
				<div class="grid gap-3 md:grid-cols-2">
					{#each groupedTracklists.difficulty as tracklist}
						{@render tracklistCard(tracklist)}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Musical Categories -->
		{#if groupedTracklists.categories.length > 0}
			<div>
				<h3 class="mb-3 text-lg font-semibold text-purple-400">
					{$_('tracklistEditor.categoryCategories')}
				</h3>
				<div class="grid gap-3 md:grid-cols-2">
					{#each groupedTracklists.categories as tracklist}
						{@render tracklistCard(tracklist)}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Composers -->
		{#if groupedTracklists.composers.length > 0}
			<div>
				<h3 class="mb-3 text-lg font-semibold text-purple-400">
					{$_('tracklistEditor.categoryComposers')}
				</h3>
				<div class="grid gap-3 md:grid-cols-2">
					{#each groupedTracklists.composers as tracklist}
						{@render tracklistCard(tracklist)}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Eras -->
		{#if groupedTracklists.eras.length > 0}
			<div>
				<h3 class="mb-3 text-lg font-semibold text-purple-400">
					{$_('tracklistEditor.categoryEras')}
				</h3>
				<div class="grid gap-3 md:grid-cols-2">
					{#each groupedTracklists.eras as tracklist}
						{@render tracklistCard(tracklist)}
					{/each}
				</div>
			</div>
		{/if}

		<!-- Custom Tracklists -->
		<div>
			<h3 class="mb-3 text-lg font-semibold text-purple-400">
				{$_('tracklistEditor.categoryCustom')}
			</h3>
			<div class="grid gap-3 md:grid-cols-2">
				{#each groupedTracklists.custom as tracklist}
					{@render tracklistCard(tracklist)}
				{/each}
				<!-- Create New Button -->
				<button
					type="button"
					onclick={handleCreateNew}
					class="min-h-32 w-full rounded-xl border-2 border-dashed border-cyan-400/50 bg-slate-800/50 px-4 py-3 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-slate-800"
				>
					+ {$_('tracklistSelector.createNew')}
				</button>
			</div>
		</div>
	</div>
</Popup>
{#snippet tracklistCard(tracklist: Tracklist)}
	{@const selected = isSameTracklist(tracklist, selectedTracklist)}
	<div
		class="relative flex flex-col gap-2 rounded-xl p-4 transition-all {selected
			? 'border-2 border-cyan-400 bg-slate-900 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
			: 'border-2 border-slate-700 bg-slate-800 text-slate-300 hover:border-cyan-400/50 hover:bg-slate-700'}"
	>
		<div class="absolute top-2 right-2 flex gap-2">
			<button
				type="button"
				onclick={() => handleView(tracklist)}
				class="rounded-lg p-2 transition-all focus:ring-2 focus:ring-cyan-400 focus:outline-none {selected
					? 'bg-white/20 hover:bg-white/30'
					: 'bg-slate-600/80 hover:bg-slate-500'}"
				title={$_('tracklistSelector.view')}
			>
				<ListMusic class="h-4 w-4" />
			</button>
			<button
				type="button"
				onclick={() => handleClone(tracklist)}
				class="rounded-lg p-2 transition-all focus:ring-2 focus:ring-cyan-400 focus:outline-none {selected
					? 'bg-white/20 hover:bg-white/30'
					: 'bg-slate-600/80 hover:bg-slate-500'}"
				title={$_('tracklistSelector.clone')}
			>
				<Copy class="h-4 w-4" />
			</button>
		</div>

		<button
			type="button"
			onclick={() => handleSelect(tracklist)}
			class="flex h-full w-full flex-col items-start gap-2 text-left"
		>
			<div class="flex items-center gap-1 pr-20">
				<div class="tracklist-icon medium shrink-0">
					{#if tracklist.icon}
						{@html tracklist.icon}
					{/if}
				</div>
				<span class="text-lg font-bold"
					>{tracklist.isDefault ? $_(tracklist.name) : tracklist.name}</span
				>
			</div>
			<span class="flex-1 text-sm leading-relaxed {selected ? 'text-slate-200' : 'text-slate-400'}">
				{tracklist.isDefault ? $_(tracklist.description) : tracklist.description}
			</span>
			{#if tracklistInfoMap[tracklist.name]}
				<span class="mt-1 text-xs opacity-70">
					{$_('settings.presetInfo.default', {
						values: tracklistInfoMap[tracklist.name]
					})}
				</span>
			{/if}
		</button>

		<!-- Action buttons for custom tracklists -->
		{#if !tracklist.isDefault}
			<div class="mt-2 flex gap-2">
				<button
					type="button"
					onclick={() => handleEdit(tracklist)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-cyan-400 focus:outline-none {selected
						? 'bg-white/20 hover:bg-white/30'
						: 'bg-slate-600/80 hover:bg-slate-500'}"
				>
					<Edit class="h-4 w-4" />
					<span>{$_('tracklistSelector.edit')}</span>
				</button>
				<button
					type="button"
					onclick={() => handleShare(tracklist)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-all focus:ring-2 focus:ring-cyan-400 focus:outline-none {selected
						? 'bg-white/20 hover:bg-white/30'
						: 'bg-slate-600/80 hover:bg-slate-500'}"
				>
					<ShareIcon class="h-4 w-4" />
					<span>{$_('tracklistSelector.share')}</span>
				</button>
				<button
					type="button"
					onclick={() => handleDeleteClick(tracklist)}
					class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition-all {selected
						? 'bg-rose-300/20 hover:bg-rose-500/30'
						: 'hover:bg-rose-1000 bg-rose-900'}"
				>
					<Trash class="h-4 w-4" />
					<span>{$_('tracklistSelector.delete')}</span>
				</button>
			</div>
		{/if}
	</div>
{/snippet}

<!-- Delete Confirmation Dialog -->
<Dialog
	visible={showDeleteDialog}
	title={$_('tracklistSelector.deleteDialog.title')}
	message={$_('tracklistSelector.deleteDialog.message', {
		values: { name: tracklistToDelete?.name || '' }
	})}
	confirmText={$_('tracklistSelector.deleteDialog.confirm')}
	cancelText={$_('tracklistSelector.deleteDialog.cancel')}
	onConfirm={confirmDelete}
	onCancel={cancelDelete}
/>

<!-- Tracklist Editor -->
<TracklistEditor
	visible={showEditor}
	tracklist={editingTracklist}
	onSave={handleSaveTracklist}
	onCancel={handleCancelEdit}
/>

<!-- Tracklist Viewer -->
<TracklistViewer visible={showViewer} tracklist={viewingTracklist} onClose={handleCloseViewer} />

<!-- Share Link Popup -->
<ShareLinkPopup
	visible={showSharePopup}
	url={shareUrl}
	onClose={handleCloseSharePopup}
	shareTitle={$_('shareLink.tracklistTitle')}
	shareText={$_('shareLink.tracklistText')}
	showOpenButton={false}
/>
