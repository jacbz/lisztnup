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
	import { SettingsService } from '$lib/services';
	import type { Tracklist, GameMode, Player } from '$lib/types';
	import Plus from 'lucide-svelte/icons/plus';

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
	let selectedMode = $state<GameMode | null>($settingsStore.gameMode || 'classic');
	let localSettings = $state({ ...$settingsStore });
	let currentLocale = $state($locale || 'en');
	let currentPlayers = $state<Player[]>([]);
	let currentIsSoloMode = $state(false);
	let playersValid = $state(true);
	let enableScoring = $state($settingsStore.enableScoring); // Load from settings
	let playerSetupRef: any = $state();

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

		// For Bingo mode, start immediately without players
		if (selectedMode === 'bingo') {
			onStart(selectedMode, [], false, false);
		} else {
			// For Classic and Buzzer modes, use current players
			onStart(selectedMode, currentPlayers, currentIsSoloMode, enableScoring);
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
			class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-gray-900/50 px-4 py-2 text-cyan-400 backdrop-blur-sm transition-all hover:border-cyan-400/60 hover:bg-gray-800/70 active:scale-95"
			title="Change Language"
		>
			<Languages class="h-5 w-5" />
			<span class="font-semibold">{locales.find((l) => l.code === currentLocale)?.name}</span>
		</button>
	</div>

	<div class="w-full max-w-5xl px-6 text-center">
		<!-- Title / Logo -->
		<h1
			class="center mt-32 font-streamster text-6xl font-bold text-nowrap text-red-400 select-none sm:text-7xl md:mt-16 md:text-8xl"
		>
			{$_('app.title')}
		</h1>

		<!-- Subtitle -->
		<p class="my-12 text-xl text-cyan-300">{$_('app.subtitle')}</p>

		<!-- Mode Selection -->
		<ModeSelector {selectedMode} onModeSelect={handleModeSelect} />

		<!-- Game Parameters Container -->
		<div
			class="mx-auto mt-10 max-w-2xl rounded-2xl border-2 border-cyan-400/30 bg-gray-900/50 p-6 backdrop-blur-sm"
		>
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<!-- Left Column -->
				<div class="space-y-4">
					<!-- Tracklist Selection -->
					<div>
						<div class="mb-2 flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-400">{$_('home.tracklist')}</span>
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
						<p class="text-sm text-gray-500">
							{$selectedTracklist.isDefault
								? $_($selectedTracklist.description)
								: $selectedTracklist.description}
						</p>
					</div>

					<!-- Number of Tracks (not shown for Bingo mode) -->
					{#if selectedMode !== 'bingo'}
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-gray-400"
								>{$_('settings.numberOfTracks')}</span
							>
							<NumberSelector
								value={localSettings.numberOfTracks}
								options={[5, 10, 15, 20]}
								onChange={handleNumberOfTracksChange}
							/>
						</div>
					{/if}
				</div>

				<!-- Right Column / Divider for Desktop -->
				<div class="md:border-l md:border-gray-700 md:pl-6">
					<!-- Player Setup Header with Controls -->
					<div class="mb-3 flex items-center justify-between gap-2">
						<span class="text-sm font-semibold text-gray-400">{$_('players.setup')}</span>
						<div class="flex gap-2">
							<ToggleButton
								value={enableScoring}
								disabled={selectedMode === 'bingo'}
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
									class="rounded-lg border-2 border-cyan-400/30 bg-gray-900 px-3 py-1.5 text-sm font-semibold text-cyan-400 transition-all duration-200 hover:border-cyan-400 hover:bg-gray-800"
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
					class="group relative w-full cursor-pointer overflow-hidden rounded-2xl border-2 border-cyan-400 bg-gray-900 px-8 py-5 text-xl font-bold text-cyan-400 transition-all duration-300 hover:bg-gray-800 hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-gray-900 disabled:hover:shadow-none"
				>
					<div
						class="absolute inset-0 bg-cyan-400/0 transition-all duration-300 group-hover:bg-cyan-400/5"
					></div>
					<span class="relative">{$_('home.startGame', { default: 'Start Game' })}</span>
				</button>
				{#if selectedMode === 'buzzer' && enableScoring && currentPlayers.length < 2}
					<p class="mt-2 text-center text-sm text-amber-400">
						{$_('players.minPlayers', { default: 'At least two players are required' })}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-16 mb-6 space-y-1 text-center text-gray-400">
			<div class="flex items-center justify-center gap-2 text-sm">
				<span>A Game by Jacob Zhang</span>
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
			<div class="flex items-center justify-center gap-2 text-xs">
				<span>Powered by</span>
				<a
					href="https://musicbrainz.org"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300"
				>
					<svg
						width="12"
						height="12"
						version="1.1"
						viewBox="0 0 25 28"
						fill="currentColor"
						xmlns="http://www.w3.org/2000/svg"
					>
						<polygon points="0 21 12 28 12 0 0 7" />
						<polygon points="25 21 13 28 13 0 25 7" />
					</svg>
					<span>MusicBrainz</span>
				</a>
				<span>and</span>
				<a
					href="http://deezer.com"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-cyan-400 transition-colors hover:text-cyan-300"
				>
					<svg
						width="12"
						height="12"
						fill="currentColor"
						version="1.1"
						viewBox="0 0 48 48"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="m40.258 7.3231c0.4441-2.574 1.0957-4.1926 1.8175-4.1957h0.0016c1.346 0.00464 2.4371 5.618 2.4371 12.548 0 6.9304-1.0927 12.548-2.4402 12.548-0.5524 0-1.0621-0.9539-1.4726-2.5524-0.6486 5.8514-1.9946 9.874-3.5527 9.874-1.2056 0-2.2876-2.4163-3.014-6.2271-0.496 7.2474-1.7443 12.389-3.2033 12.389-0.9156 0-1.7504-2.0375-2.3684-5.3551-0.7432 6.8485-2.46 11.647-4.4623 11.647-2.0022 0-3.722-4.7971-4.4622-11.647-0.6135 3.3176-1.4482 5.3551-2.3685 5.3551-1.4589 0-2.7042-5.1418-3.2032-12.389-0.7264 3.8108-1.8053 6.2271-3.014 6.2271-1.5566 0-2.9041-4.021-3.5527-9.874-0.40746 1.6032-0.92022 2.5524-1.4727 2.5524-1.3475 0-2.4402-5.618-2.4402-12.548 0-6.9305 1.0927-12.548 2.4402-12.548 0.72336 0 1.3704 1.6232 1.8191 4.1957 0.71878-4.4384 1.8862-7.3231 3.2062-7.3231 1.5673 0 2.9255 4.0798 3.568 10.004 0.6287-4.3116 1.5825-7.0603 2.6508-7.0603 1.497 0 2.7698 5.4062 3.2414 12.947 0.8866-3.8665 2.17-6.292 3.5908-6.292s2.7042 2.4271 3.5893 6.292c0.4731-7.5412 1.7443-12.947 3.2414-12.947 1.0667 0 2.019 2.7487 2.6508 7.0603 0.6409-5.924 1.9991-10.004 3.5664-10.004 1.3155 0 2.4875 2.8863 3.2063 7.3231zm-40.258 7.1186c0-3.0981 0.61959-5.6103 1.3841-5.6103s1.3842 2.5122 1.3842 5.6103c0 3.098-0.61959 5.6102-1.3842 5.6102s-1.3841-2.5122-1.3841-5.6102zm45.231 0c0-3.0981 0.6195-5.6103 1.3841-5.6103s1.3842 2.5122 1.3842 5.6103c0 3.098-0.6196 5.6102-1.3842 5.6102s-1.3841-2.5122-1.3841-5.6102z"
							clip-rule="evenodd"
							fill-rule="evenodd"
						/>
					</svg>
					<span>Deezer</span>
				</a>
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

<style>
</style>
