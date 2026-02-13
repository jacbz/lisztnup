<script lang="ts">
	import Popup from './Popup.svelte';
	import { _ } from 'svelte-i18n';
	import Search from 'lucide-svelte/icons/search';
	import google from '$lib/assets/icons/google.svg?raw';
	import youtube from '$lib/assets/icons/youtube.svg?raw';
	import spotify from '$lib/assets/icons/spotify.svg?raw';
	import appleMusic from '$lib/assets/icons/apple-music.svg?raw';
	import idagio from '$lib/assets/icons/idagio.svg?raw';
	import amazonMusic from '$lib/assets/icons/amazon-music.svg?raw';
	import tidal from '$lib/assets/icons/tidal.svg?raw';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import wikipedia from '$lib/assets/icons/wikipedia.svg?raw';
	import imslp from '$lib/assets/icons/imslp.svg?raw';

	interface Props {
		visible?: boolean;
		composerLastName: string;
		workName: string;
		onClose?: () => void;
	}

	let { visible = false, composerLastName, workName, onClose = () => {} }: Props = $props();

	const searchQuery = $derived.by(() => {
		const query = `${composerLastName} ${workName}`;
		const normalized = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		return normalized
			.replace(/[^\w\s]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	});

	const searchProviders = $derived([
		{
			url: `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`,
			color: '#3b82f6',
			glowColor: 'rgba(59, 130, 246, 0.4)',
			icon: google
		},
		{
			url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(searchQuery)}`,
			color: '#e5e7eb',
			glowColor: 'rgba(229, 231, 235, 0.4)',
			icon: wikipedia
		},
		{
			url: `https://open.spotify.com/search/${encodeURIComponent(searchQuery)}`,
			color: '#10b981',
			glowColor: 'rgba(16, 185, 129, 0.4)',
			icon: spotify
		},
		{
			url: `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`,
			color: '#ef4444',
			glowColor: 'rgba(239, 68, 68, 0.4)',
			icon: youtube
		},
		{
			url: `https://classical.music.apple.com/search?term=${encodeURIComponent(searchQuery)}`,
			color: '#ef4444',
			glowColor: 'rgba(239, 68, 68, 0.4)',
			icon: appleMusic
		},
		{
			url: `https://music.amazon.com/search/${encodeURIComponent(searchQuery)}`,
			color: '#06b6d4',
			glowColor: 'rgba(6, 182, 212, 0.4)',
			icon: amazonMusic
		},
		{
			url: `https://listen.tidal.com/search?q=${encodeURIComponent(searchQuery)}`,
			color: '#94a3b8',
			glowColor: 'rgba(148, 163, 184, 0.4)',
			icon: tidal
		},
		{
			url: `https://www.deezer.com/search/${encodeURIComponent(searchQuery)}`,
			color: '#a855f7',
			glowColor: 'rgba(168, 85, 247, 0.4)',
			icon: deezer
		},
		{
			url: `https://app.idagio.com/search?query=${encodeURIComponent(searchQuery)}`,
			color: '#1e3a8a',
			glowColor: 'rgba(30, 58, 138, 0.4)',
			icon: idagio
		},
		{
			url: `https://www.google.com/search?q=site:imslp.org+${encodeURIComponent(searchQuery)}`,
			color: '#e5e7eb',
			glowColor: 'rgba(229, 231, 235, 0.4)',
			icon: imslp
		}
	]);

	function handleProviderClick(url: string) {
		window.open(url, '_blank', 'noopener,noreferrer');
		onClose();
	}
</script>

{#snippet children()}
	<div class="flex flex-col gap-4">
		<!-- Header -->
		<div class="flex items-center gap-3">
			<Search class="h-6 w-6 text-cyan-400" />
			<h2 class="text-xl font-semibold text-slate-100">
				{$_('search.title')}
			</h2>
		</div>

		<!-- Search Query Display -->
		<div class="rounded-lg border border-slate-600 bg-slate-800/50 p-3">
			<p class="text-center text-sm text-slate-400">{$_('search.searchFor')}</p>
			<p class="text-center text-lg font-semibold text-cyan-300">{searchQuery}</p>
		</div>

		<!-- Provider Grid -->
		<div class="grid grid-cols-2 gap-3">
			{#each searchProviders as provider}
				<button
					type="button"
					onclick={() => handleProviderClick(provider.url)}
					class="group relative overflow-hidden rounded-xl border-2 bg-slate-900 p-4 font-semibold transition-all duration-300 hover:scale-105 hover:bg-slate-800 active:scale-95"
					style="border-color: {provider.color}; color: {provider.color}; box-shadow: 0 0 20px {provider.glowColor};"
					onmouseenter={(e) => {
						e.currentTarget.style.boxShadow = `0 0 30px ${provider.glowColor}`;
					}}
					onmouseleave={(e) => {
						e.currentTarget.style.boxShadow = `0 0 20px ${provider.glowColor}`;
					}}
				>
					<div class="flex items-center justify-center gap-2">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="flex h-8 w-8">
							{@html provider.icon}
						</div>
					</div>
				</button>
			{/each}
		</div>
	</div>
{/snippet}

<Popup {visible} {onClose} width="md" padding="md">
	{@render children()}
</Popup>
