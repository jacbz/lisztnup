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

	const ASSET_FILES = [
		...SOUND_FILES,
		'/background.jpg',
		'/favicon.ico',
		'/favicon.svg',
		'/favicon-96x96.png',
		'/apple-touch-icon.png',
		'/web-app-manifest-192x192.png',
		'/web-app-manifest-512x512.png',
		'/site.webmanifest'
	];

	const FONT_SPECS = [
		'1em Streamster',
		'300 1em Rajdhani',
		'400 1em Rajdhani',
		'500 1em Rajdhani',
		'600 1em Rajdhani',
		'700 1em Rajdhani'
	];

	function preloadFont(spec: string): Promise<void> {
		if (!document.fonts) return Promise.resolve();
		return document.fonts.load(spec).then(() => {});
	}

	onMount(async () => {
		loadGameData().catch((error) => {
			console.error('Failed to load game data:', error);
		});

		const tasks = [
			...ASSET_FILES.map((url) => () => preloadAsset(url)),
			...FONT_SPECS.map((spec) => () => preloadFont(spec))
		];
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
