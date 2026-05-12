<script lang="ts">
	import { onMount } from 'svelte';
	import { preloadAsset } from '$lib/services/client';
	import { loadGameData } from '$lib/stores';
	import LoadingProgress from '../primitives/LoadingProgress.svelte';

	interface Props {
		onReady?: () => void;
	}

	let { onReady = () => {} }: Props = $props();

	const ASSET_FILES = ['/background.jpg'];
	const FONT_LOADS = [
		'400 1em Streamster',
		'300 1em Rajdhani',
		'400 1em Rajdhani',
		'500 1em Rajdhani',
		'600 1em Rajdhani',
		'700 1em Rajdhani'
	];

	function preloadFonts(): Promise<void> {
		if (!document.fonts) return Promise.resolve();

		return Promise.all(FONT_LOADS.map((font) => document.fonts.load(font)))
			.then(() => document.fonts.ready)
			.then(() => {});
	}

	onMount(async () => {
		loadGameData().catch((error) => {
			console.error('Failed to load game data:', error);
		});

		const tasks = [...ASSET_FILES.map((url) => () => preloadAsset(url)), preloadFonts];
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
