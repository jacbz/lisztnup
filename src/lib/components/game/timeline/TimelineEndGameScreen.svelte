<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import type { Track } from '$lib/models';
	import type { Player } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatYearRange } from '$lib/utils';
	import Home from 'lucide-svelte/icons/home';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Flame from 'lucide-svelte/icons/flame';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import SquareStack from 'lucide-svelte/icons/square-stack';
	import FeedbackPopup from '$lib/components/ui/gameplay/FeedbackPopup.svelte';
	import { getPlayerToken } from '$lib/stores/identity';
	import PenLine from 'lucide-svelte/icons/pen-line';
	import UploadCloud from 'lucide-svelte/icons/upload-cloud';
	import Crown from 'lucide-svelte/icons/crown';
	import { onMount } from 'svelte';
	import { scale } from 'svelte/transition';
	import { getLeaderboard, patchLeaderboardName, submitLeaderboard } from '$lib/services/client';
	import type { TimelineReplayLog, TimelineReplayTurn } from '$lib/types';
	import { selectedTracklist, settings } from '$lib/stores/settings';
	import { Zap } from 'lucide-svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import TimelinePopup from './TimelinePopup.svelte';

	interface FinalTimeline {
		player: Player;
		entries: TimelineEntry[];
		totalPlacements: number;
		correctPlacements: number;
		currentStreak: number;
		longestStreak: number;
		score: number;
		reachedTarget: boolean;
		completionBonus: number;
		initialPartGid: string;
		replayTurns: TimelineReplayTurn[];
	}

	interface Props {
		visible?: boolean;
		target: number;
		timelines: FinalTimeline[];
		tracksExhausted?: boolean;
		tracklistId?: string | null;
		tracklistMin: number;
		tracklistMax: number;
		sessionId?: string | null;
		onHome?: () => void;
		onViewStats?: () => void;
	}

	let {
		visible = false,
		target,
		timelines,
		tracksExhausted = false,
		tracklistId = null,
		tracklistMin,
		tracklistMax,
		sessionId = null,
		onHome = () => {},
		onViewStats
	}: Props = $props();

	let inspectTrack = $state<Track | null>(null);

	// Winner: player with highest score (already includes completion bonus).
	const sortedTimelines = $derived([...timelines].sort((a, b) => b.score - a.score));

	const winner = $derived.by(() => {
		if (sortedTimelines.length === 0) return null;
		const top = sortedTimelines[0];
		if (top.score === 0) return null;
		// Check for tie
		if (sortedTimelines.length >= 2) {
			if (sortedTimelines[1].score === top.score) return null;
		}
		return top.player;
	});

	const isDraw = $derived(
		sortedTimelines.length >= 2 &&
			sortedTimelines[0].score > 0 &&
			sortedTimelines[0].score === sortedTimelines[1].score
	);
	const publishTracklistId = $derived(
		$selectedTracklist.kind === 'custom' ? 'custom' : tracklistId
	);

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});

	interface LeaderboardPlayer {
		name: string;
		color: string;
		score: number;
		target: number;
		accuracy: number;
		longestStreak: number;
		averageTime: number | null;
	}

	// Only players who completed their timeline can publish or claim their score.
	const leaderboardPlayers = $derived<LeaderboardPlayer[]>(
		sortedTimelines
			.filter((t) => t.score > 0 && t.reachedTarget)
			.map((t) => ({
				name: t.player.name,
				color: t.player.color,
				score: t.score,
				target: t.entries.length,
				accuracy: t.totalPlacements > 0 ? t.correctPlacements / t.totalPlacements : 0,
				longestStreak: t.longestStreak,
				averageTime: getAverageTime(t.replayTurns)
			}))
	);

	let showFeedbackPopup = $state(false);
	let showNamePopup = $state(false);
	let namePopupMode = $state<'publish' | 'rename'>('publish');
	let selectedLeaderboardPlayer = $state<LeaderboardPlayer | null>(null);
	let selectedLeaderboardIndex = $state<number | null>(null);
	let leaderboardNameInput = $state('');
	let leaderboardNameSubmitting = $state(false);
	let leaderboardNameError = $state(false);
	let showPublishPermission = $state(false);
	let showHomeConfirm = $state(false);
	let namedLeaderboardKeys = $state<string[]>([]);
	let publishedLeaderboardNames = $state<Record<number, string>>({});
	let permissionNames = $state<string[]>([]);
	let pendingPermissionPublishes = $state<Record<number, string>>({});
	let gameoverAudio: HTMLAudioElement | null = null;
	let gameoverPlayed = false;
	let isNewHighScore = $state(false);
	let autoSubmitted = $state(false);
	let entryIds = $state<(number | null)[]>([]);
	let permissionAskedForKey = $state('');
	let leaderboardPublishingFingerprint = $state<string | null>(null);
	const pendingPublishInFlight = new SvelteSet<number>();
	let showReplayPopup = $state(false);
	let replayTimeline = $state<FinalTimeline | null>(null);

	function getAverageTime(turns: TimelineReplayTurn[]): number | null {
		const times = turns
			.map((turn) => turn.seconds)
			.filter(
				(seconds): seconds is number => typeof seconds === 'number' && Number.isFinite(seconds)
			);
		if (times.length === 0) return null;
		return Math.round((times.reduce((sum, seconds) => sum + seconds, 0) / times.length) * 10) / 10;
	}

	function getTrackYear(track: Track): number | null {
		const year = track.work.end_year ?? track.work.begin_year;
		return typeof year === 'number' && Number.isFinite(year) ? year : null;
	}

	function getReplayLog(t: FinalTimeline): TimelineReplayLog {
		const initialEntry = t.entries.find((entry) => entry.track.part.gid === t.initialPartGid);
		if (!initialEntry) {
			throw new Error(
				`Timeline replay invariant violated: missing initial entry ${t.initialPartGid}.`
			);
		}
		const initialYear = getTrackYear(initialEntry.track);
		if (initialYear === null) {
			throw new Error(
				`Timeline replay invariant violated: initial entry ${t.initialPartGid} has no year.`
			);
		}

		const replayLog: TimelineReplayLog = {
			v: 1,
			initial: t.initialPartGid,
			initialYear,
			tracklistMin,
			tracklistMax,
			score: Math.round(t.score),
			completionBonus: Math.round(t.completionBonus),
			turns: t.replayTurns
		};

		return replayLog;
	}

	const completedPermissionNames = $derived(
		leaderboardPlayers.map((player) => player.name.trim()).filter((name) => name.length > 0)
	);

	const unknownPermissionNames = $derived.by(() => {
		const publishing = $settings.leaderboardPublishing ?? { allowedNames: [], deniedNames: [] };
		return completedPermissionNames.filter((name) => {
			const key = normalizeName(name);
			return (
				!publishing.allowedNames.some((allowed) => normalizeName(allowed) === key) &&
				!publishing.deniedNames.some((denied) => normalizeName(denied) === key)
			);
		});
	});

	const unknownPermissionPlayers = $derived.by(() =>
		leaderboardPlayers.filter((player) =>
			unknownPermissionNames.some((name) => normalizeName(name) === normalizeName(player.name))
		)
	);

	function normalizeName(name: string): string {
		return name.trim().toLocaleLowerCase();
	}

	function isDefaultName(name: string): boolean {
		for (let i = 1; i <= 10; i++) {
			if (name === $_('players.playerName', { values: { number: i } })) return true;
		}
		return false;
	}

	function hasAllowedName(name: string): boolean {
		const publishing = $settings.leaderboardPublishing ?? { allowedNames: [], deniedNames: [] };
		const key = normalizeName(name);
		return publishing.allowedNames.some((allowed) => normalizeName(allowed) === key);
	}

	function updatePublishingNames(names: string[], decision: 'allow' | 'deny'): void {
		const cleanNames = names.map((name) => name.trim()).filter((name) => name.length > 0);
		if (cleanNames.length === 0) return;

		settings.update((s) => {
			const publishing = s.leaderboardPublishing ?? { allowedNames: [], deniedNames: [] };
			const cleanKeys = cleanNames.map(normalizeName);
			const allowedNames = publishing.allowedNames.filter(
				(name) => decision === 'allow' || !cleanKeys.includes(normalizeName(name))
			);
			const deniedNames = publishing.deniedNames.filter(
				(name) => decision === 'deny' || !cleanKeys.includes(normalizeName(name))
			);

			for (const name of cleanNames) {
				const key = normalizeName(name);
				const target = decision === 'allow' ? allowedNames : deniedNames;
				if (!target.some((existing) => normalizeName(existing) === key)) {
					target.push(name);
				}
			}

			return {
				...s,
				leaderboardPublishing: { allowedNames, deniedNames }
			};
		});
	}

	function savePlayerName(color: string, name: string): void {
		settings.update((s) => ({
			...s,
			players: s.players.map((player) => (player.color === color ? { ...player, name } : player))
		}));
	}

	async function waitForLeaderboardEntryId(index: number, maxMs = 20_000): Promise<number> {
		const deadline = Date.now() + maxMs;
		while (Date.now() < deadline) {
			const id = entryIds[index];
			if (id != null) return id;
			await new Promise((r) => setTimeout(r, 50));
		}
		throw new Error('Leaderboard entry not ready');
	}

	function markNamed(index: number | null, name: string, entryId: number | null): void {
		if (index == null) return;
		const key = `${index}:${normalizeName(name)}:${entryId ?? 'pending'}`;
		if (!namedLeaderboardKeys.includes(key)) {
			namedLeaderboardKeys = [...namedLeaderboardKeys, key];
		}
		publishedLeaderboardNames = { ...publishedLeaderboardNames, [index]: name };
	}

	function wasNamed(index: number, name: string, entryId: number | null): boolean {
		const key = `${index}:${normalizeName(name)}:${entryId ?? 'pending'}`;
		return namedLeaderboardKeys.includes(key);
	}

	function isNamedInCurrentRound(index: number): boolean {
		return namedLeaderboardKeys.some((key) => key.startsWith(`${index}:`));
	}

	function getPublishedLeaderboardName(index: number, fallback: string): string {
		return publishedLeaderboardNames[index] ?? fallback;
	}

	function getLeaderboardIndex(timeline: FinalTimeline): number {
		return leaderboardPlayers.findIndex(
			(player) => player.name === timeline.player.name && player.color === timeline.player.color
		);
	}

	function openLeaderboardNameDialog(
		player: LeaderboardPlayer,
		index: number,
		mode: 'publish' | 'rename'
	): void {
		selectedLeaderboardPlayer = player;
		selectedLeaderboardIndex = index;
		namePopupMode = mode;
		const displayName = getPublishedLeaderboardName(index, player.name);
		leaderboardNameInput = isDefaultName(displayName) ? '' : displayName;
		leaderboardNameError = false;
		showNamePopup = true;
	}

	function canSubmitLeaderboardName(): boolean {
		const name = leaderboardNameInput.trim();
		return name.length > 0 && !isDefaultName(name) && !leaderboardNameSubmitting;
	}

	async function submitLeaderboardName(): Promise<void> {
		if (
			!selectedLeaderboardPlayer ||
			selectedLeaderboardIndex == null ||
			!canSubmitLeaderboardName()
		) {
			return;
		}
		const finalName = leaderboardNameInput.trim();
		leaderboardNameSubmitting = true;
		leaderboardNameError = false;
		try {
			savePlayerName(selectedLeaderboardPlayer.color, finalName);
			updatePublishingNames([finalName], 'allow');
			if (normalizeName(finalName) !== normalizeName(selectedLeaderboardPlayer.name)) {
				updatePublishingNames([selectedLeaderboardPlayer.name], 'deny');
			}
			await waitForLeaderboardEntryId(selectedLeaderboardIndex);
			await publishPlayerAs(selectedLeaderboardPlayer, selectedLeaderboardIndex, finalName);
			showNamePopup = false;
		} catch {
			leaderboardNameError = true;
		} finally {
			leaderboardNameSubmitting = false;
		}
	}

	async function publishPlayerAs(
		player: LeaderboardPlayer,
		index: number,
		playerName: string
	): Promise<void> {
		const entryId = entryIds[index];
		if (entryId == null) {
			throw new Error('Leaderboard entry not ready');
		}
		if (wasNamed(index, playerName, entryId)) return;
		await patchLeaderboardName({
			id: entryId,
			playerToken: getPlayerToken(),
			playerName
		});
		markNamed(index, playerName, entryId);
	}

	async function publishAllowedPlayer(player: LeaderboardPlayer, index: number): Promise<void> {
		try {
			await publishPlayerAs(player, index, player.name);
		} catch {
			// Publishing is a convenience path; the explicit button remains available.
		}
	}

	function canAcceptPublishPermission(): boolean {
		return permissionNames.every((name) => {
			const trimmed = name.trim();
			return trimmed.length > 0 && !isDefaultName(trimmed);
		});
	}

	function acceptPublishPermission(): void {
		if (!canAcceptPublishPermission()) return;

		// Capture reactive values before any settings updates that would cause them to recompute
		const playersToPublish = [...unknownPermissionPlayers];
		const finalNames = permissionNames.map((name) => name.trim());

		// Update publishing permissions
		updatePublishingNames(finalNames, 'allow');

		// Only deny old names if they're different from the new names AND are default names
		const oldNamesToDeny = playersToPublish
			.map((player) => player.name)
			.filter(
				(name, i) => normalizeName(name) !== normalizeName(finalNames[i]) && isDefaultName(name)
			);
		if (oldNamesToDeny.length > 0) {
			updatePublishingNames(oldNamesToDeny, 'deny');
		}

		// Build pending publishes using captured player list
		pendingPermissionPublishes = {
			...pendingPermissionPublishes,
			...Object.fromEntries(
				playersToPublish
					.map((player, i) => {
						const index = leaderboardPlayers.findIndex(
							(candidate) => candidate.name === player.name && candidate.color === player.color
						);
						return index >= 0 ? ([index, finalNames[i]] as const) : null;
					})
					.filter((entry): entry is readonly [number, string] => entry !== null)
			)
		};

		// Update player names in settings
		for (const [index, player] of playersToPublish.entries()) {
			savePlayerName(player.color, finalNames[index]);
		}

		showPublishPermission = false;
		// PATCH runs only after each POST returns an id (pendingPermissionPublishes $effect) so we
		// never send parallel token-wide anonymous PATCHes before rows exist.
	}

	function denyPublishPermission(): void {
		updatePublishingNames(unknownPermissionNames, 'deny');
		permissionNames = [];
		showPublishPermission = false;
	}

	function handleHomeClick() {
		if (
			isNewHighScore &&
			leaderboardPlayers.length > 0 &&
			!leaderboardPlayers.some((p) => hasAllowedName(p.name))
		) {
			showHomeConfirm = true;
		} else {
			onHome();
		}
	}

	function openReplayPopup(timeline: FinalTimeline) {
		replayTimeline = timeline;
		showReplayPopup = true;
	}

	$effect(() => {
		if (visible && gameoverAudio && !gameoverPlayed) {
			gameoverPlayed = true;
			setTimeout(() => {
				if (gameoverAudio) {
					gameoverAudio.currentTime = 0;
					gameoverAudio.play().catch((err) => console.warn('Failed to play gameover sound:', err));
				}
			}, 300);
		}
	});

	// Fetch leaderboard + auto-submit completed timelines
	$effect(() => {
		if (!visible || sortedTimelines.length === 0) return;

		getLeaderboard({
			tracklist: tracklistId,
			target,
			limit: 50,
			token: getPlayerToken()
		})
			.then((data: { entries?: { player_name: string | null; score: number }[] }) => {
				const entries = data.entries ?? [];
				// New global high score?
				const topScore = Math.round(sortedTimelines[0].score);
				if (topScore > 0 && (entries.length === 0 || topScore > entries[0].score)) {
					isNewHighScore = true;
				}
			})
			.catch(() => {}); // silent

		// Auto-submit only players who finished their timeline.
		if (!autoSubmitted && leaderboardPlayers.length > 0) {
			autoSubmitted = true;
			const token = getPlayerToken();
			const occurredAt = new Date().toISOString();
			Promise.all(
				sortedTimelines
					.filter((t) => t.score > 0 && t.reachedTarget)
					.map((t) => {
						return submitLeaderboard(
							{
								playerToken: token,
								playerName: null,
								score: Math.round(t.score),
								target: t.entries.length,
								attempts: t.totalPlacements,
								averageTime: getAverageTime(t.replayTurns),
								longestStreak: t.longestStreak,
								tracklistId: publishTracklistId,
								sessionId,
								log: getReplayLog(t)
							},
							{ queueOnTransient: true, occurredAt }
						)
							.then((data) => data?.id ?? null)
							.catch(() => null);
					})
			).then((ids) => {
				entryIds = ids;
			});
		}
	});

	$effect(() => {
		if (!visible || leaderboardPlayers.length === 0 || unknownPermissionNames.length === 0) return;
		const key = unknownPermissionNames.map(normalizeName).sort().join('|');
		if (key === permissionAskedForKey) return;
		permissionNames = unknownPermissionPlayers.map((player) =>
			isDefaultName(player.name) ? '' : player.name
		);
		const timer = setTimeout(() => {
			permissionAskedForKey = key;
			showPublishPermission = true;
		}, 900);
		return () => clearTimeout(timer);
	});

	$effect(() => {
		if (visible) return;
		showPublishPermission = false;
		showNamePopup = false;
		permissionAskedForKey = '';
		pendingPermissionPublishes = {};
		pendingPublishInFlight.clear();
	});

	$effect(() => {
		const pub = $settings.leaderboardPublishing ?? { allowedNames: [], deniedNames: [] };
		const fp = JSON.stringify({
			a: [...pub.allowedNames.map((n) => normalizeName(n))].sort(),
			d: [...pub.deniedNames.map((n) => normalizeName(n))].sort()
		});
		if (leaderboardPublishingFingerprint !== null && fp !== leaderboardPublishingFingerprint) {
			permissionAskedForKey = '';
		}
		leaderboardPublishingFingerprint = fp;
	});

	$effect(() => {
		if (!visible || leaderboardPlayers.length === 0) return;
		for (let i = 0; i < leaderboardPlayers.length; i++) {
			const player = leaderboardPlayers[i];
			if (entryIds[i] == null) continue;
			if (hasAllowedName(player.name) && !isDefaultName(player.name)) {
				void publishAllowedPlayer(player, i);
			}
		}
	});

	$effect(() => {
		if (!visible) return;
		for (const [rawIndex, playerName] of Object.entries(pendingPermissionPublishes)) {
			const index = Number(rawIndex);
			const player = leaderboardPlayers[index];
			const entryId = entryIds[index];
			if (!player || entryId == null || wasNamed(index, playerName, entryId)) continue;
			if (pendingPublishInFlight.has(index)) continue;
			pendingPublishInFlight.add(index);
			void publishPlayerAs(player, index, playerName)
				.then(() => {
					const remaining = { ...pendingPermissionPublishes };
					delete remaining[index];
					pendingPermissionPublishes = remaining;
				})
				.catch(() => {
					/* keep pending; user can retry via per-player Publish */
				})
				.finally(() => {
					pendingPublishInFlight.delete(index);
				});
		}
	});

	onMount(() => {
		gameoverAudio = new Audio('/gameover.mp3');
		return () => {
			if (gameoverAudio) {
				gameoverAudio.pause();
				gameoverAudio.src = '';
			}
		};
	});
</script>

<Popup {visible} onClose={() => {}} width="5xl" showCloseButton={false}>
	<div class="flex flex-col gap-6">
		<div class="text-center">
			<h2 class="text-4xl font-bold text-cyan-400">{$_('endGame.title')}</h2>
			{#if tracksExhausted}
				<p class="mt-1 text-sm text-slate-400">{$_('endGame.noMoreTracks')}</p>
			{/if}
			{#if winner}
				<p class="mt-2 text-lg text-slate-300">
					{$_('endGame.winner', { values: { name: winner.name } })}
				</p>
			{:else if isDraw}
				<p class="mt-2 text-lg text-slate-300">
					{$_('endGame.tie')}
				</p>
			{/if}
		</div>

		{#if isNewHighScore}
			<div
				class="flex flex-col items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-2"
				in:scale={{ duration: 200, start: 0.9 }}
			>
				<div class="flex items-center gap-2">
					<Crown class="h-5 w-5 text-amber-400" />
					<span class="text-sm font-bold text-amber-400">{$_('leaderboard.newHighScore')}</span>
					<Crown class="h-5 w-5 text-amber-400" />
				</div>
				<span class="text-xs text-amber-400/70">{$_('leaderboard.newHighScoreSubtitle')}</span>
			</div>
		{/if}

		<div class="-my-4 max-h-[50vh] space-y-4 overflow-y-auto px-2 py-8">
			{#each sortedTimelines as t, index (t.player.name)}
				{@const totalScore = Math.round(t.score)}
				{@const isWinner = index === 0 && totalScore > 0}
				<div
					class="rounded-2xl border px-4 py-3 {isWinner
						? 'border-amber-400/40 bg-amber-400/5'
						: 'border-slate-700/40 bg-slate-800/40'}"
					style={isWinner ? 'box-shadow: 0 0 20px rgba(251,191,36,0.1);' : ''}
				>
					<div class="flex flex-col gap-2">
						<!-- Rank + Score header -->
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-lg font-bold {isWinner ? 'text-amber-400' : 'text-slate-400'}">
									#{index + 1}
								</span>
								<div class="h-3 w-3 rounded-full" style="background-color: {t.player.color};"></div>
								<span class="font-semibold text-white">{t.player.name}</span>
							</div>
							<div class="flex flex-row items-center gap-2">
								{#if t.score > 0}
									<button
										type="button"
										onclick={() => openReplayPopup(t)}
										class="flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-400/50 bg-cyan-400/10 px-2 py-1 text-xs font-semibold text-cyan-300 transition-all hover:bg-cyan-400/20"
									>
										<SquareStack class="h-3 w-3" />
										<span class="hidden md:block">{$_('leaderboard.replay')}</span>
									</button>
								{/if}
								<span class="text-xl font-bold text-cyan-400 tabular-nums">
									{$_('scoring.pts', { values: { points: totalScore.toLocaleString() } })}
								</span>
							</div>
						</div>

						<PlayerTimeline
							playerName={t.player.name}
							playerColor={t.player.color}
							entries={t.entries}
							active={false}
							compact={false}
							acceptingDrop={false}
							hideCount={true}
							hideHeader={true}
							onConfirmedCardClick={(entry) => (inspectTrack = entry.track)}
						/>
						<p class="flex items-center gap-2 text-xs text-slate-400">
							<span>
								{$_('timeline.accuracy', {
									values: {
										correct: t.correctPlacements,
										total: t.totalPlacements,
										percentage:
											t.totalPlacements > 0
												? Math.round((t.correctPlacements / t.totalPlacements) * 100)
												: 0
									}
								})}
							</span>
							{#if getAverageTime(t.replayTurns) !== null}
								<span class="flex items-center gap-1 tabular-nums">
									<Zap class="h-3 w-3 text-cyan-400/80" />
									{$_('timeline.averageTime', {
										values: { seconds: getAverageTime(t.replayTurns)!.toFixed(1) }
									})}
								</span>
							{/if}
							{#if t.longestStreak > 0}
								<span class="flex items-center gap-0.5 text-orange-400/70">
									<Flame class="h-3 w-3" />
									{$_('timeline.longestStreak', { values: { count: t.longestStreak } })}
								</span>
							{/if}
						</p>
						{#if t.reachedTarget && t.score > 0}
							{@const leaderboardIndex = getLeaderboardIndex(t)}
							{@const leaderboardPlayer = leaderboardPlayers[leaderboardIndex]}
							{#if leaderboardPlayer}
								<div class="flex justify-end">
									<button
										type="button"
										onclick={() =>
											openLeaderboardNameDialog(
												leaderboardPlayer,
												leaderboardIndex,
												hasAllowedName(t.player.name) || isNamedInCurrentRound(leaderboardIndex)
													? 'rename'
													: 'publish'
											)}
										class="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm font-bold text-amber-300 transition-all hover:bg-amber-400/20"
									>
										{#if hasAllowedName(t.player.name) || isNamedInCurrentRound(leaderboardIndex)}
											<PenLine class="h-4 w-4" />
											{$_('leaderboard.rename')}
										{:else}
											<UploadCloud class="h-4 w-4" />
											{$_('leaderboard.publish')}
										{/if}
									</button>
								</div>
							{/if}
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="flex flex-col gap-3">
			<div class="flex items-center gap-2">
				{#if onViewStats}
					<button
						type="button"
						onclick={onViewStats}
						class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-700/60 hover:text-white"
					>
						<BarChart class="h-4 w-4 shrink-0" />
						{$_('stats.title')}
					</button>
				{/if}

				<button
					type="button"
					onclick={handleHomeClick}
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-700/60 hover:text-white"
				>
					<Home class="h-4 w-4 shrink-0" />
					{$_('endGame.home')}
				</button>

				<button
					type="button"
					onclick={() => (showFeedbackPopup = true)}
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-700/60 hover:text-white"
				>
					<MessageSquare class="h-4 w-4 shrink-0" />
					{$_('feedback.title')}
				</button>
			</div>
		</div>
	</div>
</Popup>

<FeedbackPopup visible={showFeedbackPopup} onClose={() => (showFeedbackPopup = false)} />

<Popup visible={showNamePopup} onClose={() => (showNamePopup = false)} width="sm">
	<div class="flex flex-col gap-4 text-center">
		<PenLine class="mx-auto h-9 w-9 text-amber-400" />
		<h3 class="text-lg font-bold text-white">
			{#if namePopupMode === 'rename'}
				{$_('leaderboard.renameTitle')}
			{:else}
				{$_('leaderboard.publishTitle')}
			{/if}
		</h3>
		<p class="text-sm text-slate-400">{$_('leaderboard.namePrompt')}</p>
		<input
			type="text"
			bind:value={leaderboardNameInput}
			placeholder={$_('leaderboard.namePlaceholder')}
			class="rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-center text-base font-semibold text-white placeholder-slate-500 outline-none focus:border-amber-400"
		/>
		{#if leaderboardNameInput.trim().length > 0 && isDefaultName(leaderboardNameInput.trim())}
			<p class="text-xs text-amber-300">{$_('leaderboard.defaultNameError')}</p>
		{/if}
		{#if leaderboardNameError}
			<p class="text-xs text-red-400">{$_('leaderboard.error')}</p>
		{/if}
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => (showNamePopup = false)}
				class="flex-1 cursor-pointer rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-slate-700/60 hover:text-white"
			>
				{$_('leaderboard.cancel')}
			</button>
			<button
				type="button"
				onclick={submitLeaderboardName}
				disabled={!canSubmitLeaderboardName()}
				class="flex-1 cursor-pointer rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 text-sm font-bold text-amber-400 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{#if leaderboardNameSubmitting}
					{$_('leaderboard.submitting')}
				{:else if namePopupMode === 'rename'}
					{$_('leaderboard.rename')}
				{:else}
					{$_('leaderboard.publish')}
				{/if}
			</button>
		</div>
	</div>
</Popup>

<Popup visible={showPublishPermission} onClose={denyPublishPermission} width="md">
	<div class="flex flex-col gap-4 text-center">
		<UploadCloud class="mx-auto h-10 w-10 text-amber-400" />
		<h3 class="text-lg font-bold text-white">{$_('leaderboard.publishTitle')}</h3>
		<p class="text-sm text-slate-400">
			{$_('leaderboard.namePrompt')}
		</p>
		<div class="flex flex-col gap-2 text-left">
			{#each unknownPermissionPlayers as player, i (`${player.color}-${i}`)}
				<label
					class="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-900/50 px-3 py-2.5"
				>
					<span class="h-3 w-3 shrink-0 rounded-full" style="background-color: {player.color};"
					></span>
					<input
						type="text"
						bind:value={permissionNames[i]}
						placeholder={$_('leaderboard.namePlaceholder')}
						class="min-w-0 flex-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-amber-400"
					/>
				</label>
				{#if (permissionNames[i]?.trim() ?? '').length > 0 && isDefaultName(permissionNames[i].trim())}
					<p class="text-center text-xs text-amber-300">{$_('leaderboard.defaultNameError')}</p>
				{/if}
			{/each}
		</div>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={denyPublishPermission}
				class="flex-1 cursor-pointer rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-slate-700/60 hover:text-white"
			>
				{$_('leaderboard.dontPublish')}
			</button>
			<button
				type="button"
				onclick={acceptPublishPermission}
				disabled={!canAcceptPublishPermission()}
				class="flex-1 cursor-pointer rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 text-sm font-bold text-amber-400 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{$_('leaderboard.allowPublishing')}
			</button>
		</div>
	</div>
</Popup>

<Popup
	visible={!!inspectTrack}
	onClose={() => (inspectTrack = null)}
	width="6xl"
	borderColor="border-cyan-400"
>
	{#if inspectTrack}
		<div class="flex h-full w-full flex-col gap-5">
			<div class="text-center text-5xl font-black tracking-wide text-slate-200">
				{revealYearText}
			</div>
			<div
				class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4"
			>
				<TrackInfo track={inspectTrack} showMirror={false} bleed="sm" fixedWidth={true} />
			</div>
		</div>
	{/if}
</Popup>

<Popup visible={showHomeConfirm} onClose={() => (showHomeConfirm = false)} width="md">
	<div class="flex flex-col gap-4 text-center">
		<PenLine class="mx-auto h-10 w-10 text-amber-400" />
		<h3 class="text-lg font-bold text-white">{$_('leaderboard.unnamedScore')}</h3>
		<p class="text-sm text-slate-400">{$_('leaderboard.highScoreAnonymousPrompt')}</p>
		<div class="flex gap-2">
			<button
				type="button"
				onclick={() => {
					showHomeConfirm = false;
					onHome();
				}}
				class="flex-1 cursor-pointer rounded-xl border border-slate-600 bg-slate-800/60 px-4 py-3 text-sm font-semibold text-slate-300 transition-all hover:bg-slate-700/60 hover:text-white"
			>
				{$_('endGame.home')}
			</button>
			<button
				type="button"
				onclick={() => {
					showHomeConfirm = false;
					const player = leaderboardPlayers[0];
					if (player) {
						openLeaderboardNameDialog(
							player,
							0,
							hasAllowedName(player.name) ? 'rename' : 'publish'
						);
					}
				}}
				class="flex-1 cursor-pointer rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 text-sm font-bold text-amber-400 transition-all hover:bg-slate-800"
			>
				{$_('leaderboard.publish')}
			</button>
		</div>
	</div>
</Popup>

{#if replayTimeline}
	<TimelinePopup
		visible={showReplayPopup}
		playerName={replayTimeline.player.name}
		country={null}
		score={Math.round(replayTimeline.score)}
		attempts={replayTimeline.totalPlacements}
		averageTime={getAverageTime(replayTimeline.replayTurns)}
		longestStreak={replayTimeline.longestStreak}
		timestamp={undefined}
		tracks={replayTimeline.entries.map((e) => e.track)}
		log={getReplayLog(replayTimeline)}
		onClose={() => (showReplayPopup = false)}
	/>
{/if}
