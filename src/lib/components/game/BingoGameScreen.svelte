<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import { fly } from 'svelte/transition';
	import type { GuessCategory } from '$lib/types';
	import { tracklist, currentRound, nextRound as nextRoundFn, resetGame, toast } from '$lib/stores';
	import { deezerPlayer } from '$lib/services';
	import SpinningWheel from './SpinningWheel.svelte';
	import PlayerControl from '../ui/PlayerControl.svelte';
	import InGameSettings from '../ui/InGameSettings.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import EdgeDisplay from '../ui/EdgeDisplay.svelte';
	import { _ } from 'svelte-i18n';
	import { getCategoryDefinition } from '$lib/data/categories';
	import { GAME_SCREEN_CONTEXT } from './context';

	const currentTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	// For now, hardcode the disabled categories since generator is in GameScreen
	const disabledCategories = $derived([] as GuessCategory[]); // TODO: get from context or store

	let hasSpunOnce = $state(false); // Track if wheel has been spun in this round
	let showInGameSettings = $state(false);
	let showQuitDialog = $state(false);

	// Get context from parent GameScreen
	const gameContext = getContext(GAME_SCREEN_CONTEXT) as {
		playTrack: () => Promise<void>;
		stopTrack: () => void;
		replayTrack: () => Promise<void>;
		revealTrack: () => void;
		nextRound: () => Promise<void>;
		audioProgress: import('svelte/store').Readable<number>;
		onHome: () => void;
	};

	// Subscribe to audio progress
	let audioProgressValue = $state(0);
	gameContext.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});

	onMount(() => {
		// Detect touch support for wheel interaction
		// (This is handled by GameScreen now)
	});

	onDestroy(() => {
		// Cleanup is handled by GameScreen
	});

	async function handleCategorySelected(category: GuessCategory) {
		// Check if category requires year data and current track has valid years
		if ((category === 'era' || category === 'decade') && currentTrack) {
			const hasValidYears =
				currentTrack.work.begin_year != null || currentTrack.work.end_year != null;

			if (!hasValidYears) {
				// Current track doesn't have year data - for now, just warn and continue
				// GameScreen will handle track sampling issues
				console.warn('Track missing year data for category:', category, currentTrack);
			}
		}

		currentRound.update((state) => ({
			...state,
			category
		}));
	}

	function handleSpinStart() {
		currentRound.update((state) => ({
			...state,
			isSpinning: true
		}));
		hasSpunOnce = true; // Mark that wheel has been spun
	}

	async function handleSpinEnd() {
		currentRound.update((state) => ({
			...state,
			isSpinning: false
		}));
	}

	async function handlePlay() {
		if (!currentTrack) return;

		try {
			await gameContext.playTrack();
		} catch (error) {
			console.error('Error playing track:', error);
			toast.show('error', 'Failed to play track.');
		}
	}

	function handleStop() {
		gameContext.stopTrack();
	}

	function handleReveal() {
		gameContext.revealTrack();
	}

	async function handleReplay() {
		try {
			await gameContext.replayTrack();
		} catch (error) {
			console.error('Error replaying track:', error);
			toast.show('error', 'Failed to replay track.');
		}
	}

	async function handleNextRound() {
		// Reset hasSpunOnce for new round
		hasSpunOnce = false;

		await gameContext.nextRound();
	}

	function handleHomeClick() {
		showQuitDialog = true;
	}

	function handleConfirmQuit() {
		showQuitDialog = false;
		resetGame();
		gameContext.onHome();
	}

	function handleCancelQuit() {
		showQuitDialog = false;
	}
</script>

<!-- Main Game Area -->
{#if currentTrack}
	<div class="flex h-screen items-center justify-center">
		<!-- Spinning Wheel (fills screen) - only in Bingo mode -->
		<SpinningWheel
			currentRoundIndex={$currentRound.currentTrackIndex}
			{disabledCategories}
			onCategorySelected={handleCategorySelected}
			onSpinStart={handleSpinStart}
			onSpinEnd={handleSpinEnd}
		/>

		<!-- Player Control (overlaid on wheel center) -->
		<PlayerControl
			visible={hasSpunOnce && !$currentRound.isSpinning}
			isPlaying={$currentRound.isPlaying}
			playbackEnded={$currentRound.playbackEnded}
			isRevealed={$currentRound.isRevealed}
			progress={audioProgressValue}
			track={currentTrack}
			isBingoMode={true}
			onPlay={handlePlay}
			onStop={handleStop}
			onReveal={handleReveal}
			onReplay={handleReplay}
			onNext={handleNextRound}
		/>
	</div>
{/if}

<!-- Category Display (shown briefly when wheel stops) -->
<EdgeDisplay
	visible={!!($currentRound.category && !$currentRound.isRevealed && !$currentRound.isSpinning)}
	hideTop={true}
>
	{#snippet children()}
		{@const categoryDef = getCategoryDefinition($currentRound.category!)}
		{#if categoryDef}
			<div
				class="rounded-2xl border-4 px-10 py-2 backdrop-blur-md"
				style="background: linear-gradient(135deg, {categoryDef.color1}, {categoryDef.color2});
								   border-color: {categoryDef.color2};
								   box-shadow: 0 0 40px {categoryDef.glowColor};"
			>
				<p class="text-2xl font-bold tracking-wider text-white uppercase drop-shadow-lg">
					{$_('game.guessCategory', {
						values: { category: $_(`game.categories.${$currentRound.category}`) }
					})}
				</p>
			</div>
		{/if}
	{/snippet}
</EdgeDisplay>

<!-- In-Game Settings Popup -->
<InGameSettings visible={showInGameSettings} onClose={() => (showInGameSettings = false)} />

<!-- Quit Confirmation Dialog -->
<Dialog
	visible={showQuitDialog}
	title={$_('quitDialog.title')}
	message={$_('quitDialog.message')}
	confirmText={$_('quitDialog.confirm')}
	cancelText={$_('quitDialog.cancel')}
	onConfirm={handleConfirmQuit}
	onCancel={handleCancelQuit}
/>
