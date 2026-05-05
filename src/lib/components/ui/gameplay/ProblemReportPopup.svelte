<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { Track } from '$lib/models';
	import Popup from '../primitives/Popup.svelte';
	import { analytics } from '$lib/game-logger';
	import { playerState } from '$lib/services';
	import ExternalLink from '../primitives/ExternalLink.svelte';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import Loader from 'lucide-svelte/icons/loader-2';
	import Send from 'lucide-svelte/icons/send';
	import Flag from 'lucide-svelte/icons/flag';
	import { formatComposerName } from '$lib/utils';

	interface Props {
		visible: boolean;
		track: Track;
		onClose: () => void;
		onSuccess: () => void;
	}

	let { visible, track, onClose, onSuccess }: Props = $props();

	let message = $state('');
	let email = $state('');
	let isSending = $state(false);
	let error = $state<string | null>(null);

	const charCount = $derived(message.length);
	const isTooShort = $derived(charCount > 0 && charCount < 5);
	const isTooLong = $derived(charCount > 1000);
	const isValid = $derived(charCount >= 5 && charCount <= 1000);

	const isLoadedTrack = $derived.by(() => {
		const loadedId = $playerState.track?.id;
		return !!loadedId && track.part.deezer.includes(loadedId);
	});

	const deezerId = $derived(
		isLoadedTrack && $playerState.track?.id ? $playerState.track.id : track.part.deezer[0]
	);

	const composerName = $derived(formatComposerName(track.composer.name));

	async function handleSubmit() {
		if (!isValid || isSending) return;

		isSending = true;
		error = null;

		const success = await analytics.reportProblem({
			message: message.trim(),
			email: email.trim() || undefined,
			deezerId,
			composer: track.composer.name,
			work: track.work.name,
			part: track.part.name,
			workType: track.work.type,
			workYears: `${track.work.begin_year ?? 'null'} - ${track.work.end_year ?? 'null'}`
		});

		isSending = false;

		if (success) {
			onSuccess();
			onClose();
			message = '';
			email = '';
		} else {
			error = 'Failed to send report. Please try again.';
		}
	}

	function handleClose() {
		if (isSending) return;
		onClose();
	}
</script>

<Popup {visible} onClose={handleClose} width="w-full max-w-4xl">
	<div class="flex flex-col gap-6">
		<!-- Header -->
		<div class="flex items-center gap-3 border-b border-slate-800 pb-4">
			<Flag class="h-6 w-6 text-cyan-400" />
			<h2 class="text-2xl font-bold text-white">{$_('report.title')}</h2>
		</div>

		<div class="flex flex-col gap-4">
			<p class="text-sm text-slate-400">
				{$_('report.prompt')}
			</p>

			<div class="flex flex-col gap-2">
				<div class="relative">
					<textarea
						bind:value={message}
						placeholder={$_('report.placeholder')}
						class="h-48 w-full rounded-xl border-2 {isTooShort || isTooLong
							? 'border-red-500/50'
							: 'border-slate-700/50'} bg-slate-950/50 p-4 text-lg text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-hidden"
						disabled={isSending}
						maxlength="1100"
					></textarea>
					<div
						class="absolute right-3 bottom-3 text-xs {isTooLong || isTooShort
							? 'text-red-400'
							: charCount > 900
								? 'text-yellow-400'
								: 'text-slate-500'}"
					>
						{charCount}/1000
					</div>
				</div>
				<input
					type="email"
					bind:value={email}
					placeholder={$_('common.emailPlaceholder')}
					class="w-full rounded-xl border-2 border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-hidden"
					disabled={isSending}
					maxlength="254"
				/>
			</div>

			{#if error}
				<p class="text-xs text-red-400">{error}</p>
			{/if}

			<button
				type="button"
				onclick={handleSubmit}
				disabled={isSending || !isValid}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 py-3.5 font-bold text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all duration-200 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isSending}
					<Loader class="h-5 w-5 animate-spin" />
					{$_('report.sending')}
				{:else}
					<Send class="h-5 w-5" />
					{$_('report.submit')}
				{/if}
			</button>
			<div
				class="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[0.7rem] text-slate-500"
			>
				<a
					href="https://musicbrainz.org/artist/{track.composer.gid}"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1 text-cyan-400/80 hover:text-cyan-400 hover:underline"
				>
					{composerName}
					<ExternalLink />
				</a>

				<span class="mx-1 opacity-30">|</span>

				<a
					href="https://musicbrainz.org/search?query=wid%3A{track.work
						.gid}-*&type=work&limit=25&method=advanced"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1 text-cyan-400/80 hover:text-cyan-400 hover:underline"
				>
					{track.work.name}
					<ExternalLink />
				</a>

				<span class="mx-1 opacity-30">|</span>

				<a
					href="https://www.deezer.com/track/{deezerId}"
					target="_blank"
					rel="noopener noreferrer"
					class="flex items-center gap-1 text-cyan-400/80 hover:text-cyan-400 hover:underline"
				>
					<div class="h-[0.9em] w-[0.9em]">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->{@html deezer}
					</div>
					{deezerId}
				</a>
			</div>
		</div>
	</div>
</Popup>
