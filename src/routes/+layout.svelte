<script lang="ts">
	import { type Snippet, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import '../app.css';
	import '$lib/i18n'; // Initialize i18n
	import Toast from '$lib/components/ui/primitives/Toast.svelte';
	import { _, locale } from 'svelte-i18n';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	function applyInitialLocale(
		routeLocale: LayoutData['routeLocale'],
		initialLocale: LayoutData['locale']
	) {
		if (!browser || routeLocale) {
			locale.set(initialLocale);
		}
	}

	untrack(() => applyInitialLocale(data.routeLocale, data.locale));
</script>

<svelte:head>
	<title>{$_('app.title')} - {$_('app.subtitle')} ({$_('app.inspiredByHitster')})</title>
	<meta name="description" content={$_('app.seoDescription')} />
	<link rel="canonical" href={data.canonicalUrl} />
	{#each data.alternates as alternate (alternate.locale)}
		<link rel="alternate" hreflang={alternate.locale} href={alternate.href} />
	{/each}
	<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
	<link rel="shortcut icon" href="/favicon.ico" />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="Liszt’n Up!" />
	<link rel="manifest" href="/site.webmanifest" />
	<meta property="og:type" content="website" />
	<meta
		property="og:title"
		content="{$_('app.title')} - {$_('app.subtitle')} ({$_('app.inspiredByHitster')})"
	/>
	<meta property="og:description" content={$_('app.seoDescription')} />
	<meta property="og:url" content={data.canonicalUrl} />
	<meta property="og:image" content={data.ogImageUrl} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta
		name="twitter:title"
		content="{$_('app.title')} - {$_('app.subtitle')} ({$_('app.inspiredByHitster')})"
	/>
	<meta name="twitter:description" content={$_('app.seoDescription')} />
	<meta name="twitter:image" content={data.ogImageUrl} />
	<!-- Preconnect to Google Fonts for faster CJK font loading -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
</svelte:head>

<div class="min-h-full w-full">
	{@render children?.()}
	<Toast />
</div>
