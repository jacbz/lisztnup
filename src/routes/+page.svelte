<script lang="ts">
	import { onMount } from 'svelte';
	import {
		gameData,
		isDataLoaded,
		settings,
		gameState,
		tracklist,
		selectedTracklist
	} from '$lib/stores';
	import { TracklistGenerator, deezerPlayer } from '$lib/services';
	import type { GameMode, Player } from '$lib/types';
	import LoadingScreen from '$lib/components/ui/screens/LoadingScreen.svelte';
	import HomeScreen from '$lib/components/ui/screens/HomeScreen.svelte';
	import ClassicGameScreen from '$lib/components/game/ClassicGameScreen.svelte';
	import BuzzerGameScreen from '$lib/components/game/BuzzerGameScreen.svelte';
	import BingoGameScreen from '$lib/components/game/BingoGameScreen.svelte';
	import GameScreen from '$lib/components/game/GameScreen.svelte';

	// Store reference to the generator for the current game
	let generator: TracklistGenerator | null = null;
	let currentMode: GameMode | null = null;
	let currentPlayers: Player[] = [];
	let isSoloMode = false;
	let enableScoring = true;

	onMount(() => {
		// Load settings from localStorage
		settings.load();
	});

	function handleStartGame(
		mode: GameMode,
		players: Player[],
		solo: boolean,
		scoringEnabled: boolean = true
	) {
		currentMode = mode;
		currentPlayers = players;
		isSoloMode = solo;
		enableScoring = scoringEnabled;

		// Show loading state
		gameState.set('generating');

		// Use setTimeout to allow UI to update before heavy computation
		setTimeout(() => {
			if ($gameData) {
				// Create a generator with filtered data using selected tracklist
				generator = new TracklistGenerator($gameData, $selectedTracklist);

				// Initialize empty tracklist - we'll sample tracks on demand
				tracklist.set([]);

				// Initialize player with settings
				deezerPlayer.setTrackLength($settings.trackLength);

				gameState.set('game');
			}
		}, 50);
	}

	function handleBackToHome() {
		generator = null;
		currentMode = null;
		currentPlayers = [];
		isSoloMode = false;
		enableScoring = true;
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
{:else if $gameState === 'game' && generator && currentMode}
	<GameScreen
		generator={generator!}
		numberOfTracks={$settings.numberOfTracks}
		mode={currentMode}
		players={currentPlayers}
		{isSoloMode}
		enableScoring={currentMode === 'bingo' ? false : $settings.enableScoring}
		ignoreTrackLength={currentMode === 'buzzer'}
		onHome={handleBackToHome}
	>
		{#snippet children()}
			{#if currentMode === 'classic'}
				<ClassicGameScreen />
			{:else if currentMode === 'buzzer'}
				<BuzzerGameScreen />
			{:else}
				<BingoGameScreen />
			{/if}
		{/snippet}
	</GameScreen>
{/if}
