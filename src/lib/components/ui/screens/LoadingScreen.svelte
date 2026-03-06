<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGameData, dataLoadProgress } from '$lib/stores';
	import { _ } from 'svelte-i18n';

	const SOUND_FILES = [
		'/correct.mp3',
		'/wrong.mp3',
		'/buzzer.mp3',
		'/start_timeline.mp3',
		'/start_classic.mp3',
		'/start_buzzer.mp3',
		'/start_bingo.mp3',
		'/gameover.mp3'
	];

	let error = $state<string | null>(null);

	onMount(async () => {
		// Preload all sound effects into the browser HTTP cache in parallel.
		// Runs concurrently with the JSON load; failures are silently ignored so a
		// missing audio file never blocks the game from starting.
		SOUND_FILES.forEach((url) =>
			fetch(url)
				.then((r) => r.blob())
				.catch(() => {})
		);

		try {
			await loadGameData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load game data';
		}
	});
</script>

<div class="flex h-screen w-full items-center justify-center">
	<div class="text-center">
		{#if error}
			<div class="text-xl text-red-400">
				<p>Error loading game data</p>
				<p class="mt-2 text-sm">{error}</p>
			</div>
		{:else}
			<div
				class="mx-auto h-2 w-64 overflow-hidden rounded-full border border-cyan-400/30 bg-slate-900"
			>
				<div
					class="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)] transition-all duration-300"
					style="width: {$dataLoadProgress}%"
				></div>
			</div>
			<p class="mt-4 text-sm text-cyan-300">{$_('loading.progress')}</p>
		{/if}
	</div>
</div>

<style>
</style>
