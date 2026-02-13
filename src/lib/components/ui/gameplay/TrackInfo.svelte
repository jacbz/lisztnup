<script lang="ts">
	import type { Track } from '$lib/types';
	import {
		formatComposerName,
		formatLifespan,
		formatYearRange,
		formatPartName,
		getWorkEra,
		getComposerLastName
	} from '$lib/utils';
	import { deezerPlayer, playerState } from '$lib/services';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import { _ } from 'svelte-i18n';
	import { Flag } from 'lucide-svelte';
	import Search from 'lucide-svelte/icons/search';
	import SearchPopup from '../primitives/SearchPopup.svelte';

	interface Props {
		track: Track | null;
		showUpsideDown?: boolean;
	}

	let { track = null, showUpsideDown = true }: Props = $props();

	let showSearchPopup = $state(false);

	const composerName = $derived(track ? formatComposerName(track.composer.name) : '');
	const composerLastName = $derived(track ? getComposerLastName(track.composer.name) : '');
	const lifespan = $derived(
		track ? formatLifespan(track.composer.birth_year, track.composer.death_year) : ''
	);
	const artists = $derived.by(() => {
		// create a dependency on `track`
		if (!track) return [];
		return deezerPlayer.getArtists().filter((name: string) => name !== composerName);
	});
	const shouldShowArtist = $derived(artists.length);
	const shouldShowPart = $derived(track && track.work.name !== track.part.name);
	// Use the currently loaded deezer ID from playerState, or fall back to first ID in array
	const deezerTrackUrl = $derived.by(() => {
		if (!track) return '';
		const loadedId = $playerState.track?.id;
		const deezerId = loadedId ?? track.part.deezer[0];
		return `https://www.deezer.com/track/${deezerId}`;
	});

	// Strip work name prefix from part name if part starts with work name
	const displayPartName = $derived.by(() => {
		if (!track || !shouldShowPart) return '';

		return formatPartName(track.part.name, track.work.name);
	});

	const displayYear = $derived.by(() => {
		const { begin_year, end_year } = track?.work ?? {};

		return formatYearRange(begin_year, end_year);
	});

	const era = $derived.by(() => {
		const { begin_year, end_year } = track?.work ?? {};
		const era = getWorkEra(begin_year, end_year, track?.composer);
		return $_(`eras.${era}`);
	});

	const reportProblemUrl = $derived.by(() => {
		if (!track) return '';

		const loadedId = $playerState.track?.id;
		const deezerId = loadedId ?? track.part.deezer[0];

		const title = encodeURIComponent(`[Data Issue] Problem with track: ${track.work.name}`);
		const body = encodeURIComponent(
			`**Describe the problem:**
(Please describe what is incorrect or missing)

**Expected behavior:**
(What should be correct?)

**Actual behavior:**
(What is currently showing?)

---

**Debug Information:**
- Deezer ID: [${deezerId}](https://www.deezer.com/track/${deezerId})
- Composer: ${track.composer.name} ([\`${track.composer.gid}\`](https://musicbrainz.org/artist/${track.composer.gid}))
- Work: ${track.work.name} ([\`${track.work.gid}\`](https://musicbrainz.org/work/${track.work.gid}))
- Part: ${track.part.name}
- Work Type: ${track.work.type}
- Work Years: ${track.work.begin_year ?? 'null'} - ${track.work.end_year ?? 'null'}
- User Agent: ${navigator.userAgent}`
		);

		return `https://github.com/jacbz/lisztnup/issues/new?title=${title}&body=${body}&labels=data`;
	});
</script>

{#if track}
	{#if showUpsideDown}
		<!-- Compact upside-down info -->
		<div
			class="mb-3 flex rotate-180 flex-col gap-1 border-t border-slate-600 pt-4 text-center text-sm font-semibold text-slate-300 opacity-90"
		>
			<div>
				<span class="font-bold text-cyan-400">{composerName}</span>
				<span class="text-xs text-slate-400">({lifespan})</span>
			</div>
			{#if era || displayYear}
				<div>
					<span class="text-purple-400">{era}</span> ·
					<span class="text-green-400">{displayYear}</span>
				</div>
			{/if}
			<div>
				<div class="text-pink-400">{track.work.name}</div>
				{#if shouldShowPart}
					<div class="text-xs">{displayPartName}</div>
				{/if}
			</div>
		</div>
	{/if}

	<div class="flex h-full flex-col justify-center gap-5">
		<!-- Composer -->
		<div class="flex flex-col gap-1.5">
			<p class="text-center text-3xl font-bold text-cyan-400">
				{composerName}
			</p>
			<p class="text-center text-lg text-slate-400">({lifespan})</p>
		</div>

		{#if era || displayYear}
			<div class="flex flex-col gap-1.5">
				<p class="text-center text-xl font-semibold tracking-wide">
					{#if era}
						<span class="text-purple-400 uppercase">{era}</span>
					{/if}

					{#if era && displayYear}
						<span class="mx-2 text-slate-400">·</span>
					{/if}

					{#if displayYear}
						<span class="bg-linear-to-r bg-clip-text text-nowrap text-green-400">
							{displayYear}
						</span>
					{/if}
				</p>
			</div>
		{/if}

		<!-- Work with Year -->
		<div class="flex flex-col gap-1.5">
			<p class="text-center text-2xl font-semibold wrap-break-word text-pink-400">
				{track.work.name}
			</p>
		</div>

		<!-- Part (only if different from work, with stripped prefix) -->
		{#if shouldShowPart}
			<div class="flex flex-col gap-1.5">
				<p class="text-center text-xl wrap-break-word text-slate-300">
					{displayPartName}
				</p>
			</div>
		{/if}

		<!-- Artist/Performer (only if not unknown) -->
		{#if shouldShowArtist}
			<a
				href={deezerTrackUrl}
				target="_blank"
				rel="noopener noreferrer external"
				data-sveltekit-reload
				data-sveltekit-noscroll
				data-sveltekit-preload-data="false"
				class="text-center text-sm no-underline transition-all duration-200 hover:underline"
				style="color: rgb(162, 56, 255)"
			>
				<div class="mr-[0.1em] mb-[0.2em] inline-flex h-[0.9em] w-[0.9em] align-middle">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html deezer}
				</div>
				{artists.join(', ')}
			</a>
		{/if}

		<!-- Report a problem and Search on... links -->
		<div class="flex items-center justify-center gap-2 text-[0.8rem] text-slate-400">
			<a
				href={reportProblemUrl}
				target="_blank"
				rel="noopener noreferrer external"
				data-sveltekit-reload
				data-sveltekit-noscroll
				data-sveltekit-preload-data="false"
				class="flex items-center gap-1.5 no-underline transition-all duration-300 hover:text-slate-300"
			>
				<Flag class="h-2.5 w-2.5" />
				<span>{$_('common.reportProblem')}</span>
			</a>
			<span class="text-slate-500">·</span>
			<button
				type="button"
				onclick={() => (showSearchPopup = true)}
				class="flex items-center gap-1.5 no-underline transition-all duration-300 hover:text-slate-300"
			>
				<Search class="h-2.5 w-2.5" />
				<span>{$_('common.searchOn')}</span>
			</button>
		</div>
	</div>
{/if}

<SearchPopup
	visible={showSearchPopup}
	{composerLastName}
	workName={track?.work.name ?? ''}
	onClose={() => (showSearchPopup = false)}
/>
