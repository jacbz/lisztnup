<script lang="ts">
	import { onMount } from 'svelte';
	import { gameData, isDataLoaded, settings, gameState, tracklist } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import LoadingScreen from '$lib/components/ui/LoadingScreen.svelte';
	import HomeScreen from '$lib/components/ui/HomeScreen.svelte';
	import SettingsScreen from '$lib/components/ui/SettingsScreen.svelte';
	import GameScreen from '$lib/components/game/GameScreen.svelte';
	import type { GameSettings } from '$lib/types';

	onMount(() => {
		// Load settings from localStorage
		settings.load();
	});

	function handleStartGame() {
		// Generate tracklist
		if ($gameData) {
			const generator = new TracklistGenerator($gameData);
			const tracks = generator.generateTracklist($settings);
			tracklist.set(tracks);
			gameState.set('game');
		}
	}

	function handleOpenSettings() {
		gameState.set('settings');
	}

	function handleBackToHome() {
		gameState.set('home');
	}

	function handleSaveSettings(newSettings: GameSettings) {
		settings.save(newSettings);
		gameState.set('home');
	}

	// Auto-transition from loading to home
	$: if ($isDataLoaded && $gameState === 'loading') {
		gameState.set('home');
	}
</script>

{#if $gameState === 'loading'}
	<LoadingScreen />
{:else if $gameState === 'home'}
	<HomeScreen onStart={handleStartGame} onSettings={handleOpenSettings} />
{:else if $gameState === 'settings'}
	<SettingsScreen onBack={handleBackToHome} onSave={handleSaveSettings} />
{:else if $gameState === 'game'}
	<GameScreen onHome={handleBackToHome} />
{/if}
