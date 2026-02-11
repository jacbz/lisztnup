<script lang="ts">
	import type { Tracklist } from '$lib/types';
	import Popup from '../primitives/Popup.svelte';
	import TracklistViewer from './TracklistViewer.svelte';
	import { _ } from 'svelte-i18n';
	import Library from 'lucide-svelte/icons/library';
	import ListMusic from 'lucide-svelte/icons/list-music';

	interface Props {
		visible?: boolean;
		tracklist?: Tracklist | null;
		onClose?: () => void;
	}

	let { visible = false, tracklist = null, onClose = () => {} }: Props = $props();
</script>

<Popup {visible} {onClose} width="screen" overflow="hidden" padding="none">
	<div class="flex h-full flex-col">
		<div class="border-b-2 border-cyan-400/30 bg-slate-800/50 p-6">
			<h2 class="flex items-center gap-2 text-2xl font-bold text-cyan-400">
				{#if tracklist}
					<ListMusic class="h-6 w-6" />
					{tracklist.isDefault ? $_(tracklist.name) : tracklist.name}
				{:else}
					<Library class="h-6 w-6" />
					{$_('tracklistViewer.library')}
				{/if}
			</h2>
		</div>

		<div class="flex-1 overflow-hidden">
			<TracklistViewer {visible} {tracklist} />
		</div>
	</div>
</Popup>
