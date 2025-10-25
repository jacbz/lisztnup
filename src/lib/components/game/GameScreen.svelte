<script lang="ts">
	import { onMount } from 'svelte';
	import type { GuessCategory } from '$lib/types';
	import { gameData, tracklist, currentRound, nextRound as nextRoundFn } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import RevealPopup from './RevealPopup.svelte';
	import Home from 'lucide-svelte/icons/home';
	import { _ } from 'svelte-i18n';

	interface Props {
		onHome?: () => void;
	}

	let { onHome = () => {} }: Props = $props();

	let iframeElement: HTMLIFrameElement | undefined = $state();
	let showDebugPlayer = $state(false);

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	const isGameOver = $derived($currentRound.currentTrackIndex >= $tracklist.length);

	onMount(() => {
		// Initialize Deezer player
		if (iframeElement) {
			deezerPlayer.init(iframeElement);
		}

		// Load first track
		if (currentTrack) {
			deezerPlayer.load(currentTrack.part.deezer);
		}
	});

	function handleCategorySelected(category: GuessCategory) {
		currentRound.update((state) => ({
			...state,
			category
		}));
	}

	function handlePlayerClick() {
		if (!currentTrack) return;

		if ($currentRound.isRevealed) {
			// If already revealed, just toggle play/pause
			if ($currentRound.isPlaying) {
				deezerPlayer.pause();
				currentRound.update((state) => ({ ...state, isPlaying: false }));
			} else {
				deezerPlayer.play();
				currentRound.update((state) => ({ ...state, isPlaying: true }));
			}
		} else if ($currentRound.category) {
			// If category is selected and not revealed, reveal the answer
			currentRound.update((state) => ({ ...state, isRevealed: true }));
		} else {
			// Start playing
			deezerPlayer.play();
			currentRound.update((state) => ({ ...state, isPlaying: true }));
		}
	}

	function handleNextRound() {
		nextRoundFn();

		// Load next track
		const nextTrack = $tracklist[$currentRound.currentTrackIndex];
		if (nextTrack) {
			deezerPlayer.load(nextTrack.part.deezer);
			deezerPlayer.setVisible(showDebugPlayer);
		}
	}

	function toggleDebugPlayer() {
		showDebugPlayer = !showDebugPlayer;
		deezerPlayer.setVisible(showDebugPlayer);
	}
</script>

<div class="relative min-h-screen w-full overflow-hidden bg-gray-950 text-white">
	<!-- Header -->
	<div class="absolute top-0 right-0 left-0 z-20 flex items-center justify-between p-6">
		<button
			type="button"
			onclick={onHome}
			class="flex items-center gap-2 rounded-lg bg-gray-800/80 px-4 py-2 text-cyan-400 backdrop-blur-sm
                 transition-colors hover:bg-gray-700/80"
		>
			<Home class="h-5 w-5" />
			{$_('game.home')}
		</button>

		<div class="text-center">
			<p class="text-sm text-gray-400">
				{$_('game.round', {
					values: { current: $currentRound.currentTrackIndex + 1, total: $tracklist.length }
				})}
			</p>
		</div>

		<button
			type="button"
			onclick={toggleDebugPlayer}
			class="rounded-lg bg-gray-800/80 px-4 py-2 text-sm text-gray-400 backdrop-blur-sm
                 transition-colors hover:bg-gray-700/80"
		>
			{showDebugPlayer ? 'Hide' : 'Show'} Player
		</button>
	</div>

	<!-- Game Over Screen -->
	{#if isGameOver}
		<div class="flex h-screen items-center justify-center">
			<div class="text-center">
				<h1
					class="mb-8 bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-6xl font-bold text-transparent"
				>
					{$_('game.gameOver')}
				</h1>
				<p class="mb-8 text-2xl text-gray-300">
					You completed all {$tracklist.length} rounds!
				</p>
				<button
					type="button"
					onclick={onHome}
					class="rounded-xl bg-linear-to-r from-cyan-500 to-purple-600 px-12 py-4 text-xl font-bold text-white
                         shadow-[0_0_30px_rgba(34,211,238,0.4)]
                         transition-all
                         hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95"
				>
					{$_('game.home')}
				</button>
			</div>
		</div>
	{:else if currentTrack}
		<!-- Main Game Area -->
		<div class="flex h-screen items-center justify-center">
			<div class="relative">
				<!-- Spinning Wheel -->
				<SpinningWheel onCategorySelected={handleCategorySelected} />

				<!-- Player Control (centered on wheel) -->
				<PlayerControl isPlaying={$currentRound.isPlaying} onClick={handlePlayerClick} />
			</div>
		</div>

		<!-- Category Display -->
		{#if $currentRound.category && !$currentRound.isRevealed}
			<div
				class="absolute bottom-12 left-1/2 -translate-x-1/2 rounded-2xl border-2 border-cyan-400 bg-gray-900/90 px-8 py-4 backdrop-blur-sm"
			>
				<p class="mb-1 text-sm font-semibold tracking-wider text-cyan-400 uppercase">
					{$_('game.guessCategory', {
						values: { category: $_(`game.categories.${$currentRound.category}`) }
					})}
				</p>
			</div>
		{/if}

		<!-- Reveal Popup -->
		{#if $currentRound.isRevealed}
			<RevealPopup track={currentTrack} onNext={handleNextRound} />
		{/if}
	{/if}

	<!-- Hidden Deezer iframe -->
	<iframe
		bind:this={iframeElement}
		title="deezer-widget"
		src="about:blank"
		width="100%"
		height="300"
		frameborder="0"
		allow="encrypted-media; clipboard-write"
		class="pointer-events-none fixed bottom-[-1000px] opacity-0"
	></iframe>
</div>
