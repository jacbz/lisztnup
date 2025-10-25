<script lang="ts">
	import '../app.css';
	import '$lib/i18n'; // Initialize i18n
	import favicon from '$lib/assets/favicon.svg';
	import Toast from '$lib/components/ui/Toast.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Liszt'n Up! - Classical Music Guessing Game</title>
</svelte:head>

<div class="min-h-screen bg-gray-950">
	{@render children?.()}
	<Toast />
</div>
