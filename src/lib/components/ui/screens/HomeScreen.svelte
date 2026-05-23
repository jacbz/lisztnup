<script lang="ts">
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import Languages from 'lucide-svelte/icons/languages';
	import { _, locale } from 'svelte-i18n';
	import {
		settings as settingsStore,
		selectedTracklist,
		isDataLoaded,
		dataLoadProgress,
		loadGameData
	} from '$lib/stores';
	import { locales } from '$lib/i18n';
	import TracklistSelector from '../setup/TracklistSelector.svelte';
	import NumberSelector from '../primitives/NumberSelector.svelte';
	import ToggleButton from '../primitives/ToggleButton.svelte';
	import LoadingProgress from '../primitives/LoadingProgress.svelte';
	import ModeSelector from '../setup/ModeSelector.svelte';
	import PlayerSetup from '../setup/PlayerSetup.svelte';
	import BingoSetup from '../setup/BingoSetup.svelte';
	import ShareLinkPopup from '../setup/ShareLinkPopup.svelte';
	import type {
		Tracklist,
		GameMode,
		Player,
		LeaderboardCountrySummary,
		LeaderboardEntry,
		LeaderboardPeriod,
		LeaderboardRankedScope,
		LeaderboardScope,
		TimelineReplayLog,
		TimelineReplayTurn
	} from '$lib/types';
	import { TIMELINE_TARGET_OPTIONS } from '$lib/types';
	import {
		DEFAULT_TRACKLISTS,
		tracklistDisplayName,
		tracklistDescription
	} from '$lib/data/defaultTracklists';
	import Plus from 'lucide-svelte/icons/plus';
	import AppFooter from '../primitives/AppFooter.svelte';
	import FeedbackPopup from '../gameplay/FeedbackPopup.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Users from 'lucide-svelte/icons/users';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Cake from 'lucide-svelte/icons/cake';
	import Flag from 'lucide-svelte/icons/flag';
	import Venus from 'lucide-svelte/icons/venus';
	import { getPlayerToken } from '$lib/stores/identity';
	import { getDailyChallengeEntry } from '$lib/utils/dailyChallenge';
	import { SettingsService } from '$lib/services';
	import { gameData } from '$lib/stores/gameData';
	import { get } from 'svelte/store';
	import type { Track } from '$lib/models';
	import { getGermanDateString, getMsUntilNextGermanMidnight } from '$lib/utils/date';
	import TimelinePopup from '$lib/components/game/timeline/TimelinePopup.svelte';
	import TracklistRecordsPopup from '$lib/components/ui/setup/TracklistRecordsPopup.svelte';
	import TimelineLeaderboard from '$lib/components/ui/setup/TimelineLeaderboard.svelte';
	import { fade, slide } from 'svelte/transition';
	import { getLeaderboard, preloadAsset } from '$lib/services/client';

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
	let leaderboardLoading = $state(false);
	let leaderboardScope = $state<LeaderboardScope>('global');
	let leaderboardRankedScope = $state<LeaderboardRankedScope>('global');
	let leaderboardPreferredPeriod = $state<LeaderboardPeriod>('weekly');
	let leaderboardPeriod = $state<LeaderboardPeriod>('weekly');
	let leaderboardCountry = $state<string | null>(null);
	let leaderboardViewerCountry = $state<string | null>(null);
	let leaderboardCountries = $state<LeaderboardCountrySummary[]>([]);
	let showTracklistRecords = $state(false);
	let tracklistRecordsEntries = $state<LeaderboardEntry[]>([]);
	let tracklistRecordsLoading = $state(false);
	let tracklistRecordsRequestId = 0;
	let leaderboardRequestId = 0;
	let leaderboardFilterKey = '';
	let leaderboardTimelineConfigKey = '';
	let showTimelinePopup = $state(false);
	let timelineTracks = $state<Track[]>([]);
	let timelineLog = $state<TimelineReplayLog | null>(null);
	let timelinePlayerName = $state('');
	let timelineCountry = $state<string | undefined>();
	let timelineScore = $state(0);
	let timelineAttempts = $state(0);
	let timelineAverageTime = $state<number | null>(null);
	let timelineLongestStreak = $state<number | null>(null);
	let timelineTimestamp = $state<string | undefined>();
	let playerSetupRef: { addPlayer: () => void } | undefined = $state();
	let startAudio: HTMLAudioElement | null = null;
	let germanTodayDate = $state(getGermanDateString());
	let dailyChallengeEntry = $state(getDailyChallengeEntry());
	let customTracklists = $state<Tracklist[]>([]);
	let allTracklists = $derived([...DEFAULT_TRACKLISTS, ...customTracklists]);
	let dailyChallengeTimer: ReturnType<typeof setTimeout> | null = null;
	let dailyChallengeCountdownTimer: ReturnType<typeof setInterval> | null = null;
	let dailyChallengeCountdown = $state('');
	let loadingCardTimer: ReturnType<typeof setTimeout> | null = null;
	let showDataLoadingCard = $state(false);
	let dataLoadFailed = $state(false);
	let previousSelectedTracklist = $settingsStore.selectedTracklist;
	let startAudioSources = {
		classic: '/start_classic.mp3',
		buzzer: '/start_buzzer.mp3',
		timeline: '/start_timeline.mp3',
		bingo: '/start_bingo.mp3'
	};
	const GAME_SOUND_FILES = [
		'/correct.mp3',
		'/wrong.mp3',
		'/buzzer.mp3',
		'/start_timeline.mp3',
		'/start_classic.mp3',
		'/start_buzzer.mp3',
		'/start_bingo.mp3',
		'/gameover.mp3'
	];

	// Daily challenge state
	let dailyHighScore = $state<{ name: string | null; score: number } | null>(null);
	let showDailyChallenge = $derived(
		selectedMode === 'timeline' &&
			(localSettings.gamesPlayed ?? 0) > 0 &&
			localSettings.dailyChallengePlayedDate !== germanTodayDate
	);
	let showTimelineLeaderboard = $derived(
		selectedMode === 'timeline' && $selectedTracklist.kind !== 'custom'
	);
	let DailyChallengeIcon = $derived.by(() => {
		if (dailyChallengeEntry.cause === 'birthday') return Cake;
		if (dailyChallengeEntry.cause === 'nationalDay') return Flag;
		if (dailyChallengeEntry.cause === 'womensDay') return Venus;
		return Sparkles;
	});

	let dailyChallengeSubtitle = $derived.by(() => {
		if (dailyChallengeEntry.cause === 'womensDay') {
			return $_('dailyChallenge.subtitleWomensDay');
		}

		if (dailyChallengeEntry.cause === 'birthday') {
			return $_('dailyChallenge.subtitleBirthday');
		}

		if (dailyChallengeEntry.cause === 'nationalDay') {
			return $_('dailyChallenge.subtitleNationalDay');
		}

		return $_('dailyChallenge.subtitle');
	});

	function formatCountdown(ms: number): string {
		const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;
		return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
	}

	function syncDailyChallenge() {
		germanTodayDate = getGermanDateString();
		dailyChallengeEntry = getDailyChallengeEntry();
		dailyChallengeCountdown = formatCountdown(getMsUntilNextGermanMidnight());
	}

	// Update local settings when store changes
	$effect(() => {
		const nextSettings = { ...$settingsStore };
		const tracklistChanged = nextSettings.selectedTracklist !== previousSelectedTracklist;
		localSettings = nextSettings;
		if (tracklistChanged) {
			resetTimelinePopup();
			previousSelectedTracklist = nextSettings.selectedTracklist;
		}
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
		if (showTimelineLeaderboard && browser) {
			const tracklist = localSettings.selectedTracklist;
			const target = localSettings.timelineTarget;
			const timelineConfigKey = `${tracklist}:${target}`;
			const requestedPeriod =
				leaderboardScope === 'personal' ? 'allTime' : leaderboardPreferredPeriod;
			const filterKey = `${timelineConfigKey}:${leaderboardScope}:${requestedPeriod}:${leaderboardCountry ?? ''}`;
			const requestId = ++leaderboardRequestId;

			leaderboardLoading = true;
			if (filterKey !== leaderboardFilterKey) {
				resetTimelinePopup();
				// Do not clear leaderboardEntries here to allow smooth visual updates
				leaderboardFilterKey = filterKey;
			}
			if (timelineConfigKey !== leaderboardTimelineConfigKey) {
				leaderboardTimelineConfigKey = timelineConfigKey;
				if (leaderboardScope !== 'personal') {
					leaderboardPeriod = leaderboardPreferredPeriod;
				}
			}

			getLeaderboard({
				limit: 25,
				tracklist,
				target,
				token: getPlayerToken(),
				scope: leaderboardScope,
				period: leaderboardScope === 'personal' ? undefined : leaderboardPreferredPeriod,
				country: leaderboardScope === 'national' ? leaderboardCountry : null
			})
				.then((data) => {
					if (requestId !== leaderboardRequestId) return;
					const nextViewerCountry = data.viewerCountry ?? null;
					if (nextViewerCountry && nextViewerCountry !== 'UNKNOWN') {
						leaderboardViewerCountry = nextViewerCountry;
						if (leaderboardScope === 'national' && !leaderboardCountry) {
							leaderboardCountry = nextViewerCountry;
						}
					}
					if (leaderboardScope !== 'personal') {
						leaderboardPeriod = data.period;
					}
					leaderboardEntries = data.entries ?? [];
					leaderboardCountries = data.countries ?? [];
				})
				.catch(() => {
					if (requestId !== leaderboardRequestId) return;
					leaderboardEntries = [];
					leaderboardCountries = [];
				})
				.finally(() => {
					if (requestId !== leaderboardRequestId) return;
					leaderboardLoading = false;
				});
		} else {
			leaderboardRequestId += 1;
			leaderboardFilterKey = '';
			leaderboardTimelineConfigKey = '';
			leaderboardEntries = [];
			leaderboardCountries = [];
			leaderboardLoading = false;
		}
	});

	// Fetch the #1 score for the daily challenge tracklist
	$effect(() => {
		if (showDailyChallenge && browser) {
			const target = localSettings.timelineTarget;
			getLeaderboard({
				limit: 1,
				tracklist: dailyChallengeEntry.tracklist.id,
				target,
				token: getPlayerToken(),
				period: 'weekly'
			})
				.then((data) => {
					const top = data.entries?.[0];
					dailyHighScore = top ? { name: top.player_name, score: top.score } : null;
				})
				.catch(() => {
					dailyHighScore = null;
				});
		}
	});

	$effect(() => {
		if (!showTracklistRecords || !browser) return;
		const requestId = ++tracklistRecordsRequestId;
		customTracklists = SettingsService.loadCustomTracklists();
		tracklistRecordsLoading = true;

		getLeaderboard({
			limit: 50,
			records: true,
			token: getPlayerToken()
		})
			.then((data) => {
				if (requestId !== tracklistRecordsRequestId) return;
				tracklistRecordsEntries = data.entries ?? [];
			})
			.catch(() => {
				if (requestId !== tracklistRecordsRequestId) return;
				tracklistRecordsEntries = [];
			})
			.finally(() => {
				if (requestId !== tracklistRecordsRequestId) return;
				tracklistRecordsLoading = false;
			});
	});

	function handleTracklistSelect(tracklist: Tracklist) {
		localSettings.selectedTracklist = tracklist.id;
		settingsStore.update((s) => ({ ...s, selectedTracklist: tracklist.id }));
	}

	function handleTracklistRecordSelect(tracklist: Tracklist, target: number) {
		localSettings.selectedTracklist = tracklist.id;
		localSettings.timelineTarget = target;
		settingsStore.update((s) => ({
			...s,
			selectedTracklist: tracklist.id,
			timelineTarget: target
		}));
		showTracklistRecords = false;
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

	function handleTimelineTargetChange(value: number) {
		localSettings.timelineTarget = value;
		settingsStore.update((s) => ({ ...s, timelineTarget: value }));
	}

	function handleLeaderboardScopeChange(scope: LeaderboardScope) {
		if (scope === 'personal' && leaderboardScope === 'personal') {
			leaderboardScope = leaderboardRankedScope;
			return;
		}
		if (scope === 'national' && leaderboardScope !== 'national' && !leaderboardCountry) {
			leaderboardCountry = leaderboardViewerCountry;
		}
		leaderboardScope = scope;
		if (scope !== 'personal') {
			leaderboardRankedScope = scope;
		}
	}

	function handleLeaderboardCountryChange(country: string) {
		leaderboardCountry = country;
		leaderboardScope = 'national';
		leaderboardRankedScope = 'national';
	}

	function handleLeaderboardPeriodChange(period: LeaderboardPeriod) {
		leaderboardPreferredPeriod = period;
		leaderboardPeriod = period;
		if (leaderboardScope === 'personal') {
			leaderboardScope = leaderboardRankedScope;
		}
	}

	function handleStartGame() {
		if (!selectedMode) return;
		if (!$isDataLoaded) return;

		// Don't allow starting with invalid player names
		if (!playersValid) return;

		// Track games played (for new-user detection) and daily challenge completion
		settingsStore.update((s) => {
			const updates: Partial<typeof s> = { gamesPlayed: (s.gamesPlayed ?? 0) + 1 };
			if (
				selectedMode === 'timeline' &&
				localSettings.selectedTracklist === dailyChallengeEntry.tracklist.id
			) {
				updates.dailyChallengePlayedDate = germanTodayDate;
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

	function resetTimelinePopup() {
		showTimelinePopup = false;
		timelineTracks = [];
		timelineLog = null;
	}

	function isReplayTurn(turn: unknown): turn is TimelineReplayTurn {
		if (!turn || typeof turn !== 'object') return false;
		const candidate = turn as Partial<TimelineReplayTurn>;
		return (
			typeof candidate.part === 'string' &&
			(candidate.index === null || typeof candidate.index === 'number') &&
			typeof candidate.ok === 'boolean' &&
			(candidate.seconds === null || typeof candidate.seconds === 'number') &&
			typeof candidate.points === 'number' &&
			typeof candidate.streakMult === 'number'
		);
	}

	function parseTimelineReplayLog(value: string): TimelineReplayLog | null {
		const parsed = JSON.parse(value) as Partial<TimelineReplayLog> | null;
		if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.turns)) return null;
		if (typeof parsed.initial !== 'string' || parsed.initial.length === 0) return null;
		if (typeof parsed.initialYear !== 'number' || !Number.isFinite(parsed.initialYear)) return null;
		if (typeof parsed.tracklistMin !== 'number' || !Number.isFinite(parsed.tracklistMin))
			return null;
		if (typeof parsed.tracklistMax !== 'number' || !Number.isFinite(parsed.tracklistMax))
			return null;
		if (parsed.tracklistMin > parsed.tracklistMax) return null;
		const turns = parsed.turns.filter(isReplayTurn);
		if (turns.length === 0) return null;
		return {
			v: 1,
			initial: parsed.initial,
			initialYear: parsed.initialYear,
			tracklistMin: parsed.tracklistMin,
			tracklistMax: parsed.tracklistMax,
			score: typeof parsed.score === 'number' ? parsed.score : 0,
			completionBonus:
				typeof parsed.completionBonus === 'number' && Number.isFinite(parsed.completionBonus)
					? parsed.completionBonus
					: 0,
			turns
		};
	}

	function handleShowTimeline(entry: LeaderboardEntry) {
		if (!entry.log) return;
		try {
			const log = parseTimelineReplayLog(entry.log);
			const data = get(gameData);
			if (data && log) {
				const allPartGids = [...new Set([log.initial, ...log.turns.map((t) => t.part)])].filter(
					(gid): gid is string => typeof gid === 'string' && gid.length > 0
				);
				const resolvedTracks = data.resolveTimelineTracks(allPartGids);
				if (resolvedTracks.length === 0) return;
				timelineTracks = resolvedTracks;
				timelineLog = log;
				timelinePlayerName = entry.player_name || $_('leaderboard.anonymous');
				timelineCountry = entry.country ?? undefined;
				timelineScore = entry.score;
				timelineAttempts = entry.attempts;
				timelineAverageTime = entry.average_time ?? null;
				timelineLongestStreak = entry.longest_streak ?? null;
				timelineTimestamp = entry.timestamp;
				showTimelinePopup = true;
			}
		} catch (e) {
			console.error('Failed to parse timeline log', e);
		}
	}

	function handleAddPlayer() {
		// Trigger add player in PlayerSetup via binding
	}

	function preloadGameSounds() {
		void Promise.all(GAME_SOUND_FILES.map((url) => preloadAsset(url)));
	}

	onMount(() => {
		// Create start audio element with initial mode
		const initialMode = selectedMode || 'classic';
		startAudio = new Audio(startAudioSources[initialMode]);
		preloadGameSounds();
		let destroyed = false;

		loadingCardTimer = setTimeout(() => {
			if (!destroyed && !get(isDataLoaded)) {
				showDataLoadingCard = true;
			}
		}, 300);

		dataLoadFailed = false;
		let loadFailed = false;
		loadGameData()
			.catch((error) => {
				console.error('Failed to load game data:', error);
				loadFailed = true;
				if (!destroyed) {
					dataLoadFailed = true;
					showDataLoadingCard = true;
				}
			})
			.finally(() => {
				if (loadingCardTimer) {
					clearTimeout(loadingCardTimer);
					loadingCardTimer = null;
				}
				if (!destroyed && !loadFailed) {
					showDataLoadingCard = false;
				}
			});

		syncDailyChallenge();

		const scheduleGermanRefresh = () => {
			if (dailyChallengeTimer) {
				clearTimeout(dailyChallengeTimer);
				dailyChallengeTimer = null;
			}

			dailyChallengeTimer = setTimeout(() => {
				syncDailyChallenge();
				scheduleGermanRefresh();
			}, getMsUntilNextGermanMidnight());
		};

		dailyChallengeCountdownTimer = setInterval(() => {
			dailyChallengeCountdown = formatCountdown(getMsUntilNextGermanMidnight());
		}, 1000);
		scheduleGermanRefresh();

		// Close locale dropdown when clicking outside
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (!target.closest('[data-locale-dropdown]')) {
				showLocaleDropdown = false;
			}
		};
		document.addEventListener('click', handleClickOutside);
		return () => {
			destroyed = true;
			document.removeEventListener('click', handleClickOutside);
			if (dailyChallengeTimer) clearTimeout(dailyChallengeTimer);
			if (dailyChallengeCountdownTimer) clearInterval(dailyChallengeCountdownTimer);
			if (loadingCardTimer) clearTimeout(loadingCardTimer);
		};
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
			<div class="mt-8" transition:slide={{ duration: 220 }}>
				<button
					type="button"
					onclick={() => handleTracklistSelect(dailyChallengeEntry.tracklist)}
					class="group relative mx-auto flex w-full max-w-2xl cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-linear-to-r from-amber-950/30 via-amber-900/20 to-amber-950/30 px-5 py-4 pr-4 text-left shadow-[0_0_20px_rgba(251,191,36,0.15)] backdrop-blur-sm transition-all duration-300 hover:border-amber-400/70 hover:shadow-[0_0_30px_rgba(251,191,36,0.3)] active:scale-[0.98] sm:pr-12"
					in:fade={{ delay: 300, duration: 300 }}
				>
					<span
						class="pointer-events-none absolute top-2.5 -right-10 w-32 rotate-45 border-y border-amber-200/30 bg-amber-300/20 py-0.5 text-center text-sm font-black tracking-wide text-amber-100 tabular-nums shadow-[0_0_14px_rgba(251,191,36,0.2)]"
					>
						{dailyChallengeCountdown}
					</span>
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-400 transition-colors group-hover:bg-amber-400/25"
					>
						<DailyChallengeIcon class="h-5 w-5" />
					</div>
					<div class="flex min-w-0 flex-1 flex-col gap-0.5">
						<div class="flex flex-col md:flex-row md:items-center md:gap-2">
							<span class="text-sm font-bold text-amber-400">{$_('dailyChallenge.title')}</span>
							<span class="text-xs text-amber-400/60">{dailyChallengeSubtitle}</span>
						</div>
						<div class="mt-0.5 flex items-center gap-1.5">
							{#if dailyChallengeEntry.tracklist.icon}
								<div class="text-amber-300/70">{@html dailyChallengeEntry.tracklist.icon}</div>
							{/if}
							<span class="truncate font-semibold text-amber-200"
								>{tracklistDisplayName(dailyChallengeEntry.tracklist, $_)}</span
							>
						</div>
						{#if dailyHighScore}
							{@const rawName = dailyHighScore.name ?? $_('leaderboard.anonymous')}
							{@const escapeName = rawName
								.replace(/&/g, '&amp;')
								.replace(/</g, '&lt;')
								.replace(/>/g, '&gt;')}
							{@const nameStyle = dailyHighScore.name
								? 'font-weight:500;color:rgb(252 211 77/0.8)'
								: 'font-weight:400;color:rgb(148 163 184/0.8)'}
							<div transition:slide={{ duration: 180 }}>
								<p class="mt-0.5 text-xs text-amber-400/60" in:fade={{ delay: 180, duration: 160 }}>
									{@html $_('dailyChallenge.highScore', {
										values: {
											name: `<strong style="${nameStyle}">${escapeName}</strong>`,
											score: `<strong style="font-weight:700;color:rgb(252 211 77/0.8)">${dailyHighScore.score.toLocaleString()}</strong>`
										}
									})}
								</p>
							</div>
						{/if}
					</div>
					<span
						class="shrink-0 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-bold text-amber-400 transition-colors group-hover:bg-amber-400/20"
					>
						{$_('dailyChallenge.play')}
					</span>
				</button>
			</div>
		{/if}

		{#if showDataLoadingCard}
			<div
				class="mx-auto mt-6 max-w-2xl"
				in:slide={{ duration: 220 }}
				out:slide={{ duration: 180 }}
			>
				<div
					class="relative overflow-hidden rounded-xl border bg-slate-950/70 px-6 py-5 shadow-[0_18px_45px_rgba(15,23,42,0.35),0_0_28px_rgba(34,211,238,0.16)] backdrop-blur-md {dataLoadFailed
						? 'border-rose-300/45'
						: 'border-cyan-300/35'}"
				>
					<div
						class="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent to-transparent {dataLoadFailed
							? 'via-rose-200/70'
							: 'via-cyan-200/70'}"
					></div>
					<div
						class="pointer-events-none absolute inset-0 bg-linear-to-r from-cyan-400/10 via-fuchsia-300/10 to-amber-200/10"
					></div>
					<div class="relative">
						<LoadingProgress progress={$dataLoadProgress} error={dataLoadFailed} />
					</div>
				</div>
			</div>
		{/if}

		<!-- Game Parameters Container -->
		<div
			class="mx-auto max-w-2xl rounded-2xl border-2 border-cyan-400/30 bg-slate-900/50 p-6 backdrop-blur-sm"
			class:mt-6={showDataLoadingCard}
			class:mt-8={!showDataLoadingCard}
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
							<span class="text-sm font-semibold text-slate-400">{$_('settings.target')}</span>
							<NumberSelector
								value={localSettings.timelineTarget}
								options={TIMELINE_TARGET_OPTIONS}
								onChange={handleTimelineTargetChange}
							/>
						</div>

						{#if showTimelineLeaderboard}
							<!-- Inline Leaderboard -->
							<TimelineLeaderboard
								entries={leaderboardEntries}
								{currentLocale}
								scope={leaderboardScope}
								period={leaderboardPeriod}
								countries={leaderboardCountries}
								selectedCountry={leaderboardCountry}
								isLoading={leaderboardLoading}
								onScopeChange={handleLeaderboardScopeChange}
								onPeriodChange={handleLeaderboardPeriodChange}
								onCountryChange={handleLeaderboardCountryChange}
								onRecordsClick={() => (showTracklistRecords = true)}
								onShowTimeline={handleShowTimeline}
							/>
						{/if}
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
					disabled={!playersValid || !$isDataLoaded}
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
						{$_('home.startGame')}
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
					<div class="md:fixed md:bottom-3 md:left-3 md:z-40">
						<div
							class="flex items-center gap-1.5 rounded-full border border-cyan-400/20 bg-slate-900/60 px-2 py-1 text-cyan-400/70 backdrop-blur-md"
						>
							<Users class="h-3.5 w-3.5" />
							<span class="text-xs font-medium">{pageviews24h.toLocaleString()}</span>
						</div>
					</div>
				{/if}
				<div
					class="ml-auto text-[10px] text-slate-600 select-none md:fixed md:right-2 md:bottom-1 md:ml-0"
				>
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

<TracklistRecordsPopup
	visible={showTracklistRecords}
	entries={tracklistRecordsEntries}
	{currentLocale}
	isLoading={tracklistRecordsLoading}
	tracklists={allTracklists}
	onClose={() => (showTracklistRecords = false)}
	onShowTimeline={handleShowTimeline}
	onSelectRecord={handleTracklistRecordSelect}
/>

<TimelinePopup
	visible={showTimelinePopup}
	playerName={timelinePlayerName}
	country={timelineCountry}
	score={timelineScore}
	attempts={timelineAttempts}
	averageTime={timelineAverageTime}
	longestStreak={timelineLongestStreak}
	timestamp={timelineTimestamp}
	tracks={timelineTracks}
	log={timelineLog}
	onClose={() => (showTimelinePopup = false)}
/>

<style>
</style>
