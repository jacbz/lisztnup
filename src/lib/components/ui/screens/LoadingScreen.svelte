<script lang="ts">
	import { onMount } from 'svelte';
	import { preloadAsset } from '$lib/services/client';
	import { loadGameData } from '$lib/stores';
	import LoadingProgress from '../primitives/LoadingProgress.svelte';

	interface Props {
		onReady?: () => void;
	}

	let { onReady = () => {} }: Props = $props();

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

	const ASSET_FILES = [...SOUND_FILES, '/background.jpg'];

	onMount(async () => {
		loadGameData().catch((error) => {
			console.error('Failed to load game data:', error);
		});

		const tasks = [...ASSET_FILES.map((url) => () => preloadAsset(url))];
		const total = tasks.length;

		if (total === 0) {
			onReady();
			return;
		}

		await Promise.all(tasks.map((task) => task().catch(() => {})));
		onReady();
	});
</script>

<div class="flex h-screen w-full items-center justify-center">
	<LoadingProgress showText={false} compact={true} indeterminate={true} />
</div>

<style>
</style>
