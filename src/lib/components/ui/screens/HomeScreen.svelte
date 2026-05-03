<script lang="ts">
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
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
	import type { Tracklist, GameMode, Player } from '$lib/types';
	import { tracklistDisplayName, tracklistDescription } from '$lib/data/defaultTracklists';
	import Plus from 'lucide-svelte/icons/plus';
	import AppFooter from '../primitives/AppFooter.svelte';
	import FeedbackPopup from '../gameplay/FeedbackPopup.svelte';
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { browser } from '$app/environment';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Users from 'lucide-svelte/icons/users';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Scroll from 'lucide-svelte/icons/scroll';
	import { getPlayerToken } from '$lib/stores/identity';
	import { getDailyTracklist, getTodayDateString } from '$lib/utils/dailyChallenge';
	import { resolveTimelineTracks } from '$lib/utils/search';
	import { gameData } from '$lib/stores/gameData';
	import { get } from 'svelte/store';
	import type { Track } from '$lib/types';
	import TimelinePopup from '$lib/components/game/timeline/TimelinePopup.svelte';
	import { SquareStack } from 'lucide-svelte';

	/** Get flag SVG URL for an ISO 3166-1 alpha-2 country code */
	function countryFlagUrl(code: string | undefined | null): string | null {
		if (!code || code.length !== 2 || code === 'UNKNOWN') return null;
		return `https://purecatamphetamine.github.io/country-flag-icons/3x2/${code.toUpperCase()}.svg`;
	}

	/** Get localized country name for a country code */
	function countryName(code: string | undefined | null, loc: string): string {
		if (!code || code.length !== 2 || code === 'UNKNOWN') return '';
		try {
			return new Intl.DisplayNames([loc], { type: 'region' }).of(code.toUpperCase()) ?? '';
		} catch {
			return '';
		}
	}

	interface LeaderboardEntry {
		player_name: string | null;
		score: number;
		cards: number;
		accuracy: number;
		country?: string;
		timestamp?: string;
		is_me?: boolean;
		timeline?: string | null;
	}

	function formatEntryDate(timestamp: string | undefined, locale: string): string {
		if (!timestamp) return '';
		const d = new Date(timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T'));
		if (isNaN(d.getTime())) return '';
		return d.toLocaleDateString(locale, { year: 'numeric', month: 'numeric', day: 'numeric' });
	}

	interface Props {
		onStart?: (
			mode: GameMode,
			players: Player[],
			isSoloMode: boolean,
			enableScoring?: boolean
		) => void;
		pageviews24h?: number | null;
	}

	let { onStart = () => {}, pageviews24h = null }: Props = $props();

	let showTracklistSelector = $state(false);
	let showShareLinkPopup = $state(false);
	let showLocaleDropdown = $state(false);
	let bingoUrl = $state('');
	let selectedMode = $state<GameMode | null>($settingsStore.gameMode || 'classic');
	let localSettings = $state({ ...$settingsStore });
	let currentLocale = $derived($locale || 'en');
	let currentPlayers = $state<Player[]>([]);
	let currentIsSoloMode = $state(false);
	let playersValid = $state(true);
	let enableScoring = $state($settingsStore.enableScoring); // Load from settings
	let showFeedbackPopup = $state(false);
	let leaderboardEntries = $state<LeaderboardEntry[]>([]);
	let showExpandedLeaderboard = $state(false);
	let showTimelinePopup = $state(false);
	let timelineTracks = $state<Track[]>([]);
	let timelinePlayerName = $state('');
	let timelineScore = $state(0);
	let timelineTimestamp = $state<string | undefined>();
	let playerSetupRef: { addPlayer: () => void } | undefined = $state();
	let startAudio: HTMLAudioElement | null = null;
	let startAudioSources = {
		classic: '/start_classic.mp3',
		buzzer: '/start_buzzer.mp3',
		timeline: '/start_timeline.mp3',
		bingo: '/start_bingo.mp3'
	};

	// Daily challenge state
	let dailyTracklist = getDailyTracklist();
	let dailyHighScore = $state<{ name: string | null; score: number } | null>(null);
	let showDailyChallenge = $derived(
		selectedMode === 'timeline' &&
			localSettings.dailyChallengePlayedDate !== getTodayDateString()
	);

	// Update local settings when store changes
	$effect(() => {
		localSettings = { ...$settingsStore };
		// Only sync enableScoring if we're not in Bingo/Timeline (where scoring is forced off/on)
		if (selectedMode !== 'bingo' && selectedMode !== 'timeline') {
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

	// Load leaderboard when timeline mode is selected or settings change
	$effect(() => {
		if (selectedMode === 'timeline' && browser) {
			const tracklist = localSettings.selectedTracklist;
			const cards = localSettings.timelineCardsToWin;
			const limit = showExpandedLeaderboard ? 20 : 6;
			const parts = [`limit=${limit}`];
			if (tracklist) parts.push(`tracklist=${encodeURIComponent(tracklist)}`);
			if (cards) parts.push(`cardsToWin=${encodeURIComponent(cards)}`);
			parts.push(`token=${encodeURIComponent(getPlayerToken())}`);
			fetch(`/api/game/leaderboard?${parts.join('&')}`)
				.then((res) => (res.ok ? res.json() : { entries: [] }))
				.then((data) => { leaderboardEntries = data.entries ?? []; })
				.catch(() => { leaderboardEntries = []; });
		}
	});

	// Fetch the #1 score for the daily challenge tracklist
	$effect(() => {
		if (showDailyChallenge && browser) {
			const cards = localSettings.timelineCardsToWin;
			const parts = [
				'limit=1',
				`tracklist=${encodeURIComponent(dailyTracklist.id)}`,
				`cardsToWin=${encodeURIComponent(cards)}`,
				`token=${encodeURIComponent(getPlayerToken())}`
			];
			fetch(`/api/game/leaderboard?${parts.join('&')}`)
				.then((res) => (res.ok ? res.json() : { entries: [] }))
				.then((data) => {
					const top = data.entries?.[0];
					dailyHighScore = top ? { name: top.player_name, score: top.score } : null;
				})
				.catch(() => { dailyHighScore = null; });
		}
	});

	function handleTracklistSelect(tracklist: Tracklist) {
		localSettings.selectedTracklist = tracklist.id;
		settingsStore.update((s) => ({ ...s, selectedTracklist: tracklist.id }));
	}

	function handleLocaleChange(newLocale: string) {
		currentLocale = newLocale;
		locale.set(newLocale);
		// localStorage persistence is handled automatically in i18n/index.ts
	}

	function handleModeSelect(mode: GameMode) {
		selectedMode = mode;
		// Update settings to remember the mode
		settingsStore.update((s) => ({ ...s, gameMode: mode }));
		// For Bingo mode, always disable scoring (but don't save to settings)
		// For Timeline mode, always enable scoring (but don't save to settings)
		// When switching away, restore the saved setting
		if (mode === 'bingo') {
			enableScoring = false;
		} else if (mode === 'timeline') {
			enableScoring = true;
		} else {
			// Restore from settings when switching from Bingo
			enableScoring = $settingsStore.enableScoring;
		}
		// Update audio source when mode changes
		if (startAudio && mode) {
			startAudio.src = startAudioSources[mode];
		}
	}

	function handleNumberOfTracksChange(value: number) {
		localSettings.numberOfTracks = value;
		settingsStore.update((s) => ({ ...s, numberOfTracks: value }));
	}

	function handleTimelineCardsToWinChange(value: number) {
		localSettings.timelineCardsToWin = value;
		settingsStore.update((s) => ({ ...s, timelineCardsToWin: value }));
	}

	function handleStartGame() {
		if (!selectedMode) return;

		// Don't allow starting with invalid player names
		if (!playersValid) return;

		// Track games played (for new-user detection) and daily challenge completion
		settingsStore.update((s) => {
			const updates: Partial<typeof s> = { gamesPlayed: (s.gamesPlayed ?? 0) + 1 };
			if (
				selectedMode === 'timeline' &&
				localSettings.selectedTracklist === dailyTracklist.id
			) {
				updates.dailyChallengePlayedDate = getTodayDateString();
			}
			return { ...s, ...updates };
		});

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

	function handleShowTimeline(entry: LeaderboardEntry) {
		if (!entry.timeline || entry.timeline === '[]') return;
		try {
			const gids = JSON.parse(entry.timeline) as [string, string][];
			const data = get(gameData);
			if (data && gids.length > 0) {
				timelineTracks = resolveTimelineTracks(data, gids);
				timelinePlayerName = entry.player_name || $_('leaderboard.anonymous');
				timelineScore = entry.score;
				timelineTimestamp = entry.timestamp;
				showTimelinePopup = true;
			}
		} catch (e) {
			console.error('Failed to parse timeline', e);
		}
	}

	function handleAddPlayer() {
		// Trigger add player in PlayerSetup via binding
	}

	onMount(() => {
		// Create start audio element with initial mode
		const initialMode = selectedMode || 'classic';
		startAudio = new Audio(startAudioSources[initialMode]);

		// Close locale dropdown when clicking outside
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (!target.closest('[data-locale-dropdown]')) {
				showLocaleDropdown = false;
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});
</script>

<div class="flex min-h-screen w-full items-center justify-center">
	<!-- Locale Button (Top Right) -->
	<div class="absolute top-8 right-8" data-locale-dropdown>
		<div class="relative">
			<button
				type="button"
				onclick={() => (showLocaleDropdown = !showLocaleDropdown)}
				class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-slate-900/50 px-4 py-2 text-cyan-400 backdrop-blur-sm transition-all hover:border-cyan-400/60 hover:bg-slate-800/70 active:scale-95"
				title="Change Language"
			>
				<Languages class="h-5 w-5" />
				<span class="font-semibold">{locales.find((l) => l.code === currentLocale)?.name}</span>
			</button>

			{#if showLocaleDropdown}
				<div
					class="absolute right-0 z-50 mt-2 rounded-lg border-2 border-cyan-400/30 bg-slate-900/95 shadow-lg backdrop-blur-sm"
				>
					{#each locales as loc (loc.code)}
						<button
							type="button"
							onclick={() => {
								handleLocaleChange(loc.code);
								showLocaleDropdown = false;
							}}
							lang={loc.code}
							class="w-full px-4 py-2 text-left text-cyan-400 transition-colors first:rounded-t-md last:rounded-b-md hover:bg-slate-800/70 {currentLocale ===
							loc.code
								? 'bg-cyan-400/10 font-semibold'
								: ''}"
						>
							{loc.name}
						</button>
					{/each}
				</div>
			{/if}
		</div>
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

		<!-- Daily Challenge Banner -->
		{#if showDailyChallenge}
			<button
				type="button"
				onclick={() => handleTracklistSelect(dailyTracklist)}
				class="group mx-auto mt-8 flex w-full max-w-2xl cursor-pointer items-center gap-4 rounded-2xl border-2 border-amber-400/40 bg-linear-to-r from-amber-950/30 via-amber-900/20 to-amber-950/30 px-5 py-4 text-left shadow-[0_0_20px_rgba(251,191,36,0.15)] backdrop-blur-sm transition-all duration-300 hover:border-amber-400/70 hover:shadow-[0_0_30px_rgba(251,191,36,0.3)] active:scale-[0.98]"
			>
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-400 transition-colors group-hover:bg-amber-400/25">
					<Sparkles class="h-5 w-5" />
				</div>
				<div class="min-w-0 flex-1 flex flex-col gap-0.5">
					<div class="flex md:items-center md:gap-2 flex-col md:flex-row">
						<span class="text-sm font-bold text-amber-400">{$_('dailyChallenge.title')}</span>
						<span class="text-xs text-amber-400/60">{$_('dailyChallenge.subtitle')}</span>
					</div>
					<div class="mt-0.5 flex items-center gap-1.5">
						{#if dailyTracklist.icon}
							<div class="text-amber-300/70">{@html dailyTracklist.icon}</div>
						{/if}
						<span class="truncate font-semibold text-amber-200">{tracklistDisplayName(dailyTracklist, $_)}</span>
					</div>
				{#if dailyHighScore}
					{@const rawName = dailyHighScore.name ?? $_('leaderboard.anonymous')}
					{@const escapeName = rawName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
					{@const nameStyle = dailyHighScore.name ? 'font-weight:500;color:rgb(252 211 77/0.8)' : 'font-weight:400;color:rgb(148 163 184/0.8)'}
					<p class="mt-0.5 text-xs text-amber-400/60">
						{@html $_(
							'dailyChallenge.highScore',
							{ values: { name: `<strong style="${nameStyle}">${escapeName}</strong>`, score: `<strong style="font-weight:700;color:rgb(252 211 77/0.8)">${dailyHighScore.score.toLocaleString()}</strong>` } }
						)}
					</p>
				{/if}
				</div>
				<span class="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-400 transition-colors group-hover:bg-amber-400/20">
					{$_('dailyChallenge.play')}
				</span>
			</button>
		{/if}

		<!-- Game Parameters Container -->
		<div
			class="mx-auto mt-8 max-w-2xl rounded-2xl border-2 border-cyan-400/30 bg-slate-900/50 p-6 backdrop-blur-sm"
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
									{tracklistDisplayName($selectedTracklist, $_)}
								</span>
								<ChevronRight class="h-4 w-4" />
							</button>
						</div>
						<p class="text-sm text-slate-500">
						{tracklistDescription($selectedTracklist, $_)}
						</p>
					</div>

					<!-- Number of Tracks (not shown for Bingo and Timeline mode) -->
					{#if selectedMode !== 'bingo' && selectedMode !== 'timeline'}
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

					<!-- Timeline-only: Cards to Win -->
					{#if selectedMode === 'timeline'}
						<div class="flex items-center justify-between">
							<span class="text-sm font-semibold text-slate-400">{$_('settings.cardsToWin')}</span>
							<NumberSelector
								value={localSettings.timelineCardsToWin}
								options={[6, 10, 15]}
								onChange={handleTimelineCardsToWinChange}
							/>
						</div>

						<!-- Inline Leaderboard -->
						<div class="mt-1">
							<div class="mb-2 flex text-sm font-semibold text-slate-400">
								{$_('leaderboard.title')}
							</div>
							{#if leaderboardEntries.length === 0}
								<p class="py-2 text-xs text-slate-500">{$_('leaderboard.noScores')}</p>
{:else}
								<div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-[clamp(0.375rem,1.5vw,1.5rem)] gap-y-1 text-xs text-left">
							{#each leaderboardEntries.slice(0, 5) as entry, i (i)}
								{@const flagUrl = countryFlagUrl(entry.country)}
								<span class="text-center font-bold mr-2" class:text-cyan-400={entry.is_me} class:text-slate-500={!entry.is_me}>{i + 1}</span>
								<span class="truncate" class:text-cyan-300={entry.is_me && entry.player_name} class:text-slate-300={!entry.is_me && entry.player_name} class:text-slate-500={!entry.player_name}>{#if flagUrl}<img src={flagUrl} alt="" title={countryName(entry.country, currentLocale)} class="mr-0.5 inline-block h-2.5 w-3.75 rounded-xs border-[0.5px] border-slate-600 align-baseline select-none" class:opacity-50={!entry.player_name} draggable="false" oncontextmenu={(e) => e.preventDefault()} />{/if} {entry.player_name ?? $_('leaderboard.anonymous')}</span>
								<span class="whitespace-nowrap text-right font-bold tabular-nums" class:text-cyan-400={entry.is_me}>{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}</span>
								<span class="whitespace-nowrap text-right tabular-nums text-slate-500">{formatEntryDate(entry.timestamp, currentLocale)}</span>
								<div class="flex">
									{#if entry.timeline && entry.timeline !== '[]'}
										<button
											type="button"
											onclick={() => handleShowTimeline(entry)}
											class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
										>
											<SquareStack class="h-3.5 w-3.5" />
										</button>
									{/if}
								</div>
							{/each}
								</div>
								{#if showExpandedLeaderboard && leaderboardEntries.length > 5}
									<div transition:slide={{ duration: 200 }}>
										<div class="grid grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-x-[clamp(0.375rem,1.5vw,1.5rem)] gap-y-1 text-xs text-left mt-1">
										{#each leaderboardEntries.slice(5) as entry, i (i)}
											{@const flagUrl = countryFlagUrl(entry.country)}
											<span class="text-center font-bold mr-2" class:text-cyan-400={entry.is_me} class:text-slate-500={!entry.is_me}>{i + 6}</span>
											<span class="truncate" class:text-cyan-300={entry.is_me && entry.player_name} class:text-slate-300={!entry.is_me && entry.player_name} class:text-slate-500={!entry.player_name}>{#if flagUrl}<img src={flagUrl} alt="" title={countryName(entry.country, currentLocale)} class="mr-0.5 inline-block h-2.5 w-3.75 rounded-xs border-[0.5px] border-slate-600 align-baseline select-none" class:opacity-50={!entry.player_name} draggable="false" oncontextmenu={(e) => e.preventDefault()} />{/if} {entry.player_name ?? $_('leaderboard.anonymous')}</span>
											<span class="text-right">
												{#if entry.timeline && entry.timeline !== '[]'}
													<button
														type="button"
														onclick={() => handleShowTimeline(entry)}
														class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
													>
														<Scroll class="h-3.5 w-3.5" />
													</button>
												{/if}
											</span>
											<span class="whitespace-nowrap text-right font-bold tabular-nums" class:text-cyan-400={entry.is_me}>{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}</span>
											<span class="whitespace-nowrap text-right tabular-nums text-slate-500">{formatEntryDate(entry.timestamp, currentLocale)}</span>
										{/each}
										</div>
									</div>
								{/if}
								{#if !showExpandedLeaderboard && leaderboardEntries.length > 5}
									<button
										type="button"
										onclick={() => (showExpandedLeaderboard = true)}
										class="mx-auto mt-1 flex cursor-pointer items-center justify-center rounded-md px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-400"
									>
										<ChevronDown class="h-4 w-4" />
									</button>
								{/if}
							{/if}
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
								{#if selectedMode !== 'timeline'}
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
								{/if}
								{#if currentPlayers.length < 10}
									<button
										type="button"
										onclick={() => playerSetupRef?.addPlayer()}
										disabled={!enableScoring && selectedMode !== 'timeline'}
										class:opacity-40={!enableScoring && selectedMode !== 'timeline'}
										class:pointer-events-none={!enableScoring && selectedMode !== 'timeline'}
										class="rounded-lg border-2 border-cyan-400/30 bg-slate-900 px-3 py-1.5 text-sm font-semibold text-cyan-400 transition-all duration-200 hover:border-cyan-400 hover:bg-slate-800"
									>
										<Plus class="inline h-4 w-4" />
										{$_('players.addPlayer')}
									</button>
								{/if}
							</div>
						</div>
						<!-- Player Setup -->
						<div
							class:opacity-40={!enableScoring && selectedMode !== 'timeline'}
							class:pointer-events-none={!enableScoring && selectedMode !== 'timeline'}
						>
							<PlayerSetup
								mode={selectedMode}
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
					disabled={!playersValid}
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
			</div>
		{/if}

		<!-- Footer -->
		<div class="mt-16 mb-6">
			<AppFooter />
			<!-- Player count + build date: in-flow on mobile, fixed corners on desktop -->
			<div class="mt-3 flex items-center justify-end md:contents">
				{#if pageviews24h != null}
					<div class="md:fixed md:left-3 md:bottom-3 md:z-40">
						<div
							class="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-slate-900/60 px-2 py-1 text-cyan-400/70 backdrop-blur-md"
						>
							<Users class="h-3.5 w-3.5" />
							<span class="text-xs font-medium">{pageviews24h.toLocaleString()}</span>
						</div>
					</div>
				{/if}
				<div class="ml-auto text-[10px] text-slate-600 select-none md:fixed md:right-2 md:bottom-1 md:ml-0">
					v{__BUILD_DATE__}
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Feedback FAB (Bottom Right) -->
<div class="fixed right-6 bottom-6 z-40 hidden md:block">
	<div class="flex flex-col gap-3">
		<button
			type="button"
			onclick={() => (showFeedbackPopup = true)}
			class="group flex h-14 w-14 items-center justify-center rounded-full border-2 border-cyan-400/30 bg-slate-900/80 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)] backdrop-blur-md transition-all hover:scale-110 hover:border-cyan-400 hover:bg-slate-800 hover:shadow-[0_0_30px_rgba(34,211,238,0.4)] active:scale-95"
			title={$_('feedback.title')}
		>
			<MessageSquare class="h-6 w-6" />
		</button>
	</div>
</div>

<FeedbackPopup visible={showFeedbackPopup} onClose={() => (showFeedbackPopup = false)} />

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

<TimelinePopup
	visible={showTimelinePopup}
	playerName={timelinePlayerName}
	score={timelineScore}
	timestamp={timelineTimestamp}
	tracks={timelineTracks}
	onClose={() => (showTimelinePopup = false)}
/>

<style>
</style>
