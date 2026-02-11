<script lang="ts">
	import Popup from '../primitives/Popup.svelte';
	import TracklistViewer from './TracklistViewer.svelte';
	import { _ } from 'svelte-i18n';
	import Plus from 'lucide-svelte/icons/plus';
	import Ban from 'lucide-svelte/icons/ban';

	import type { Tracklist } from '$lib/types';

	interface Props {
		visible?: boolean;
		/** Set of work GIDs already selected */
		selectedWorkGids?: Set<string>;
		/** 'include' or 'exclude' mode */
		mode?: 'include' | 'exclude';
		/** Tracklist to display (null = full library) */
		tracklist?: Tracklist | null;
		/** Set of work GIDs in the current filtered tracklist (visual indicator) */
		tracklistWorkGids?: Set<string>;
		/** Optional custom title */
		title?: string;
		onAddWork?: (workGid: string) => void;
		onRemoveWork?: (workGid: string) => void;
		onClose?: () => void;
	}

	let {
		visible = false,
		selectedWorkGids = new Set<string>(),
		mode = 'include',
		tracklist = null,
		tracklistWorkGids = new Set<string>(),
		title = '',
		onAddWork = () => {},
		onRemoveWork = () => {},
		onClose = () => {}
	}: Props = $props();
</script>

<Popup {visible} {onClose} width="screen" overflow="hidden" padding="none">
	<div class="flex h-full flex-col">
		<div class="border-b-2 border-cyan-400/30 bg-slate-800/50 p-6">
			<div class="flex items-center gap-3">
				{#if mode === 'include'}
					<Plus class="h-6 w-6 text-cyan-400" />
				{:else}
					<Ban class="h-6 w-6 text-red-400" />
				{/if}
				<h2 class="text-2xl font-bold {mode === 'include' ? 'text-cyan-400' : 'text-red-400'}">
					{title ||
						(mode === 'include'
							? $_('tracklistEditor.curation.selectWorksToInclude')
							: $_('tracklistEditor.curation.selectWorksToExclude'))}
				</h2>
				{#if selectedWorkGids.size > 0}
					<span class="rounded-full bg-slate-700 px-3 py-1 text-sm text-slate-300">
						{selectedWorkGids.size}
						{$_('tracklistEditor.curation.selected')}
					</span>
				{/if}
			</div>
		</div>

		<div class="flex-1 overflow-hidden">
			<TracklistViewer
				{visible}
				{tracklist}
				showActions={true}
				includedWorkGids={selectedWorkGids}
				{tracklistWorkGids}
				actionMode={mode}
				{onAddWork}
				{onRemoveWork}
			/>
		</div>
	</div>
</Popup>
