<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import {
		gameData,
		isDataLoaded,
		settings,
		gameState,
		tracklist,
		selectedTracklist
	} from '$lib/stores';
	import { TracklistGenerator, deezerPlayer, SettingsService } from '$lib/services';
	import type { GameMode, Player } from '$lib/types';
	import LoadingScreen from '$lib/components/ui/screens/LoadingScreen.svelte';
	import HomeScreen from '$lib/components/ui/screens/HomeScreen.svelte';
	import ClassicGameScreen from '$lib/components/game/ClassicGameScreen.svelte';
	import BuzzerGameScreen from '$lib/components/game/BuzzerGameScreen.svelte';
	import BingoGameScreen from '$lib/components/game/BingoGameScreen.svelte';
	import TimelineGameScreen from '$lib/components/game/TimelineGameScreen.svelte';
	import GameScreen from '$lib/components/game/GameScreen.svelte';
	import { decompress } from '$lib/utils';
	import { toast } from '$lib/stores';

	let { data } = $props();

	// Store reference to the generator for the current game
	let generator: TracklistGenerator | null = $state(null);
	let currentMode: GameMode | null = $state(null);
	let currentPlayers: Player[] = $state([]);
	let isSoloMode = $state(false);

	/**
	 * Processes a shared tracklist from the 'addTracklist' URL parameter.
	 * Decompresses, validates, and saves the tracklist if it's new.
	 */
	async function handleTracklistFromURL() {
		const urlParams = new URLSearchParams(window.location.search);
		const addTracklistParam = urlParams.get('addTracklist');

		if (addTracklistParam) {
			try {
				const decompressed = await decompress(decodeURIComponent(addTracklistParam));
				const tracklist = JSON.parse(decompressed);

				// Validate tracklist structure (custom tracklists require name and config)
				if (!tracklist.name || !tracklist.config) {
					throw new Error('Invalid tracklist format');
				}

				// Ensure migrated fields are present
				if (!tracklist.kind) tracklist.kind = 'custom';
				if (!tracklist.id) tracklist.id = crypto.randomUUID();

				// Check if tracklist with this id already exists
				const existingTracklists = SettingsService.loadCustomTracklists();
				const exists = existingTracklists.some((t) => t.id === tracklist.id);

				if (exists) {
					toast.error('A tracklist with this name already exists');
				} else {
					// Add the tracklist
					SettingsService.saveCustomTracklist(tracklist);
					toast.success(`Tracklist "${tracklist.name}" added successfully!`);
				}
			} catch (error) {
				console.error('Error processing shared tracklist:', error);
				toast.error('Failed to import shared tracklist');
			}

			// Clear the URL parameter for a cleaner user experience
			const newUrl = window.location.pathname + window.location.hash;
			window.history.replaceState({}, document.title, newUrl);
		}
	}

	onMount(() => {
		// Load settings from localStorage and check for shared tracklists in the URL
		settings.load();
		handleTracklistFromURL();
	});

	function handleStartGame(mode: GameMode, players: Player[], solo: boolean) {
		currentMode = mode;
		currentPlayers = players;
		isSoloMode = solo;

		// Show loading state
		gameState.set('generating');

		// Use setTimeout to allow UI to update before heavy computation
		setTimeout(() => {
			if ($gameData) {
				// Create a generator with filtered data using selected tracklist
				generator = new TracklistGenerator($gameData, $selectedTracklist, {
					requireWorkYear: mode === 'classic' || mode === 'timeline'
				});

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
		gameState.set('home');
	}

	// Auto-transition from loading to home
	$effect(() => {
		if ($isDataLoaded && $gameState === 'loading') {
			gameState.set('home');
		}
	});
</script>

{#if $gameState === 'loading'}
	<div in:fade={{ duration: 300, delay: 300 }} out:fade={{ duration: 300 }}>
		<LoadingScreen />
	</div>
{:else if $gameState === 'generating'}
	<div in:fade={{ duration: 300, delay: 300 }} out:fade={{ duration: 300 }}>
		<LoadingScreen />
	</div>
{:else if $gameState === 'home'}
	<div in:fade={{ duration: 300, delay: 300 }} out:fade={{ duration: 300 }}>
		<HomeScreen onStart={handleStartGame} pageviews24h={data.pageviews24h ?? null} />
	</div>
{:else if $gameState === 'game' && generator && currentMode}
	<div in:fade={{ duration: 300, delay: 300 }} out:fade={{ duration: 300 }}>
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
			{#if currentMode === 'classic'}
				<ClassicGameScreen />
			{:else if currentMode === 'buzzer'}
				<BuzzerGameScreen />
			{:else if currentMode === 'timeline'}
				<TimelineGameScreen players={currentPlayers} cardsToWin={$settings.timelineCardsToWin} {isSoloMode} />
			{:else}
				<BingoGameScreen />
			{/if}
		</GameScreen>
	</div>
{/if}
