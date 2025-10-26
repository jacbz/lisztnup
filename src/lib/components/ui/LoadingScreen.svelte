<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGameData, isDataLoaded } from '$lib/stores';
	import { _ } from 'svelte-i18n';

	let progress = $state(0);
	let error = $state<string | null>(null);
	let intervalId: number | null = null;

	onMount(async () => {
		try {
			await loadGameData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load game data';
		}
	});

	// Simulate progress for visual feedback
	$effect(() => {
		if (!$isDataLoaded && !error) {
			intervalId = window.setInterval(() => {
				progress = Math.min(progress + Math.random() * 10, 90);
			}, 100);
		} else if ($isDataLoaded) {
			progress = 100;
			if (intervalId) {
				clearInterval(intervalId);
			}
		}

		return () => {
			if (intervalId) {
				clearInterval(intervalId);
			}
		};
	});
</script>

<div class="flex h-screen w-full items-center justify-center">
	<div class="text-center">
		<h1
			class="bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text p-16 font-streamster text-9xl font-bold text-transparent select-none"
		>
			{$_('app.title')}
		</h1>

		{#if error}
			<div class="text-xl text-red-400">
				<p>Error loading game data</p>
				<p class="mt-2 text-sm">{error}</p>
			</div>
		{:else}
			<div class="h-2 w-64 overflow-hidden rounded-full bg-gray-800">
				<div
					class="h-full bg-linear-to-r from-cyan-500 to-purple-500 transition-all duration-300"
					style="width: {progress}%"
				></div>
			</div>
			<p class="mt-4 text-sm text-cyan-300">{$_('loading.progress')}</p>
		{/if}
	</div>
</div>

<style>
</style>
