<script lang="ts">
	import type { Track } from '$lib/types';
	import { formatComposerName, formatLifespan } from '$lib/utils';
	import { deezerPlayer } from '$lib/services';
	import ArrowRight from 'lucide-svelte/icons/arrow-right';
	import { _ } from 'svelte-i18n';

	interface Props {
		track: Track;
		onNext?: () => void;
	}

	let { track, onNext = () => {} }: Props = $props();

	const composerName = $derived(formatComposerName(track.composer.name));
	const lifespan = $derived(formatLifespan(track.composer.birth_year, track.composer.death_year));
	const artistName = $derived(deezerPlayer.getArtistName() || 'Unknown Artist');
</script>

<div
	class="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
	onclick={onNext}
	role="button"
	tabindex="0"
	onkeydown={(e) => e.key === 'Enter' && onNext()}
>
	<div
		class="animate-flip mx-4 w-full max-w-2xl rounded-3xl border-2 border-cyan-400 bg-linear-to-br
             from-gray-900 to-gray-800 p-8
             shadow-[0_0_60px_rgba(34,211,238,0.6)]"
		onclick={(e) => e.stopPropagation()}
		role="presentation"
	>
		<!-- Composer -->
		<div class="mb-6">
			<h3 class="mb-2 text-sm font-semibold tracking-wider text-cyan-400 uppercase">
				{$_('reveal.composer')}
			</h3>
			<p class="text-3xl font-bold text-white">
				{composerName}
			</p>
			<p class="text-lg text-gray-400">({lifespan})</p>
		</div>

		<!-- Work -->
		<div class="mb-6">
			<h3 class="mb-2 text-sm font-semibold tracking-wider text-purple-400 uppercase">
				{$_('reveal.work')}
			</h3>
			<p class="text-2xl font-semibold wrap-break-word text-white">{track.work.name}</p>
			<p class="mt-1 text-sm text-gray-400">
				{$_(`settings.categories.${track.work.type}`)} •
				{track.work.begin_year === track.work.end_year
					? track.work.begin_year
					: `${track.work.begin_year}-${track.work.end_year}`}
			</p>
		</div>

		<!-- Part -->
		<div class="mb-6">
			<h3 class="mb-2 text-sm font-semibold tracking-wider text-pink-400 uppercase">
				{$_('reveal.part')}
			</h3>
			<p class="text-xl wrap-break-word text-white">{track.part.name}</p>
		</div>

		<!-- Artist/Performer -->
		<div class="mb-8">
			<h3 class="mb-2 text-sm font-semibold tracking-wider text-amber-400 uppercase">
				Artist/Performer
			</h3>
			<p class="text-lg text-gray-300">{artistName}</p>
		</div>

		<!-- Next button -->
		<button
			type="button"
			onclick={onNext}
			class="flex w-full items-center justify-center gap-3 rounded-xl bg-linear-to-r from-cyan-500
                 to-purple-600 py-4 font-bold text-white
                 transition-all
                 duration-200 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95"
		>
			{$_('game.nextRound')}
			<ArrowRight class="h-6 w-6" />
		</button>
	</div>
</div>

<style>
	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes flip {
		from {
			transform: perspective(1000px) rotateY(90deg);
			opacity: 0;
		}
		to {
			transform: perspective(1000px) rotateY(0deg);
			opacity: 1;
		}
	}

	.animate-fadeIn {
		animation: fadeIn 0.3s ease-out;
	}

	.animate-flip {
		animation: flip 0.5s ease-out;
	}
</style>
