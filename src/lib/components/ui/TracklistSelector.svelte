<script lang="ts">
	import type { Tracklist } from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import { SettingsService } from '$lib/services';
	import { DEFAULT_TRACKLISTS, cloneTracklist } from '$lib/data/defaultTracklists';
	import { get } from 'svelte/store';
	import Popup from './Popup.svelte';
	import Dialog from './Dialog.svelte';
	import TracklistEditor from './TracklistEditor.svelte';
	import { _ } from 'svelte-i18n';

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

	// Combined list of all tracklists
	const allTracklists = $derived([...DEFAULT_TRACKLISTS, ...customTracklists]);

	// Editor state
	let showEditor = $state(false);
	let editingTracklist = $state<Tracklist | null>(null);

	// Delete confirmation dialog state
	let showDeleteDialog = $state(false);
	let tracklistToDelete = $state<Tracklist | null>(null);

	// Compute tracklist info for each tracklist
	const tracklistInfoMap = $derived.by(() => {
		const data = get(gameData);
		if (!data) return {} as Record<string, { composers: number; works: number; tracks: number }>;

		const map: Record<string, { composers: number; works: number; tracks: number }> = {};

		// Calculate info for each tracklist
		for (const tracklist of allTracklists) {
			try {
				const generator = new TracklistGenerator(data, tracklist);
				map[tracklist.name] = generator.getInfo();
			} catch (error) {
				console.error(`Error getting info for tracklist ${tracklist.name}:`, error);
				map[tracklist.name] = { composers: 0, works: 0, tracks: 0 };
			}
		}

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
		SettingsService.saveCustomTracklist(tracklist);
		customTracklists = SettingsService.loadCustomTracklists();
		showEditor = false;
		editingTracklist = null;
	}

	function handleCancelEdit() {
		showEditor = false;
		editingTracklist = null;
	}

	// Helper to check if two tracklists are the same
	function isSameTracklist(a: Tracklist, b: Tracklist): boolean {
		return a.name === b.name && a.isDefault === b.isDefault;
	}
</script>

<Popup visible={visible && !showEditor} {onClose}>
	<div
		class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('tracklistSelector.title')}</h2>

		<!-- Tracklist Selection Grid -->
		<div class="grid gap-3 md:grid-cols-2">
			{#each allTracklists as tracklist}
				<div
					class="relative flex flex-col gap-2 rounded-xl p-4 transition-all {isSameTracklist(
						tracklist,
						selectedTracklist
					)
						? 'bg-linear-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
						: 'border-2 border-gray-700 bg-gray-800 text-gray-300 hover:border-cyan-400/50 hover:bg-gray-700'}"
				>
					<button
						type="button"
						onclick={() => handleClone(tracklist)}
						class="absolute top-2 right-2 rounded-lg p-2 transition-all {isSameTracklist(
							tracklist,
							selectedTracklist
						)
							? 'bg-white/20 hover:bg-white/30'
							: 'bg-gray-700 hover:bg-gray-600'}"
						title={$_('tracklistSelector.clone')}
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
							<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
							<path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
						</svg>
					</button>

					<button
						type="button"
						onclick={() => handleSelect(tracklist)}
						class="flex h-full w-full flex-col items-start gap-2 text-left"
					>
						<div class="flex items-center gap-1 pr-8">
							<div class="tracklist-icon medium shrink-0">
								{#if tracklist.icon}
									{@html tracklist.icon}
								{/if}
							</div>
							<span class="text-lg font-bold"
								>{tracklist.isDefault ? $_(tracklist.name) : tracklist.name}</span
							>
						</div>
						<span
							class="flex-1 text-sm leading-relaxed {isSameTracklist(tracklist, selectedTracklist)
								? 'text-cyan-100'
								: 'text-gray-400'}"
						>
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
								class="flex-1 rounded-lg px-3 py-1 text-sm transition-all {isSameTracklist(
									tracklist,
									selectedTracklist
								)
									? 'bg-white/20 hover:bg-white/30'
									: 'bg-gray-700 hover:bg-gray-600'}"
							>
								{$_('tracklistSelector.edit')}
							</button>
							<button
								type="button"
								onclick={() => handleDeleteClick(tracklist)}
								class="flex-1 rounded-lg px-3 py-1 text-sm transition-all {isSameTracklist(
									tracklist,
									selectedTracklist
								)
									? 'bg-red-300/20 hover:bg-red-500/30'
									: 'bg-red-600/30 hover:bg-red-900/50'}"
							>
								{$_('tracklistSelector.delete')}
							</button>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Create New Button -->
		<button
			type="button"
			onclick={handleCreateNew}
			class="mt-4 w-full rounded-xl border-2 border-dashed border-cyan-400/50 bg-gray-800/50 px-4 py-3 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-gray-800"
		>
			+ {$_('tracklistSelector.createNew')}
		</button>
	</div>
</Popup>

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
