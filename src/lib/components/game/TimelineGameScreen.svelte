<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import type { Player, PlayerEdge, Track } from '$lib/types';
	import { ALL_EDGES } from '$lib/types';
	import { currentRound, resetGame, gameSession, lastReconnectedAt } from '$lib/stores';
	import { _ } from 'svelte-i18n';

	// Components
	import EdgeDisplay from '$lib/components/ui/primitives/EdgeDisplay.svelte';
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import PlayerControl from '$lib/components/ui/gameplay/PlayerControl.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import CardStack from './timeline/CardStack.svelte';
	import PlayerTimeline from './timeline/PlayerTimeline.svelte';
	import TimelineEndGameScreen from './timeline/TimelineEndGameScreen.svelte';

	// Logic
	import { getGameContext } from './context';
	import { TimelineGame } from '$lib/logic/timelineGame.svelte';
	import type { TimelineRow } from '$lib/logic/timelineTypes';

	// ─── Props ─────────────────────────────────────────────

	interface Props {
		players: Player[];
		cardsToWin: number;
		onHome?: () => void;
	}

	let { players, cardsToWin, onHome = () => {} }: Props = $props();

	// ─── Context & Game Logic ──────────────────────────────

	const ctx = getGameContext();
	const game = new TimelineGame(
		players,
		cardsToWin,
		{
			playTrack: ctx.playTrack,
			stopTrack: ctx.stopTrack,
			nextRound: ctx.nextRound,
			sampleRawTrack: ctx.sampleRawTrack
		},
		() => ctx.currentTrack
	);

	// ─── Audio Progress ────────────────────────────────────

	onDestroy(() => {
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

		game.initGame();

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

	// ─── Auto-retry on reconnection ────────────────────────
	// When a preload error occurred (e.g. offline during turn transition),
	// automatically retry once the browser comes back online.
	$effect(() => {
		// Reading $lastReconnectedAt makes this effect re-run on every
		// offline→online transition.
		const _reconnected = $lastReconnectedAt;
		if (_reconnected > 0 && ctx.hasPreloadError && !ctx.isPreloading) {
			ctx.retryPreload();
		}
	});

	// ─── Orchestration Handlers ────────────────────────────

	function handleQuit() {
		ctx.stopTrack();
		resetGame();
		gameSession.reset();
		onHome();
	}

	function handlePlayAgain() {
		game.showEndGame = false;
		resetGame();
		gameSession.startSession('timeline', players, false);
		ctx.prepareNewGame();
		game.initGame();
	}
</script>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- SNIPPETS                                                -->
<!-- ═══════════════════════════════════════════════════════ -->

{#snippet dealingOverlay()}
	{#if game.isDealing && game.dealingToName}
		<div
			class="absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap"
			transition:fly={{ y: -20, duration: 300 }}
		>
			<div
				class="rounded-full border border-cyan-400/30 bg-slate-900/80 px-4 py-1.5 text-sm font-bold text-cyan-400 shadow-lg backdrop-blur-md"
			>
				{$_('timeline.dealing', { values: { name: game.dealingToName } })}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet cardStackDisplay()}
	<CardStack
		items={game.centerStack}
		isTurnActive={game.isStackInteractive}
		draggable={!game.isDealing && game.canDragCenter}
		dragging={game.drag.active && game.drag.kind === 'center'}
		dragTranslate={game.drag.kind === 'center' ? game.drag.translate : { x: 0, y: 0 }}
		dragScale={game.centerDragScale}
		dragOrigin={game.drag.origin}
		onPointerDown={(ev) => game.startDragFromCenter(ev)}
	>
		{#snippet topCardContent(track: Track)}
			<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
				{#if !game.hasPlaybackStarted}
					<!-- Fresh card — show play button -->
					<div class="relative h-[170px] w-[170px]">
						<PlayerControl
							visible={true}
							isPlaying={false}
							playbackEnded={false}
							isRevealed={false}
							progress={ctx.audioProgressValue}
							{track}
							playerSize={120}
							onPlay={() => game.handlePlay()}
							onStop={() => game.handleStop()}
							onReveal={() => {}}
							onReplay={() => game.handlePlay()}
						/>
					</div>
				{:else if !$currentRound.isPlaying}
					<!-- Paused/stopped — show drag prompt -->
					<div class="animate-pulse text-center text-3xl font-bold text-slate-300">
						{$_('timeline.drag')}
					</div>
				{:else}
					<!-- Playing -->
					<div class="relative h-[170px] w-[170px]">
						<PlayerControl
							visible={true}
							isPlaying={true}
							playbackEnded={false}
							isRevealed={false}
							progress={ctx.audioProgressValue}
							{track}
							playerSize={120}
							onPlay={() => {}}
							onStop={() => game.handleStop()}
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

	<PlayerTimeline
		playerName={timeline.player.name}
		playerColor={timeline.player.color}
		entries={timeline.entries}
		active={isActive}
		compact={!isActive}
		acceptingDrop={isActive && game.canDragCenter}
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
		isDealing={game.isDealing}
		helpText={isActive
			? game.pendingEntryId
				? $_('timeline.help.reorder')
				: game.hasPlaybackStarted
					? $_('timeline.help.dragToPlace')
					: $_('timeline.help.playFirst')
			: ''}
		showConfirm={isActive && !!game.pendingEntryId}
		confirmDisabled={!game.canConfirm}
		confirmLabel={$_('timeline.confirm')}
		onConfirm={() => game.handleConfirmPlacement()}
		onConfirmedCardClick={(entry) => game.openInspectCard(entry.id, entry.track)}
		onPendingPointerDown={(id, ev) => game.startDragPending(id, ev)}
	/>
{/snippet}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- LAYOUT                                                  -->
<!-- ═══════════════════════════════════════════════════════ -->

<div class="fixed inset-0 overflow-hidden text-white">
	{#if game.isMdHeight}
		<!-- Standard centred layout for taller screens -->
		<div
			class="relative top-1/2 left-1/2 z-200 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
		>
			{@render dealingOverlay()}
			<div class="relative">
				{@render cardStackDisplay()}
			</div>
		</div>

		<!-- Render EdgeDisplay for each edge that has players -->
		{#each ALL_EDGES as edge (edge)}
			{@const edgeTimelines = game.timelinesByEdge.get(edge) || []}
			{#if edgeTimelines.length > 0}
				{@const hideTop = edge !== 'top'}
				{@const hideLeftRight = edge !== 'left' && edge !== 'right'}
				{@const hideBottom = edge !== 'bottom'}
				<EdgeDisplay visible={true} disablePointerEvents={false} {hideTop} {hideLeftRight}>
					{#snippet children({ rotation })}
						{@const isCorrectRotation =
							(edge === 'bottom' && rotation === 0) ||
							(edge === 'top' && rotation === 180) ||
							(edge === 'left' && rotation === 90) ||
							(edge === 'right' && rotation === -90)}
						{#if isCorrectRotation}
							<div class="mx-auto flex max-w-[900px] flex-col items-center gap-2 px-2 pb-4">
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
		<div class="fixed top-[33dvh] right-50 left-50 z-200 md:left-auto">
			{@render cardStackDisplay()}
		</div>

		<div class="fixed top-1/2 left-1/2 z-150 -translate-x-1/2">
			{@render dealingOverlay()}
		</div>

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

<Popup
	visible={game.showRevealPopup && !!game.revealTrack}
	onClose={() => game.handleCloseRevealPopup()}
	width="w-[480px] max-w-[90vw]"
	borderColor={game.revealIsCorrect === true
		? 'border-green-400'
		: game.revealIsCorrect === false
			? 'border-red-400'
			: 'border-cyan-400'}
	rotation={game.popupRotation}
>
	{#if game.revealTrack}
		<div class="flex h-full w-full flex-col gap-5">
			<div class="text-center text-5xl font-black tracking-wide text-slate-200">
				{game.revealYearText}
			</div>
			<div
				class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4"
			>
				<TrackInfo
					track={game.revealTrack}
					showMirror={players.some((player) => player.edge === 'top')}
					bleed="sm"
				/>
			</div>
		</div>
	{/if}
</Popup>

<TimelineEndGameScreen
	visible={game.showEndGame}
	{cardsToWin}
	timelines={game.timelines}
	tracksExhausted={ctx.tracksExhausted}
	onHome={handleQuit}
	onPlayAgain={handlePlayAgain}
/>
