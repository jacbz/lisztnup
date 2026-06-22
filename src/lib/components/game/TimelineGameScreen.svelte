<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import type { Player, PlayerEdge } from '$lib/types';
	import { ALL_EDGES } from '$lib/types';
	import { currentRound, resetGame, gameSession, toast } from '$lib/stores';
	import { settings } from '$lib/stores/settings';
	import { _ } from 'svelte-i18n';
	import { analytics } from '$lib/game-logger';
	import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

	// Components
	import EdgeDisplay from '$lib/components/ui/primitives/EdgeDisplay.svelte';
	import PlayerControl from '$lib/components/ui/gameplay/PlayerControl.svelte';
	import CardStack from './timeline/CardStack.svelte';
	import PlayerTimeline from './timeline/PlayerTimeline.svelte';
	import TimelineEndGameScreen from './timeline/TimelineEndGameScreen.svelte';
	import TimelineRevealPopup from './timeline/TimelineRevealPopup.svelte';
	import FlashingText from '$lib/components/ui/gameplay/FlashingText.svelte';
	import StatsScreen from '$lib/components/ui/screens/StatsScreen.svelte';

	// Logic
	import { getGameContext } from './context';
	import { TimelineGame } from '$lib/logic/timelineGame.svelte';
	import { calculateStreakMult, isFlawlessCompletion } from '$lib/logic/timelineScoring';
	import type { TimelineRow } from '$lib/logic/timelineTypes';

	// ─── Props ─────────────────────────────────────────────

	interface Props {
		players: Player[];
		target: number;
		isSoloMode?: boolean;
		onHome?: () => void;
	}

	let { players, target, isSoloMode = false, onHome = () => {} }: Props = $props();

	// ─── Context & Game Logic ──────────────────────────────

	const ctx = getGameContext();
	// svelte-ignore state_referenced_locally (TimelineGame is a one-shot construct; players/target are fixed for the game lifetime)
	const game = new TimelineGame(
		players,
		target,
		{
			playTrack: ctx.playTrack,
			stopTrack: ctx.stopTrack,
			nextRound: ctx.nextRound,
			sampleRawTrack: ctx.sampleRawTrack,
			getCurrentDeezerId: () => ctx.currentDeezerId,
			minYear: ctx.minYear,
			maxYear: ctx.maxYear
		},
		() => ctx.currentTrack,
		isSoloMode
	);

	// ─── Audio Progress ────────────────────────────────────

	onDestroy(() => {
		// Capture final stats before the session is closed.
		// This handles both natural game end and manual navigation.
		analytics.endGame(game.showEndGame ? 'completed' : 'abandoned', {
			numberOfTurns: game.totalTurns,
			players: game.playerStats
		});
		game.destroy();
	});

	// ─── Lifecycle ─────────────────────────────────────────

	onMount(() => {
		const mqWidth = window.matchMedia('(min-width: 768px)');
		const mqLgWidth = window.matchMedia('(min-width: 1024px)');
		const mqMdHeight = window.matchMedia('(min-height: 768px)');

		const updateMq = () => {
			game.isMdViewport = mqWidth.matches;
			game.isLgWidth = mqLgWidth.matches;
			game.isMdHeight = mqMdHeight.matches;
		};

		updateMq();
		mqWidth.addEventListener('change', updateMq);
		mqLgWidth.addEventListener('change', updateMq);
		mqMdHeight.addEventListener('change', updateMq);

		void game.initGame().catch(handleInitError);

		return () => {
			mqWidth.removeEventListener('change', updateMq);
			mqLgWidth.removeEventListener('change', updateMq);
			mqMdHeight.removeEventListener('change', updateMq);
		};
	});

	// ─── Track Synchronisation ─────────────────────────────

	$effect(() => {
		if (game.isDealing) return;
		const track = ctx.currentTrack;
		if (track) game.syncTopCard(track);
	});

	// ─── Track Exhaustion ──────────────────────────────────

	$effect(() => {
		if (ctx.tracksExhausted && !game.isDealing) {
			ctx.stopTrack();
			game.showEndGame = true;
		}
	});
	// ─── Playback Timer ──────────────────────────────────
	// Start the 10 s countdown once the track finishes playing in full.
	// Manual stops set wasStoppedManually so the timer won't start then.

	$effect(() => {
		if (
			$currentRound.playbackEnded &&
			game.hasPlaybackStarted &&
			!game.wasStoppedManually &&
			!game.resolvingTurn
		) {
			game.startPlaybackTimer();
		}
	});
	// ─── Orchestration Handlers ────────────────────────────

	// ─── Stats popup ───────────────────────────────────────
	let showStatsPopup = $state(false);
	let statsOpenedFromEndgame = $state(false);

	// Register stats handler in the top-right pill (managed by GameScreen)
	$effect(() => {
		const visible = !game.isDealing && !game.showEndGame;
		ctx.registerStatsHandler(visible ? () => (showStatsPopup = true) : null);
	});
	onDestroy(() => ctx.registerStatsHandler(null));

	function handleQuit() {
		ctx.stopTrack();
		resetGame();
		gameSession.reset();
		onHome();
	}

	function handleInitError(error: unknown) {
		console.error('Timeline game failed to initialize:', error);
		toast.error($_('timeline.initialDealFailed'), 5000);
		handleQuit();
	}
</script>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- SNIPPETS                                                -->
<!-- ═══════════════════════════════════════════════════════ -->

{#snippet cardStackDisplay()}
	<CardStack
		items={game.centerStack}
		statusLabel={game.isDealing && game.dealingToName
			? $_('timeline.dealing', { values: { name: game.dealingToName } })
			: null}
		isTurnActive={game.isStackInteractive}
		draggable={!game.isDealing && game.canDragCenter}
		dragging={game.drag.active && game.drag.kind === 'center'}
		dragTranslate={game.drag.kind === 'center' ? game.drag.translate : { x: 0, y: 0 }}
		dragScale={game.centerDragScale}
		dragOrigin={game.drag.origin}
		onPointerDown={(ev) => game.startDragFromCenter(ev)}
		onCardClick={() => !game.hasPlaybackStarted && !ctx.isPreloading && game.handlePlay()}
	>
		{#snippet topCardContent()}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
				{#if !game.hasPlaybackStarted}
					<!-- Fresh card — whole card is the play hitbox; PlayerControl is decorative -->
					<div class="pointer-events-none relative h-42.5 w-42.5">
						<PlayerControl
							visible={true}
							isPlaying={false}
							playbackEnded={false}
							isRevealed={false}
							progress={ctx.audioProgressValue}
							playerSize={120}
							disabled={ctx.isPreloading}
							onPlay={() => {}}
							onStop={() => {}}
							onReveal={() => {}}
							onReplay={() => {}}
						/>
					</div>
				{:else if !$currentRound.isPlaying}
					<!-- Paused/stopped — show drag prompt -->
					<div class="animate-pulse text-center text-3xl font-bold text-slate-300">
						{$_('timeline.drag')}
					</div>
				{:else}
					<!-- Playing -->
					<div class="relative h-42.5 w-42.5">
						<PlayerControl
							visible={true}
							isPlaying={true}
							playbackEnded={false}
							isRevealed={false}
							progress={ctx.audioProgressValue}
							playerSize={120}
							disabled={ctx.isPreloading}
							playingLabel={$_('timeline.drag')}
							onPlay={() => {}}
							onStop={() => {}}
							onReveal={() => {}}
							onReplay={() => {}}
						/>
					</div>
				{/if}
			</div>
		{/snippet}
	</CardStack>
{/snippet}

{#snippet timelineDisplay(timeline: TimelineRow, rotation: number, edge: PlayerEdge)}
	{@const isTurnOwner = timeline.player.name === game.activePlayerName}
	{@const isActive = !game.isDealing && isTurnOwner}
	{@const isEndgameTrigger =
		game.endgameActive &&
		game.timelines.indexOf(timeline) === game.timelines.findIndex((t) => t.reachedTarget)}

	{#if game.endgameActive && !isSoloMode && !game.showEndGame}
		<div class="mb-1 text-center">
			{#if isEndgameTrigger}
				<span
					class="inline-block animate-pulse rounded-full bg-amber-500/20 px-3 py-0.5 text-[10px] font-bold tracking-wider text-amber-400 uppercase"
				>
					{$_('timeline.targetReached')}
				</span>
			{:else}
				<span
					class="inline-block animate-pulse rounded-full bg-red-500/15 px-3 py-0.5 text-[10px] font-bold tracking-wider text-red-400 uppercase"
				>
					{$_('timeline.finalRound')}
				</span>
			{/if}
		</div>
	{/if}

	<PlayerTimeline
		playerName={timeline.player.name}
		playerColor={timeline.player.color}
		entries={timeline.entries}
		active={isActive}
		compact={!isActive}
		acceptingDrop={isActive &&
			game.hasPlaybackStarted &&
			!game.pendingEntryId &&
			!game.resolvingTurn &&
			!game.isDealing}
		streakCount={isActive && game.streakRevealPending
			? game.preRevealCurrentStreak
			: timeline.currentStreak}
		score={timeline.score}
		{rotation}
		isVertical={edge === 'left' || edge === 'right'}
		draggingEntryId={isActive ? game.drag.previewEntryId : null}
		isDragging={isActive ? game.drag.active : false}
		dragKind={isActive ? game.drag.kind : 'none'}
		dragTranslate={isActive && game.drag.kind === 'pending'
			? {
					x: game.drag.translate.x - game.drag.pendingLayoutOffset.x,
					y: game.drag.translate.y - game.drag.pendingLayoutOffset.y
				}
			: game.drag.translate}
		helpText={isActive
			? game.pendingEntryId
				? $_('timeline.help.reorder')
				: game.hasPlaybackStarted
					? $_('timeline.help.dragToPlace')
					: $_('timeline.help.playFirst')
			: ''}
		showConfirm={isActive && (!!game.pendingEntryId || game.timerSeconds !== null)}
		confirmDisabled={!game.canConfirm}
		confirmLabel={$_('timeline.confirm')}
		timerSeconds={isActive ? game.timerSeconds : null}
		onConfirm={() => game.handleConfirmPlacement()}
		onConfirmedCardClick={(entry) => game.openInspectCard(entry.id, entry.track, rotation)}
		onPendingPointerDown={(id, ev) => game.startDragPending(id, ev)}
	/>
{/snippet}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- LAYOUT                                                  -->
<!-- ═══════════════════════════════════════════════════════ -->

<div
	class="fixed inset-0 overflow-hidden text-white"
	class:endgame-glow={game.endgameActive && !isSoloMode && !game.showEndGame}
>
	{#if game.isMdHeight}
		<!-- Standard centred layout for taller screens -->
		<div
			class="relative top-1/2 left-1/2 z-200 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
		>
			{@render cardStackDisplay()}
		</div>

		<!-- Render EdgeDisplay for each edge that has players -->
		{#each ALL_EDGES as edge (edge)}
			{@const edgeTimelines = game.timelinesByEdge.get(edge) || []}
			{#if edgeTimelines.length > 0}
				{@const hideTop = edge !== 'top'}
				{@const hideLeftRight = edge !== 'left' && edge !== 'right'}
				<EdgeDisplay visible={true} disablePointerEvents={false} {hideTop} {hideLeftRight}>
					{#snippet children({ rotation })}
						{@const isCorrectRotation =
							(edge === 'bottom' && rotation === 0) ||
							(edge === 'top' && rotation === 180) ||
							(edge === 'left' && rotation === 90) ||
							(edge === 'right' && rotation === -90)}
						{#if isCorrectRotation}
							<div class="mx-auto flex max-w-225 flex-col items-center gap-2 px-2 pb-4">
								{#each edgeTimelines as t (t.player.name)}
									<div animate:flip={{ duration: 500 }}>
										{@render timelineDisplay(t, rotation, edge)}
									</div>
								{/each}
							</div>
						{/if}
					{/snippet}
				</EdgeDisplay>
			{/if}
		{/each}
	{:else}
		<!-- Compact horizontal layout for shorter screens -->
		{#if players.length <= 3}
			<div class="fixed top-[46dvh] left-1/2 z-200 -translate-x-1/2 -translate-y-1/2">
				{@render cardStackDisplay()}
			</div>
		{:else}
			<div class="fixed top-[33dvh] left-1/2 z-200 -translate-x-1/2 -translate-y-1/2">
				{@render cardStackDisplay()}
			</div>
		{/if}

		<div class="fixed inset-0 flex items-end px-4 pt-20 pb-4">
			<div class="flex w-full flex-col gap-3 overflow-visible">
				{#each game.timelinesByEdge.get('bottom') || [] as timeline (timeline.player.name)}
					<div animate:flip={{ duration: 500 }}>
						{@render timelineDisplay(timeline, 0, 'bottom')}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- POPUPS & OVERLAYS                                       -->
<!-- ═══════════════════════════════════════════════════════ -->

<TimelineRevealPopup
	visible={game.showRevealPopup && !!game.revealTrack}
	track={game.revealTrack}
	yearText={game.revealYearText}
	isCorrect={game.revealIsCorrect}
	purpose={game.revealPurpose}
	scoreBreakdown={game.lastTurnScoreBreakdown}
	consolationScore={game.lastConsolationBreakdown?.consolation ?? 0}
	completionBonus={game.activePlayer?.completionBonus ?? 0}
	reachedTarget={game.revealReachedWin}
	isFlawlessGame={game.revealReachedWin &&
		isFlawlessCompletion(target, game.activePlayer?.totalPlacements ?? 0)}
	scoreBeforeTurn={game.scoreBeforeTurn}
	rotation={game.popupRotation}
	onClose={() => game.handleCloseRevealPopup()}
/>

<TimelineEndGameScreen
	visible={game.showEndGame}
	{target}
	timelines={game.timelines}
	tracksExhausted={ctx.tracksExhausted}
	tracklistId={$settings.selectedTracklist}
	tracklistMin={ctx.minYear}
	tracklistMax={ctx.maxYear}
	sessionId={game.endgameSessionId}
	onHome={handleQuit}
	onViewStats={() => {
		game.showEndGame = false;
		statsOpenedFromEndgame = true;
		showStatsPopup = true;
	}}
/>

<FlashingText
	text={game.streakFlash
		? $_('timeline.scoring.streakMultiplier', {
				values: { mult: calculateStreakMult(game.streakFlash.streak).toFixed(2) + '×' }
			})
		: ''}
	visible={!!game.streakFlash}
	rotation={game.streakFlash?.rotation ?? 0}
	intensity={game.streakFlash
		? Math.min(5, Math.max(1, Math.floor((game.streakFlash.streak - 1) / 2)))
		: 1}
	onComplete={() => game.handleStreakFlashComplete()}
/>

<FlashingText
	text={$_('timeline.finalRound')}
	visible={game.endgameFlash}
	intensity={3}
	icon={TriangleAlert}
	onComplete={() => (game.endgameFlash = false)}
/>

<!-- Stats Popup -->
<StatsScreen
	visible={showStatsPopup}
	{players}
	rounds={game.roundScores}
	onClose={() => {
		showStatsPopup = false;
		if (statsOpenedFromEndgame) {
			statsOpenedFromEndgame = false;
			game.showEndGame = true;
		}
	}}
/>

<style>
	.endgame-glow {
		animation: endgame-pulse 1.5s ease-in-out infinite;
	}

	@keyframes endgame-pulse {
		0%,
		100% {
			box-shadow:
				inset 0 0 40px rgba(251, 191, 36, 0.2),
				inset 0 0 80px rgba(251, 191, 36, 0.08),
				0 0 30px rgba(251, 191, 36, 0.1);
		}
		50% {
			box-shadow:
				inset 0 0 70px rgba(251, 191, 36, 0.4),
				inset 0 0 120px rgba(251, 191, 36, 0.15),
				0 0 50px rgba(251, 191, 36, 0.2);
		}
	}
</style>
