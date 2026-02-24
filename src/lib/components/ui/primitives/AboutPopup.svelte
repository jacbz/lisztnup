<script lang="ts">
	import Popup from './Popup.svelte';
	import { _ } from 'svelte-i18n';
	import Heart from 'lucide-svelte/icons/heart';
	import github from '$lib/assets/icons/github.svg?raw';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
	}

	let { visible = false, onClose = () => {} }: Props = $props();
</script>

<Popup {visible} {onClose} width="lg">
	{#snippet children()}
		<div class="flex flex-col items-center gap-6 text-center">
			<!-- Header -->
			<div class="flex flex-col items-center gap-3">
				<h2 class="font-streamster text-3xl text-cyan-400">{$_('app.title')}</h2>
				<p class="text-sm text-slate-500">{$_('app.subtitle')}</p>
			</div>

			<!-- Description -->
			<p class="max-w-md leading-relaxed text-slate-300">
				{@html $_('about.description')}
			</p>

			<!-- Divider -->
			<div class="h-px w-24 bg-linear-to-r from-transparent via-cyan-400/40 to-transparent"></div>

			<!-- Donate section -->
			<div class="flex flex-col items-center gap-3">
				<p class="max-w-sm text-sm leading-relaxed text-slate-400">
					{$_('about.donateHint')}
				</p>
				<a
					href="https://paypal.me/jacbz"
					target="_blank"
					rel="noopener noreferrer"
					class="group flex items-center gap-2 rounded-xl border-2 border-pink-400/30 bg-pink-400/5 px-5 py-2.5 text-pink-400 transition-all hover:border-pink-400/60 hover:bg-pink-400/10 hover:shadow-[0_0_20px_rgba(244,114,182,0.2)] active:scale-95"
				>
					<Heart class="h-4 w-4 transition-transform group-hover:scale-110" />
					<span class="font-semibold">{$_('about.donateButton')}</span>
				</a>
			</div>

			<!-- Divider -->
			<div class="h-px w-24 bg-linear-to-r from-transparent via-cyan-400/40 to-transparent"></div>

			<!-- GitHub link -->
			<a
				href="https://github.com/jacbz/lisztnup"
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-cyan-400"
			>
				<span class="h-4 w-4">{@html github}</span>
				<span>{$_('about.viewOnGithub')}</span>
			</a>
		</div>
	{/snippet}
</Popup>
