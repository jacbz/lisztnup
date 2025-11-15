<script lang="ts">
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Languages from 'lucide-svelte/icons/languages';
	import { _, locale } from 'svelte-i18n';
	import { settings as settingsStore, selectedTracklist } from '$lib/stores';
	import { locales } from '$lib/i18n';
	import TracklistSelector from '../setup/TracklistSelector.svelte';
	import NumberSelector from '../primitives/NumberSelector.svelte';
	import ToggleButton from '../primitives/ToggleButton.svelte';
	import ModeSelector from '../setup/ModeSelector.svelte';
	import PlayerSetup from '../setup/PlayerSetup.svelte';
	import BingoSetup from '../setup/BingoSetup.svelte';
	import ShareLinkPopup from '../setup/ShareLinkPopup.svelte';
	import { SettingsService } from '$lib/services';
	import type { Tracklist, GameMode, Player } from '$lib/types';
	import Plus from 'lucide-svelte/icons/plus';
	import deezer from '$lib/assets/icons/deezer.svg?raw';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	interface Props {
		onStart?: (
			mode: GameMode,
			players: Player[],
			isSoloMode: boolean,
			enableScoring?: boolean
		) => void;
	}

	let { onStart = () => {} }: Props = $props();

	let showTracklistSelector = $state(false);
	let showShareLinkPopup = $state(false);
	let bingoUrl = $state('');
	let selectedMode = $state<GameMode | null>($settingsStore.gameMode || 'classic');
	let localSettings = $state({ ...$settingsStore });
	let currentLocale = $state($locale || 'en');
	let currentPlayers = $state<Player[]>([]);
	let currentIsSoloMode = $state(false);
	let playersValid = $state(true);
	let enableScoring = $state($settingsStore.enableScoring); // Load from settings
	let playerSetupRef: any = $state();
	let startAudio: HTMLAudioElement | null = null;

	// Load custom tracklists
	let customTracklists = $state(SettingsService.loadCustomTracklists());

	// Update local settings when store changes
	$effect(() => {
		localSettings = { ...$settingsStore };
		// Only sync enableScoring if we're not in Bingo mode (where it's temporarily disabled)
		if (selectedMode !== 'bingo') {
			enableScoring = $settingsStore.enableScoring;
		}
	});

	// Update current locale when it changes
	$effect(() => {
		currentLocale = $locale || 'en';
	});

	// Set bingo URL
	$effect(() => {
		if (browser) {
			bingoUrl = `${window.location.origin}/bingo`;
		}
	});

	function handleTracklistSelect(tracklist: Tracklist) {
		localSettings.selectedTracklist = tracklist.name;
		settingsStore.update((s) => ({ ...s, selectedTracklist: tracklist.name }));
		customTracklists = SettingsService.loadCustomTracklists(); // Reload in case of changes
	}

	function handleNumberOfTracksChange(value: number) {
		localSettings.numberOfTracks = value;
		settingsStore.update((s) => ({ ...s, numberOfTracks: value }));
	}

	function handleLocaleChange(newLocale: string) {
		currentLocale = newLocale;
		locale.set(newLocale);
		if (typeof window !== 'undefined') {
			localStorage.setItem('locale', newLocale);
		}
	}

	function handleModeSelect(mode: GameMode) {
		selectedMode = mode;
		// Update settings to remember the mode
		settingsStore.update((s) => ({ ...s, gameMode: mode }));
		// For Bingo mode, always disable scoring (but don't save to settings)
		// When switching away from Bingo, restore the saved setting
		if (mode === 'bingo') {
			enableScoring = false;
		} else {
			// Restore from settings when switching from Bingo
			enableScoring = $settingsStore.enableScoring;
		}
	}

	function handleStartGame() {
		if (!selectedMode) return;

		// Don't allow starting with invalid player names
		if (!playersValid) return;

		// For Buzzer mode, require at least 2 players only if scoring is enabled
		if (selectedMode === 'buzzer' && enableScoring && currentPlayers.length < 2) {
			return;
		}

		// Play start sound to initialize audio context for Safari
		playStartSound();

		// For Bingo mode, start immediately without players
		if (selectedMode === 'bingo') {
			onStart(selectedMode, [], false, false);
		} else {
			// For Classic and Buzzer modes, use current players
			onStart(selectedMode, currentPlayers, currentIsSoloMode, enableScoring);
		}
	}

	function playStartSound() {
		// Play start sound immediately when button is pressed (fixes Safari audio issue)
		if (startAudio) {
			startAudio.currentTime = 0;
			startAudio.play().catch((err) => console.warn('Failed to play start sound:', err));
		}
	}

	function handlePlayersChange(players: Player[], isSoloMode: boolean, isValid: boolean) {
		currentPlayers = players;
		currentIsSoloMode = isSoloMode;
		playersValid = isValid;
	}

	function handleAddPlayer() {
		// Trigger add player in PlayerSetup via binding
	}

	onMount(() => {
		// Create start audio element
		startAudio = new Audio('/start.mp3');
	});
</script>

<div class="flex min-h-screen w-full items-center justify-center">
	<!-- Locale Button (Top Right) -->
	<div class="absolute top-8 right-8">
		<button
			type="button"
			onclick={() => {
				const currentIndex = locales.findIndex((l) => l.code === currentLocale);
				const nextIndex = (currentIndex + 1) % locales.length;
				handleLocaleChange(locales[nextIndex].code);
			}}
			class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-slate-900/50 px-4 py-2 text-cyan-400 backdrop-blur-sm transition-all hover:border-cyan-400/60 hover:bg-slate-800/70 active:scale-95"
			title="Change Language"
		>
			<Languages class="h-5 w-5" />
			<span class="font-semibold">{locales.find((l) => l.code === currentLocale)?.name}</span>
		</button>
	</div>

	<div class="w-full max-w-5xl px-6 text-center">
		<!-- Title / Logo -->
		<h1
			class="center mt-32 font-streamster text-6xl font-bold text-nowrap text-cyan-400 select-none sm:text-7xl md:mt-16 md:text-8xl"
		>
			{$_('app.title')}
		</h1>

		<!-- Subtitle -->
		<p class="my-12 text-xl text-cyan-300">{$_('app.subtitle')}</p>

		<!-- Mode Selection -->
		<ModeSelector {selectedMode} onModeSelect={handleModeSelect} />

		<!-- Game Parameters Container -->
		<div
			class="mx-auto mt-10 max-w-2xl rounded-2xl border-2 border-cyan-400/30 bg-slate-900/50 p-6 backdrop-blur-sm"
		>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Left Column -->
				<div class="space-y-4">
					<!-- Tracklist Selection -->
					<div>
						<div class="mb-2 flex items-center justify-between">
							<span class="text-sm font-semibold text-slate-400">{$_('home.tracklist')}</span>
							<button
								type="button"
								onclick={() => (showTracklistSelector = true)}
								class="flex items-center gap-1 rounded-lg px-3 py-1 text-cyan-400 transition-colors hover:bg-cyan-400/10"
							>
								{#if $selectedTracklist?.icon}
									<div>
										{@html $selectedTracklist.icon}
									</div>
								{/if}
								<span class="font-bold">
									{$selectedTracklist.isDefault
										? $_($selectedTracklist.name)
										: $selectedTracklist.name}
								</span>
								<ChevronRight class="h-4 w-4" />
							</button>
						</div>
						<p class="text-sm text-slate-500">
							{$selectedTracklist.isDefault
								? $_($selectedTracklist.description)
								: $selectedTracklist.description}
						</p>
					</div>

					<!-- Number of Tracks (not shown for Bingo mode) -->
					{#if selectedMode !== 'bingo'}
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-slate-400"
								>{$_('settings.numberOfTracks')}</span
							>
							<NumberSelector
								value={localSettings.numberOfTracks}
								options={[10, 20, 30]}
								onChange={handleNumberOfTracksChange}
							/>
						</div>
					{/if}
				</div>

				<!-- Right Column / Divider (top divider on mobile) -->
				<div class="border-t border-slate-700 pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6">
					{#if selectedMode === 'bingo'}
						<!-- Bingo-specific setup -->
						<BingoSetup onOpenSharePopup={() => (showShareLinkPopup = true)} />
					{:else}
						<!-- Player Setup Header with Controls -->
						<div class="mb-3 flex items-center justify-between gap-2">
							<span class="text-sm font-semibold text-slate-400">{$_('players.setup')}</span>
							<div class="flex gap-2">
								<ToggleButton
									value={enableScoring}
									disabled={false}
									onToggle={() => {
										enableScoring = !enableScoring;
										settingsStore.update((s) => ({ ...s, enableScoring }));
									}}
									enabledText={$_('home.scoringOn')}
									disabledText={$_('home.scoringOff')}
								/>
								{#if currentPlayers.length < 10}
									<button
										type="button"
										onclick={() => playerSetupRef?.addPlayer()}
										class="rounded-lg border-2 border-cyan-400/30 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-cyan-400 transition-all duration-200 hover:border-cyan-400 hover:bg-slate-800"
									>
										<Plus class="inline h-4 w-4" />
										{$_('players.addPlayer')}
									</button>
								{/if}
							</div>
						</div>
						<!-- Player Setup -->
						<div class:opacity-40={!enableScoring} class:pointer-events-none={!enableScoring}>
							<PlayerSetup
								onPlayersChange={handlePlayersChange}
								onAddPlayer={handleAddPlayer}
								bind:this={playerSetupRef}
							/>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Start Game Button -->
		{#if selectedMode}
			<div class="mx-auto mt-8 max-w-2xl">
				<button
					type="button"
					onclick={handleStartGame}
					disabled={!playersValid ||
						(selectedMode === 'buzzer' && enableScoring && currentPlayers.length < 2)}
					class="group relative w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-cyan-400/50 bg-linear-to-r from-slate-900 via-cyan-950/30 to-slate-900 px-8 py-6 text-2xl font-bold text-white shadow-[0_0_20px_rgba(34,211,238,0.3)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:border-cyan-400 hover:shadow-[0_0_50px_rgba(34,211,238,0.7),0_0_100px_rgba(34,211,238,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:border-cyan-400/50 disabled:hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]"
				>
					<!-- Animated gradient overlay -->
					<div
						class="absolute inset-0 bg-linear-to-r from-transparent via-cyan-400/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:animate-shimmer group-hover:opacity-100 group-disabled:animate-none"
						style="background-size: 200% 100%;"
					></div>

					<!-- Glow effect -->
					<div
						class="absolute inset-0 bg-linear-to-r from-cyan-400/0 via-cyan-400/10 to-cyan-400/0 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100 group-disabled:opacity-0"
					></div>

					<!-- Text with gradient -->
					<span
						class="relative bg-linear-to-r from-cyan-300 via-cyan-400 to-cyan-300 bg-clip-text text-transparent"
					>
						{$_('home.startGame', { default: 'Start Game' })}
					</span>
				</button>
				{#if selectedMode === 'buzzer' && enableScoring && currentPlayers.length < 2}
					<p class="mt-2 text-center text-sm text-amber-400">
						{$_('players.minPlayers', { default: 'At least two players are required' })}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-16 mb-6 text-center text-slate-400">
			<div class="flex items-center justify-center gap-2 text-sm">
				<span>{$_('footer.madeBy')}</span>
				<span>|</span>
				<a
					href="https://github.com/jacbz/lisztnup"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1.5 text-cyan-400 transition-colors hover:text-cyan-300"
				>
					<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
						<path
							fill-rule="evenodd"
							d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
							clip-rule="evenodd"
						/>
					</svg>
					<span>GitHub</span>
				</a>
			</div>
			<div class="inline-flex gap-1 text-xs">
				{@html $_('footer.poweredBy', {
					values: {
						first: `<a href="https://musicbrainz.org" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300">
							<svg width="12" height="12" version="1.1" viewBox="0 0 25 28" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
								<polygon points="0 21 12 28 12 0 0 7" />
								<polygon points="25 21 13 28 13 0 25 7" />
							</svg>
							<span>MusicBrainz</span>
						</a>`,
						second: `<a href="http://deezer.com" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300">
							<div class="w-[12px]">${deezer}</div>
							<span>Deezer</span>
						</a>`
					}
				})}
			</div>
		</div>
	</div>
</div>

<TracklistSelector
	visible={showTracklistSelector}
	selectedTracklist={$selectedTracklist}
	onSelect={handleTracklistSelect}
	onClose={() => (showTracklistSelector = false)}
/>

<ShareLinkPopup
	visible={showShareLinkPopup}
	url={bingoUrl}
	onClose={() => (showShareLinkPopup = false)}
	shareTitle={$_('bingo.shareTitle')}
	shareText={$_('bingo.shareText')}
/>

<style>
</style>
