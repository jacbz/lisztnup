<script lang="ts">
	import { onMount } from 'svelte';
	import { loadGameData, isDataLoaded, dataLoadProgress } from '$lib/stores';
	import { _ } from 'svelte-i18n';

	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			await loadGameData();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load game data';
		}
	});
</script>

<div class="flex h-screen w-full items-center justify-center">
	<div class="text-center">
		<h1 class="p-16 font-streamster text-9xl font-bold text-cyan-400 select-none">
			{$_('app.title')}
		</h1>

		{#if error}
			<div class="text-xl text-red-400">
				<p>Error loading game data</p>
				<p class="mt-2 text-sm">{error}</p>
			</div>
		{:else}
			<div
				class="mx-auto h-2 w-64 overflow-hidden rounded-full border border-cyan-400/30 bg-gray-900"
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
