<script lang="ts">
	import { _ } from 'svelte-i18n';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import github from '$lib/assets/icons/github.svg?raw';
	import musicbrainzIcon from '$lib/assets/icons/musicbrainz-icon.svg?raw';
	import AboutPopup from './AboutPopup.svelte';

	let showAboutPopup = $state(false);
</script>

<div class="text-center text-slate-400">
	<div class="flex items-center justify-center gap-2 text-sm">
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
		<a
			href="https://github.com/jacbz/lisztnup"
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex items-center gap-1.5 text-cyan-400 transition-colors hover:text-cyan-300"
		>
			{@html github}
			<span>GitHub</span>
		</a>
	</div>
	<div class="inline-flex gap-1 text-xs">
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
	</div>
</div>

<div class="fixed right-2 bottom-1 text-[10px] text-slate-600 select-none">
	v{__BUILD_DATE__}
</div>

<AboutPopup visible={showAboutPopup} onClose={() => (showAboutPopup = false)} />
