<script lang="ts">
	import type { Track } from '$lib/types';
	import {
		formatComposerName,
		formatLifespan,
		formatYearRange,
		formatPartName,
		getWorkEra
	} from '$lib/utils';
	import { deezerPlayer, playerState } from '$lib/services';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import { _ } from 'svelte-i18n';

	interface Props {
		track: Track | null;
	}

	let { track = null }: Props = $props();

	const composerName = $derived(track ? formatComposerName(track.composer.name) : '');
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
		artists;

		return formatPartName(track.part.name, track.work.name);
	});

	const displayYear = $derived.by(() => {
		const { begin_year, end_year } = track?.work ?? {};

		return formatYearRange(begin_year, end_year);
	});

	const era = $derived.by(() => {
		const { begin_year, end_year } = track?.work ?? {};
		const composerName = track?.composer.name;
		const era = getWorkEra(begin_year, end_year, composerName);
		return $_(`eras.${era}`);
	});
</script>

{#if track}
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

	<div class="flex flex-col gap-5">
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
				rel="noopener noreferrer"
				class="text-center text-sm no-underline transition-all duration-200 hover:underline"
				style="color: rgb(162, 56, 255)"
			>
				<div class="mr-[0.1em] mb-[0.2em] inline-flex h-[0.9em] align-middle">{@html deezer}</div>
				{artists.join(', ')}
			</a>
		{/if}
	</div>
{/if}
