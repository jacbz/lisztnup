<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import type { Player, Track } from '$lib/types';
	import PlayerTimeline, { type TimelineEntry } from './PlayerTimeline.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import { formatYearRange } from '$lib/utils';
	import Home from 'lucide-svelte/icons/home';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import Flame from 'lucide-svelte/icons/flame';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import FeedbackPopup from '$lib/components/ui/gameplay/FeedbackPopup.svelte';
	import LeaderboardSubmitPopup, {
		type LeaderboardPlayer
	} from '$lib/components/ui/screens/LeaderboardSubmitPopup.svelte';
	import { getPlayerToken } from '$lib/stores/identity';
	import { STREAK_THRESHOLD } from '$lib/logic/timelineGame.svelte';
	import PenLine from 'lucide-svelte/icons/pen-line';
	import Crown from 'lucide-svelte/icons/crown';
	import { onMount } from 'svelte';
	import { scale, slide } from 'svelte/transition';
	import { getLeaderboard, submitLeaderboard } from '$lib/services/client';

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
	}

	interface Props {
		visible?: boolean;
		cardsToWin: number;
		timelines: FinalTimeline[];
		tracksExhausted?: boolean;
		tracklistId?: string | null;
		sessionId?: string | null;
		onHome?: () => void;
		onViewStats?: () => void;
	}

	let {
		visible = false,
		cardsToWin,
		timelines,
		tracksExhausted = false,
		tracklistId = null,
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

	const revealYearText = $derived.by(() => {
		if (!inspectTrack) return '';
		return formatYearRange(inspectTrack.work.begin_year, inspectTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});

	// Only players who completed their timeline can publish or claim their score.
	const leaderboardPlayers = $derived<LeaderboardPlayer[]>(
		sortedTimelines
			.filter((t) => t.score > 0 && t.reachedTarget)
			.map((t) => ({
				name: t.player.name,
				color: t.player.color,
				score: t.score,
				cards: t.entries.length,
				accuracy: t.totalPlacements > 0 ? t.correctPlacements / t.totalPlacements : 0,
				longestStreak: t.longestStreak
			}))
	);

	let showFeedbackPopup = $state(false);
	let showLeaderboardSubmit = $state(false);
	let showHomeConfirm = $state(false);
	let hasNamedScore = $state(false);
	let gameoverAudio: HTMLAudioElement | null = null;
	let gameoverPlayed = false;
	let isNewHighScore = $state(false);
	let autoSubmitted = $state(false);
	let entryIds = $state<(number | null)[]>([]);

	function handleHomeClick() {
		if (leaderboardPlayers.length > 0 && !hasNamedScore) {
			showHomeConfirm = true;
		} else {
			onHome();
		}
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
			cardsToWin,
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
						const p = leaderboardPlayers.find((lp) => lp.name === t.player.name)!;
						const timelineGids: [string, string][] = t.entries
							.filter((e) => e.confirmed && e.correct !== false)
							.map((e) => [e.track.work.gid, e.track.part.gid]);

						return submitLeaderboard(
							{
								playerToken: token,
								playerName: null,
								score: Math.round(p.score),
								cards: p.cards,
								accuracy: p.accuracy,
								longestStreak: p.longestStreak,
								tracklistId,
								cardsToWin,
								sessionId,
								timeline: timelineGids
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
							<span class="text-xl font-bold text-cyan-400 tabular-nums">
								{$_('scoring.pts', { values: { points: totalScore.toLocaleString() } })}
							</span>
						</div>

						<PlayerTimeline
							playerName={t.player.name}
							playerColor={t.player.color}
							entries={t.entries}
							active={false}
							compact={false}
							acceptingDrop={false}
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
							{#if t.longestStreak >= STREAK_THRESHOLD}
								<span class="flex items-center gap-0.5 text-orange-400/70">
									<Flame class="h-3 w-3" />
									{$_('timeline.longestStreak', { values: { count: t.longestStreak } })}
								</span>
							{/if}
						</p>
					</div>
				</div>
			{/each}
		</div>

		<div class="flex flex-col gap-3">
			{#if leaderboardPlayers.length > 0 && !hasNamedScore}
				<button
					type="button"
					onclick={() => (showLeaderboardSubmit = true)}
					class="flex w-full animate-publish-glow cursor-pointer flex-col items-center rounded-xl border-2 border-amber-400 bg-slate-900 px-6 py-3.5 transition-all duration-200 hover:bg-slate-800"
					out:slide={{ duration: 200 }}
				>
					<span class="flex items-center gap-2 text-base font-bold text-amber-400">
						<PenLine class="h-5 w-5" />
						{$_('leaderboard.nameYourScore')}
					</span>
					<span class="text-xs font-normal text-amber-400/60"
						>{$_('leaderboard.nameYourScoreSubtitle')}</span
					>
				</button>
			{/if}

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

{#if leaderboardPlayers.length > 0}
	<LeaderboardSubmitPopup
		visible={showLeaderboardSubmit}
		players={leaderboardPlayers}
		{entryIds}
		onClose={() => (showLeaderboardSubmit = false)}
		onNamed={() => (hasNamedScore = true)}
	/>
{/if}

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
				<TrackInfo track={inspectTrack} showMirror={false} bleed="sm" />
			</div>
		</div>
	{/if}
</Popup>

<Popup visible={showHomeConfirm} onClose={() => (showHomeConfirm = false)} width="md">
	<div class="flex flex-col gap-4 text-center">
		<PenLine class="mx-auto h-10 w-10 text-amber-400" />
		<h3 class="text-lg font-bold text-white">{$_('leaderboard.unnamedScore')}</h3>
		<p class="text-sm text-slate-400">{$_('leaderboard.namePrompt')}</p>
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
					showLeaderboardSubmit = true;
				}}
				class="flex-1 cursor-pointer rounded-xl border-2 border-amber-400 bg-slate-900 px-4 py-3 text-sm font-bold text-amber-400 transition-all hover:bg-slate-800"
			>
				{$_('leaderboard.nameYourScore')}
			</button>
		</div>
	</div>
</Popup>
