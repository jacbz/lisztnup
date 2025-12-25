<script lang="ts">
	import '../app.css';
	import '$lib/i18n'; // Initialize i18n
	import Toast from '$lib/components/ui/primitives/Toast.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<link rel="shortcut icon" href="/favicon.ico" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<meta name="apple-mobile-web-app-title" content="Liszt’n Up!" />
	<link rel="manifest" href="/site.webmanifest" />
	<!-- Preconnect to Google Fonts for faster CJK font loading -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<title>Liszt’n Up!</title>
</svelte:head>

<div class="min-h-full w-full">
	{@render children?.()}
	<Toast />
</div>
