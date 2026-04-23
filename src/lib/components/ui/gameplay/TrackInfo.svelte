<script lang="ts">
	import type { Track } from '$lib/types';
	import {
		formatComposerName,
		formatLifespan,
		formatYearRange,
		getWorkEra,
		getComposerLastName
	} from '$lib/utils';
	import { deezerPlayer, playerState, PreviewPlayer } from '$lib/services';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import { _ } from 'svelte-i18n';
	import { Flag } from 'lucide-svelte';
	import Search from 'lucide-svelte/icons/search';
	import Play from 'lucide-svelte/icons/play';
	import SearchPopup from '../primitives/SearchPopup.svelte';
	import ProblemReportPopup from './ProblemReportPopup.svelte';
	import PlayerControl from './PlayerControl.svelte';
	import { slide } from 'svelte/transition';
	import { onDestroy } from 'svelte';
	import Check from 'lucide-svelte/icons/check-circle';

	interface Props {
		track: Track | null;
		/** If true, shows the upside-down compact info section above the main info, for players seated across from the screen. */
		showMirror: boolean;
		/** Controls horizontal bleed to break out of parent padding. */
		bleed?: 'none' | 'sm' | 'md' | 'lg';
	}

	let { track = null, showMirror = true, bleed = 'lg' }: Props = $props();

	let showSearchPopup = $state(false);
	let showReportPopup = $state(false);
	let reportSubmitted = $state(false);
	let replayActive = $state(false);

	// Self-contained preview player — completely independent of the game's DeezerPlayer singleton
	const previewPlayer = new PreviewPlayer();

	onDestroy(() => previewPlayer.destroy());

	async function handlePlayAgain() {
		if (!track) return;
		replayActive = true;
		const deezerIds = track.part.deezer;
		const deezerId = deezerIds[Math.floor(Math.random() * deezerIds.length)];
		await previewPlayer.play(deezerId);
	}

	function handleReplayStop() {
		previewPlayer.stop();
	}

	function handleReportSuccess() {
		reportSubmitted = true;
	}

	const composerName = $derived(track ? formatComposerName(track.composer.name) : '');
	const composerLastName = $derived(track ? getComposerLastName(track.composer.name) : '');
	const lifespan = $derived(
		track ? formatLifespan(track.composer.birth_year, track.composer.death_year) : ''
	);
	// Check whether the DeezerPlayer's loaded track matches *this* card
	const isLoadedTrack = $derived.by(() => {
		if (!track) return false;
		const loadedId = $playerState.track?.id;
		return !!loadedId && track.part.deezer.includes(loadedId);
	});
	const artists = $derived.by(() => {
		if (!track || !isLoadedTrack) return [];
		return deezerPlayer.getArtists().filter((name: string) => name !== composerName);
	});
	const shouldShowArtist = $derived(artists.length);
	const shouldShowPart = $derived(track && track.work.name !== track.part.name);
	const deezerTrackUrl = $derived.by(() => {
		if (!track) return '';
		const loadedId = $playerState.track?.id;
		const deezerId = isLoadedTrack && loadedId ? loadedId : track.part.deezer[0];
		return `https://www.deezer.com/track/${deezerId}`;
	});

	// Strip work name prefix from part name if part starts with work name
	const displayPartName = $derived.by(() => {
		if (!track || !shouldShowPart) return '';

		return track.part.name;
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

	const bleedClasses = $derived.by(() => {
		switch (bleed) {
			case 'sm':
				return '-mx-4 -mb-4';
			case 'md':
				return '-mx-5 -mb-5';
			case 'lg':
				return '-mx-8 -mb-8';
			default:
				return '';
		}
	});
</script>

{#if track}
	{#if showMirror}
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
		{#if shouldShowArtist && !replayActive}
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
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

		<!-- Replay player -->
		{#if replayActive}
			<div in:slide={{ duration: 300 }} class="flex justify-center">
				<div class="relative flex h-16 w-16 items-center justify-center">
					<PlayerControl
						visible={true}
						isPlaying={previewPlayer.isPlaying}
						playbackEnded={false}
						isRevealed={false}
						progress={previewPlayer.progress}
						playerSize={64}
						onPlay={handlePlayAgain}
						onStop={handleReplayStop}
						onReveal={() => {}}
					/>
				</div>
			</div>
		{/if}

		<!-- Action tabs -->
		<div class="{bleedClasses} overflow-hidden rounded-b-2xl border-t border-slate-600/30">
			<div class="grid grid-cols-3 divide-x divide-slate-700/20 text-center">
				<button
					type="button"
					onclick={handlePlayAgain}
					class="flex flex-col items-center justify-center gap-1 py-4 text-slate-400 transition-all duration-200 hover:bg-white/5 hover:text-slate-200 md:py-2.5"
				>
					<Play class="h-3.5 w-3.5" />
					<span class="text-[0.65rem] leading-tight font-medium">{$_('common.playAgain')}</span>
				</button>
				<button
					type="button"
					onclick={() => (showSearchPopup = true)}
					class="flex flex-col items-center justify-center gap-1 py-4 text-slate-400 transition-all duration-200 hover:bg-white/5 hover:text-slate-200 md:py-2.5"
				>
					<Search class="h-3.5 w-3.5" />
					<span class="text-[0.65rem] leading-tight font-medium">{$_('common.searchOn')}</span>
				</button>
				{#if reportSubmitted}
					<div
						class="flex flex-col items-center justify-center gap-1 py-4 text-green-400 md:py-2.5"
					>
						<Check class="h-3.5 w-3.5" />
						<span class="text-[0.65rem] leading-tight font-medium">{$_('report.success')}</span>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (showReportPopup = true)}
						class="flex flex-col items-center justify-center gap-1 py-4 text-slate-400 transition-all duration-200 hover:bg-white/5 hover:text-slate-200 md:py-2.5"
					>
						<Flag class="h-3.5 w-3.5" />
						<span class="text-[0.65rem] leading-tight font-medium"
							>{$_('common.reportProblem')}</span
						>
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<SearchPopup
	visible={showSearchPopup}
	{composerLastName}
	workName={track?.work.name ?? ''}
	workGid={track?.work.gid}
	onClose={() => (showSearchPopup = false)}
/>

{#if track}
	<ProblemReportPopup
		visible={showReportPopup}
		{track}
		onClose={() => (showReportPopup = false)}
		onSuccess={handleReportSuccess}
	/>
{/if}
