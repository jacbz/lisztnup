<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Liszt'n Up! - Classical Music Guessing Game</title>
</svelte:head>

<div class="min-h-screen bg-gray-950">
	{@render children?.()}
</div>
