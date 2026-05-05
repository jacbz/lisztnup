<script lang="ts">
	import { _ } from 'svelte-i18n';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import github from '$lib/assets/icons/github.svg?raw';
	import musicbrainzIcon from '$lib/assets/icons/musicbrainz-icon.svg?raw';
	import AboutPopup from './AboutPopup.svelte';
	import FeedbackPopup from '../gameplay/FeedbackPopup.svelte';
	import LibraryViewer from '../setup/LibraryViewer.svelte';
	import Library from 'lucide-svelte/icons/library';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	let showAboutPopup = $state(false);
	let showLibraryViewer = $state(false);
	let showFeedbackPopup = $state(false);
</script>

<div class="text-center text-slate-400">
	<div class="flex flex-wrap items-center justify-center gap-2 gap-y-0 text-sm">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<span onclick={() => (showAboutPopup = true)} class="cursor-pointer">
			{@html $_('footer.madeBy', {
				values: {
					name: '<span class="text-cyan-400 transition-colors hover:text-cyan-300">Jacob Zhang</span>'
				}
			})}
		</span>
		<span>|</span>
		<button
			type="button"
			onclick={() => (showLibraryViewer = true)}
			class="inline-flex items-center gap-1.5 text-cyan-400 transition-colors hover:text-cyan-300"
		>
			<Library class="h-4 w-4" />
			<span>{$_('trackTable.library')}</span>
		</button>
		<span>|</span>
		<button
			type="button"
			onclick={() => (showFeedbackPopup = true)}
			class="inline-flex items-center gap-1.5 text-cyan-400 transition-colors hover:text-cyan-300"
		>
			<MessageSquare class="h-3.5 w-3.5" />
			<span>{$_('feedback.title')}</span>
		</button>
	</div>
	<div class="inline-flex flex-wrap items-center justify-center gap-1.5 gap-y-0 text-xs">
		{@html $_('footer.poweredBy', {
			values: {
				first: `<a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300">
						${musicbrainzIcon}
					<span>MusicBrainz</span>
				</a>`,
				second: `<a href="http://deezer.com" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300">
					<div class="w-3">${deezer}</div>
					<span>Deezer</span>
				</a>`
			}
		})}
		<span>|</span>
		<a
			href="https://github.com/jacbz/lisztnup"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300"
		>
			{@html github}
			<span>GitHub</span>
		</a>
	</div>
</div>

<LibraryViewer
	visible={showLibraryViewer}
	tracklist={null}
	onClose={() => (showLibraryViewer = false)}
/>

<AboutPopup visible={showAboutPopup} onClose={() => (showAboutPopup = false)} />

<FeedbackPopup visible={showFeedbackPopup} onClose={() => (showFeedbackPopup = false)} />
