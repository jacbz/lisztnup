<script lang="ts">
	import { onMount } from 'svelte';
	import { gameData, isDataLoaded, settings, gameState, tracklist } from '$lib/stores';
	import { TracklistGenerator, deezerPlayer } from '$lib/services';
	import LoadingScreen from '$lib/components/ui/LoadingScreen.svelte';
	import HomeScreen from '$lib/components/ui/HomeScreen.svelte';
	import GameScreen from '$lib/components/game/GameScreen.svelte';

	// Store reference to the generator for the current game
	let generator: TracklistGenerator | null = null;

	onMount(() => {
		// Load settings from localStorage
		settings.load();
	});

	function handleStartGame() {
		// Show loading state
		gameState.set('generating');

		// Use setTimeout to allow UI to update before heavy computation
		setTimeout(() => {
			if ($gameData) {
				// Create a generator with filtered data using selected tracklist
				generator = new TracklistGenerator($gameData, $settings.selectedTracklist);

				// Initialize empty tracklist - we'll sample tracks on demand
				tracklist.set([]);

				// Initialize player with settings
				deezerPlayer.setTrackLength($settings.trackLength);
				deezerPlayer.setVolume($settings.volume / 100);

				gameState.set('game');
			}
		}, 50);
	}

	function handleBackToHome() {
		generator = null;
		gameState.set('home');
	}

	// Auto-transition from loading to home
	$: if ($isDataLoaded && $gameState === 'loading') {
		gameState.set('home');
	}
</script>

{#if $gameState === 'loading'}
	<LoadingScreen />
{:else if $gameState === 'generating'}
	<LoadingScreen />
{:else if $gameState === 'home'}
	<HomeScreen onStart={handleStartGame} />
{:else if $gameState === 'game' && generator}
	<GameScreen {generator} numberOfTracks={$settings.numberOfTracks} onHome={handleBackToHome} />
{/if}
