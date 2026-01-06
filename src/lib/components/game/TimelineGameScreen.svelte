<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import type { Player, Track } from '$lib/types';
	import { currentRound, tracklist, resetGame, gameSession } from '$lib/stores';
	import { _ } from 'svelte-i18n';
	import { formatYearRange } from '$lib/utils';

	// Components
	import EdgeDisplay from '$lib/components/ui/primitives/EdgeDisplay.svelte';
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import PlayerControl from '$lib/components/ui/gameplay/PlayerControl.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import CardStack from './timeline/CardStack.svelte';
	import PlayerTimeline, { type TimelineEntry } from './timeline/PlayerTimeline.svelte';
	import TimelineEndGameScreen from './timeline/TimelineEndGameScreen.svelte';
	import { GAME_SCREEN_CONTEXT } from './context';
	import InGameSettings from '$lib/components/ui/gameplay/InGameSettings.svelte';
	import Dialog from '$lib/components/ui/primitives/Dialog.svelte';
	import Logo from '$lib/components/ui/primitives/Logo.svelte';
	import SettingsIcon from 'lucide-svelte/icons/settings';

	interface Props {
		players: Player[];
		cardsToWin: number;
		onHome?: () => void;
	}

	let { players, cardsToWin, onHome = () => {} }: Props = $props();

	// --- Context ---
	const gameContext = getContext(GAME_SCREEN_CONTEXT) as {
		playTrack: () => Promise<void>;
		stopTrack: () => void;
		replayTrack: () => Promise<void>;
		nextRound: () => Promise<void>;
		handlePlaybackEnd: () => void;
		sampleRawTrack: () => Track | null;
		audioProgress: import('svelte/store').Readable<number>;
		onHome: () => void;
	};

	// --- Audio Progress Sync ---
	let audioProgressValue = $state(0);
	gameContext.audioProgress.subscribe((value) => {
		audioProgressValue = value;
	});

	// --- State Groups ---

	let uiState = $state({
		showInGameSettings: false,
		showQuitDialog: false,
		showEndGame: false,
		showRevealPopup: false,
		isDealing: true, // Start in dealing mode
		dealingToName: null as string | null
	});

	let gameState = $state({
		timelines: [] as { player: Player; entries: TimelineEntry[] }[],
		activePlayerIndex: 0,
		drawPile: [] as Track[], // Raw tracks for visuals/refill
		centerStack: [] as { track: Track; id: string }[], // Visual stack

		turnPhase: 'idle' as string,
		pendingEntryId: null as string | null,
		resolvingTurn: false,

		revealEntryId: null as string | null,
		revealTrack: null as Track | null,
		revealIsCorrect: null as boolean | null,
		revealPurpose: 'turn' as 'turn' | 'inspect',
		revealReachedWin: false
	});

	// Local state to track if the current card has been started at least once
	// This drives the "Drag" UI state when playback is paused/stopped
	let hasPlaybackStarted = $state(false);

	let dragState = $state({
		active: false,
		kind: 'none' as 'none' | 'center' | 'pending',
		track: null as Track | null,

		start: { x: 0, y: 0 },
		current: { x: 0, y: 0 },
		translate: { x: 0, y: 0 },
		origin: { x: 0, y: 0 },

		previewEntryId: null as string | null,
		previewInserted: false,

		pendingStartRect: null as DOMRect | null,
		pendingLayoutOffset: { x: 0, y: 0 }
	});

	// --- Derived ---

	let activeTimelineEl: HTMLDivElement | null = $state(null);
	let isMdViewport = $state(false);

	const activePlayer = $derived(gameState.timelines[gameState.activePlayerIndex]);
	const activePlayerName = $derived(activePlayer?.player.name ?? '');

	const topStackItem = $derived(gameState.centerStack[0] ?? null);
	const topCard = $derived(topStackItem?.track ?? null);

	// In Timeline with GameScreen wrapper, the current playable track is the one
	// preloaded in $tracklist at currentRound.currentTrackIndex.
	const loadedTrack = $derived($tracklist[$currentRound.currentTrackIndex] || null);

	const canDragCenter = $derived(
		!uiState.isDealing &&
			hasPlaybackStarted && // Must have started playback to drag
			gameState.turnPhase !== 'locked' &&
			!gameState.pendingEntryId
	);

	const canConfirm = $derived(
		!!gameState.pendingEntryId && !gameState.resolvingTurn && !dragState.active
	);

	const isStackInteractive = $derived(
		!uiState.isDealing && !gameState.pendingEntryId && gameState.turnPhase !== 'locked'
	);

	const centerDragScale = $derived.by(() => {
		if (!dragState.active || dragState.kind !== 'center') return 1;
		if (!activeTimelineEl) return 1;
		const rect = activeTimelineEl.getBoundingClientRect();
		const margin = 140;
		const near =
			dragState.current.x >= rect.left - margin &&
			dragState.current.x <= rect.right + margin &&
			dragState.current.y >= rect.top - margin &&
			dragState.current.y <= rect.bottom + margin;
		if (!near) return 1;
		return isMdViewport ? 16 / 38 : 14 / 32;
	});

	const rotatedTimelines = $derived.by(() => {
		if (gameState.timelines.length === 0) return [];
		if (uiState.isDealing) return gameState.timelines;
		const idx = gameState.activePlayerIndex;
		const before = gameState.timelines.slice(idx + 1);
		const after = gameState.timelines.slice(0, idx + 1);
		return [...before, ...after];
	});

	const revealYearText = $derived.by(() => {
		if (!gameState.revealTrack) return '';
		return formatYearRange(
			gameState.revealTrack.work.begin_year,
			gameState.revealTrack.work.end_year,
			{ preferEndYearWhenRange: true }
		);
	});

	// --- Lifecycle ---

	onMount(() => {
		const mq = window.matchMedia('(min-width: 768px)');
		const updateMq = () => (isMdViewport = mq.matches);
		updateMq();
		mq.addEventListener('change', updateMq);

		initGame();

		return () => {
			mq.removeEventListener('change', updateMq);
		};
	});

	// --- Track Synchronization ---
	// GameScreen preloads tracks into $tracklist. We watch for the newest track
	// and update the top of our center stack to match it.
	let processedTrackIndex = -1;

	$effect(() => {
		// Prevent syncing while dealing to ensure the preloaded "Turn 1" track
		// doesn't get dealt to a player by accident.
		if (uiState.isDealing) return;

		// If we have a track loaded that matches the current round index
		if ($currentRound.currentTrackIndex < $tracklist.length) {
			const track = $tracklist[$currentRound.currentTrackIndex];

			// Only update if we haven't processed this specific round index yet
			if ($currentRound.currentTrackIndex > processedTrackIndex) {
				processedTrackIndex = $currentRound.currentTrackIndex;

				// If stack is empty (start of game), push it.
				// If stack has items (gameplay), replace the top one.
				if (gameState.centerStack.length === 0) {
					gameState.centerStack.push({ track, id: newId() });
				} else {
					gameState.centerStack[0].track = track;
				}

				// New card means reset local playback state
				hasPlaybackStarted = false;
			}
		}
	});

	// --- Game Logic ---

	function newId(): string {
		return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
	}

	function refillDrawPile(minCount: number) {
		while (gameState.drawPile.length < minCount) {
			const next = gameContext.sampleRawTrack();
			if (!next) break;
			gameState.drawPile.push(next);
		}
	}

	function restockCenterStack() {
		const targetDepth = 6;
		while (gameState.centerStack.length < targetDepth) {
			if (gameState.drawPile.length === 0) refillDrawPile(20);
			if (gameState.drawPile.length === 0) break;

			const next = gameState.drawPile.pop();
			if (next) gameState.centerStack.push({ track: next, id: newId() });
		}
	}

	async function initGame() {
		uiState.isDealing = true;

		gameState.timelines = players.map((p) => ({ player: p, entries: [] }));
		gameState.activePlayerIndex = 0;
		gameState.drawPile = [];
		refillDrawPile(20);

		gameState.centerStack = [];
		// We fill the stack with raw cards first
		restockCenterStack();

		// The effect above will check $tracklist and replace the top card with the preloaded one
		// shortly after this runs.

		// Wait a tick to let the empty timelines render in natural order
		await new Promise((r) => setTimeout(r, 500));

		// Deal cards
		for (let i = 0; i < gameState.timelines.length; i++) {
			uiState.dealingToName = gameState.timelines[i].player.name;

			const item = gameState.centerStack.shift();
			restockCenterStack();

			if (!item) break;

			const entry: TimelineEntry = {
				id: newId(),
				track: item.track,
				confirmed: true,
				correct: null,
				isDiscarding: false
			};
			gameState.timelines[i].entries.push(entry);

			await new Promise((r) => setTimeout(r, 600));
		}

		// Ensure the top card is the verified one from tracklist if available
		if (gameState.centerStack.length > 0 && loadedTrack) {
			gameState.centerStack[0].track = loadedTrack;
		}

		uiState.dealingToName = null;
		uiState.isDealing = false;
		resetTurnState();
	}

	function resetTurnState() {
		gameState.pendingEntryId = null;
		gameState.resolvingTurn = false;
		gameState.turnPhase = 'idle';
		dragState.active = false;
		dragState.kind = 'none';
		dragState.track = null;
		hasPlaybackStarted = false;
	}

	function rotateToNextPlayer() {
		gameState.activePlayerIndex = (gameState.activePlayerIndex + 1) % gameState.timelines.length;
	}

	async function handlePlay() {
		const track = topCard;
		if (
			!track ||
			gameState.resolvingTurn ||
			gameState.turnPhase === 'locked' ||
			uiState.showRevealPopup
		)
			return;

		gameState.turnPhase = 'playing';
		hasPlaybackStarted = true;
		await gameContext.playTrack();
	}

	function handleStop() {
		gameContext.stopTrack();
		// isPlaying becomes false via store, hasPlaybackStarted remains true
		// This triggers the "Drag" UI state
	}

	// --- Drag ---

	function startDragFromCenter(ev: PointerEvent) {
		if (!canDragCenter || !topCard) return;

		gameContext.stopTrack();
		gameState.turnPhase = 'locked';

		initDrag(ev, 'center', topCard);
	}

	function startDragPending(entryId: string, ev: PointerEvent) {
		if (gameState.resolvingTurn || uiState.showRevealPopup) return;
		if (gameState.pendingEntryId !== entryId) return;

		const entry = activePlayer.entries.find((e) => e.id === entryId);
		if (!entry) return;

		initDrag(ev, 'pending', entry.track);
		dragState.previewEntryId = entryId;
		dragState.previewInserted = true;
		dragState.pendingStartRect = getActiveTimelineEntryRect(entryId);
	}

	function initDrag(ev: PointerEvent, kind: 'center' | 'pending', track: Track) {
		dragState.active = true;
		dragState.kind = kind;
		dragState.track = track;
		dragState.start = { x: ev.clientX, y: ev.clientY };
		dragState.current = { x: ev.clientX, y: ev.clientY };
		dragState.translate = { x: 0, y: 0 };

		const target = ev.currentTarget as HTMLElement | null;
		if (target) {
			const rect = target.getBoundingClientRect();
			dragState.origin = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
		}

		if (kind === 'center') {
			dragState.previewEntryId = newId();
			dragState.previewInserted = false;
		}

		window.addEventListener('pointermove', onDragMove, { passive: false });
		window.addEventListener('pointerup', onDragUp);
		window.addEventListener('pointercancel', onDragUp);
	}

	function onDragMove(ev: PointerEvent) {
		if (!dragState.active) return;
		ev.preventDefault();
		dragState.current = { x: ev.clientX, y: ev.clientY };
		dragState.translate = {
			x: ev.clientX - dragState.start.x,
			y: ev.clientY - dragState.start.y
		};

		const within = isWithinTimeline(ev.clientX, ev.clientY);
		const idx = within ? getInsertionIndex(ev.clientX) : null;

		if (dragState.kind === 'center') {
			if (idx == null) {
				removePreviewEntry();
			} else {
				if (!dragState.previewInserted) insertPreviewEntry(idx);
				else updatePreviewPosition(idx);
			}
		} else if (dragState.kind === 'pending') {
			if (idx != null) updatePendingPosition(idx);
			measurePendingDragOffset();
		}
	}

	function onDragUp(ev: PointerEvent) {
		window.removeEventListener('pointermove', onDragMove);
		window.removeEventListener('pointerup', onDragUp);
		window.removeEventListener('pointercancel', onDragUp);
		if (!dragState.active) return;

		const success = dragState.kind === 'center' && dragState.previewInserted;
		const droppedId = dragState.previewEntryId;
		const droppedTrack = dragState.track;

		if (dragState.kind === 'center' && !success) {
			removePreviewEntry();
			gameState.turnPhase = 'playing'; // Unlock if failed
		}

		if (success && droppedId && droppedTrack) {
			gameState.pendingEntryId = droppedId;
			gameState.centerStack.shift(); // Remove visual card
		}

		dragState.active = false;
		dragState.kind = 'none';
		dragState.track = null;
		dragState.previewInserted = false;
		dragState.previewEntryId = null;
	}

	function isWithinTimeline(x: number, y: number): boolean {
		if (!activeTimelineEl) return false;
		const rect = activeTimelineEl.getBoundingClientRect();
		return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
	}

	function getInsertionIndex(x: number): number {
		if (!activeTimelineEl) return 0;
		const cards = Array.from(activeTimelineEl.querySelectorAll('[data-timeline-entry]'));
		if (cards.length === 0) return 0;
		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (x < r.left + r.width / 2) return i;
		}
		return cards.length;
	}

	function getActiveTimelineEntryRect(id: string): DOMRect | null {
		return (
			activeTimelineEl?.querySelector(`[data-entry-id="${id}"]`)?.getBoundingClientRect() ?? null
		);
	}

	function insertPreviewEntry(atIndex: number) {
		if (!dragState.previewEntryId || !dragState.track) return;
		const entry: TimelineEntry = {
			id: dragState.previewEntryId,
			track: dragState.track,
			confirmed: false,
			correct: null,
			isDiscarding: false
		};
		activePlayer.entries.splice(atIndex, 0, entry);
		dragState.previewInserted = true;
	}

	function removePreviewEntry() {
		if (!dragState.previewEntryId) return;
		activePlayer.entries = activePlayer.entries.filter((e) => e.id !== dragState.previewEntryId);
		dragState.previewInserted = false;
	}

	function updatePreviewPosition(toIndex: number) {
		moveEntryInList(dragState.previewEntryId!, toIndex);
	}
	function updatePendingPosition(toIndex: number) {
		moveEntryInList(gameState.pendingEntryId!, toIndex);
	}
	function moveEntryInList(id: string, toIndex: number) {
		const entries = activePlayer.entries;
		const from = entries.findIndex((e) => e.id === id);
		if (from < 0) return;
		let to = toIndex;
		if (to > from) to -= 1;
		to = Math.max(0, Math.min(entries.length - 1, to));
		if (from === to) return;
		const [item] = entries.splice(from, 1);
		entries.splice(to, 0, item);
	}

	function measurePendingDragOffset() {
		if (!dragState.previewEntryId) return;
		requestAnimationFrame(() => {
			const rect = getActiveTimelineEntryRect(dragState.previewEntryId!);
			if (rect && dragState.pendingStartRect) {
				dragState.pendingLayoutOffset = {
					x: rect.left - dragState.pendingStartRect.left,
					y: rect.top - dragState.pendingStartRect.top
				};
			}
		});
	}

	// --- Resolution ---

	function getTimelineYear(track: Track): number {
		return track.work.end_year ?? track.work.begin_year ?? 0;
	}

	async function handleConfirmPlacement() {
		if (!gameState.pendingEntryId) return;
		gameState.resolvingTurn = true;
		gameContext.stopTrack();

		const entries = activePlayer.entries;
		const idx = entries.findIndex((e) => e.id === gameState.pendingEntryId);
		if (idx < 0) return;

		const track = entries[idx].track;
		const year = getTimelineYear(track);

		const prev = idx > 0 ? getTimelineYear(entries[idx - 1].track) : -Infinity;
		const next = idx < entries.length - 1 ? getTimelineYear(entries[idx + 1].track) : Infinity;
		const isCorrect = year >= prev && year <= next;

		entries[idx].confirmed = true;
		entries[idx].correct = isCorrect;

		const audio = isCorrect ? new Audio('/correct.mp3') : new Audio('/wrong.mp3');
		audio.play().catch(() => {});

		gameState.revealEntryId = entries[idx].id;
		gameState.revealTrack = track;
		gameState.revealIsCorrect = isCorrect;
		gameState.revealPurpose = 'turn';
		gameState.revealReachedWin =
			isCorrect && entries.filter((e) => e.correct !== false).length >= cardsToWin;
		gameState.pendingEntryId = null;

		uiState.showRevealPopup = true;
	}

	function handleCloseRevealPopup() {
		uiState.showRevealPopup = false;
		const wasWrong = gameState.revealIsCorrect === false;
		const entryId = gameState.revealEntryId;

		if (gameState.revealPurpose === 'turn') {
			gameContext.nextRound();
		}

		setTimeout(() => {
			if (gameState.revealPurpose === 'inspect') {
				clearRevealState();
				return;
			}

			if (gameState.revealReachedWin) {
				uiState.showEndGame = true;
				return;
			}

			if (wasWrong && entryId) {
				const entry = activePlayer.entries.find((e) => e.id === entryId);
				if (entry) {
					entry.isDiscarding = true;
					setTimeout(() => {
						activePlayer.entries = activePlayer.entries.filter((e) => e.id !== entryId);
						finalizeTurn();
					}, 600);
					clearRevealState();
					return;
				}
			}

			clearRevealState();
			finalizeTurn();
		}, 300);
	}

	function finalizeTurn() {
		activePlayer.entries.forEach((e) => {
			e.correct = null;
		});

		rotateToNextPlayer();
		restockCenterStack();
		resetTurnState();
	}

	function clearRevealState() {
		gameState.revealEntryId = null;
		gameState.revealTrack = null;
		gameState.revealIsCorrect = null;
		gameState.revealPurpose = 'turn';
		gameState.revealReachedWin = false;
	}

	function openInspectCard(entryId: string, track: Track) {
		if (dragState.active || gameState.resolvingTurn || gameState.pendingEntryId) return;
		gameState.revealEntryId = entryId;
		gameState.revealTrack = track;
		gameState.revealPurpose = 'inspect';
		uiState.showRevealPopup = true;
	}

	function handleQuit() {
		gameContext.stopTrack();
		resetGame();
		gameSession.reset();
		onHome();
	}

	function handlePlayAgain() {
		uiState.showEndGame = false;
		resetGame();
		gameSession.startSession('timeline', players, false);
		gameContext.nextRound(); // Reset game screen track index
		initGame();
	}
</script>

<div class="fixed inset-0 overflow-hidden text-white">
	<div
		class="relative top-1/2 left-1/2 z-200 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
	>
		<!-- Dealing Text Overlay -->
		{#if uiState.isDealing && uiState.dealingToName}
			<div
				class="absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap"
				transition:fly={{ y: -20, duration: 300 }}
			>
				<div
					class="rounded-full border border-cyan-400/30 bg-slate-900/80 px-4 py-1.5 text-sm font-bold text-cyan-400 shadow-lg backdrop-blur-md"
				>
					{$_('timeline.dealing', { values: { name: uiState.dealingToName } })}
				</div>
			</div>
		{/if}

		<div class="relative">
			<CardStack
				items={gameState.centerStack}
				isTurnActive={isStackInteractive}
				draggable={!uiState.isDealing && canDragCenter}
				dragging={dragState.active && dragState.kind === 'center'}
				dragTranslate={dragState.kind === 'center' ? dragState.translate : { x: 0, y: 0 }}
				dragScale={centerDragScale}
				dragOrigin={dragState.origin}
				onPointerDown={startDragFromCenter}
			>
				{#snippet topCardContent(track: Track)}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-4">
						{#if !hasPlaybackStarted}
							<!-- State 1: Fresh card, has not started -->
							<!-- We force playbackEnded={false} here because a fresh card cannot be in 'ended' state.
							     This fixes the bug where it gets stuck on 'Reveal' if the store hasn't updated yet. -->
							<div class="relative h-[170px] w-[170px]">
								<PlayerControl
									visible={true}
									isPlaying={false}
									playbackEnded={false}
									isRevealed={false}
									progress={audioProgressValue}
									{track}
									playerSize={120}
									onPlay={handlePlay}
									onStop={handleStop}
									onReveal={() => {}}
									onReplay={handlePlay}
								/>
							</div>
						{:else if !$currentRound.isPlaying}
							<!-- State 2: Started, but now paused/stopped (Drag Prompt) -->
							<div class="animate-pulse text-center text-3xl font-bold text-slate-300">
								{$_('timeline.drag')}
							</div>
						{:else}
							<!-- State 3: Playing -->
							<div class="relative h-[170px] w-[170px]">
								<PlayerControl
									visible={true}
									isPlaying={true}
									playbackEnded={false}
									isRevealed={false}
									progress={audioProgressValue}
									{track}
									playerSize={120}
									onPlay={() => {}}
									onStop={handleStop}
									onReveal={() => {}}
									onReplay={() => {}}
								/>
							</div>
						{/if}
					</div>
				{/snippet}
			</CardStack>
		</div>
	</div>

	<EdgeDisplay visible={true} hideTop={true} hideLeftRight={true} disablePointerEvents={false}>
		{#snippet children()}
			<div class="mx-auto flex max-w-[900px] flex-col items-center gap-2 px-2 pb-4">
				{#each rotatedTimelines as t (t.player.name)}
					{@const isTurnOwner = t.player.name === activePlayerName}
					<!-- 
						During dealing: isActive is FALSE for everyone.
						After dealing: isActive is TRUE only for the turn owner.
					-->
					{@const isActive = !uiState.isDealing && isTurnOwner}

					<div animate:flip={{ duration: 500 }}>
						<PlayerTimeline
							playerName={t.player.name}
							playerColor={t.player.color}
							entries={t.entries}
							active={isActive}
							compact={!isActive}
							acceptingDrop={isActive && canDragCenter}
							bindEl={isActive ? (el) => (activeTimelineEl = el) : undefined}
							draggingEntryId={isActive ? dragState.previewEntryId : null}
							isDragging={isActive ? dragState.active : false}
							dragKind={isActive ? dragState.kind : 'none'}
							dragTranslate={isActive && dragState.kind === 'pending'
								? {
										x: dragState.translate.x - dragState.pendingLayoutOffset.x,
										y: dragState.translate.y - dragState.pendingLayoutOffset.y
									}
								: dragState.translate}
							isDealing={uiState.isDealing}
							helpText={isActive
								? gameState.pendingEntryId
									? $_('timeline.help.reorder')
									: hasPlaybackStarted
										? $_('timeline.help.dragToPlace')
										: $_('timeline.help.playFirst')
								: ''}
							showConfirm={isActive && !!gameState.pendingEntryId}
							confirmDisabled={!canConfirm}
							confirmLabel={$_('timeline.confirm')}
							onConfirm={handleConfirmPlacement}
							onConfirmedCardClick={(entry) => openInspectCard(entry.id, entry.track)}
							onPendingPointerDown={startDragPending}
						/>
					</div>
				{/each}
			</div>
		{/snippet}
	</EdgeDisplay>
</div>

<Popup
	visible={uiState.showRevealPopup && !!gameState.revealTrack}
	onClose={handleCloseRevealPopup}
	width="6xl"
	padding="lg"
	borderColor={gameState.revealIsCorrect === true
		? 'border-green-400'
		: gameState.revealIsCorrect === false
			? 'border-red-400'
			: 'border-cyan-400'}
>
	{#if gameState.revealTrack}
		<div class="flex h-full w-full flex-col gap-5">
			<div class="text-center text-5xl font-black tracking-wide text-slate-200">
				{revealYearText}
			</div>
			<div
				class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-700/50 bg-slate-950/30 p-4"
			>
				<TrackInfo track={gameState.revealTrack} showUpsideDown={false} />
			</div>
		</div>
	{/if}
</Popup>

<InGameSettings
	visible={uiState.showInGameSettings}
	onClose={() => (uiState.showInGameSettings = false)}
	mode="timeline"
/>

<Dialog
	visible={uiState.showQuitDialog}
	title={$_('quitDialog.title')}
	message={$_('quitDialog.message')}
	confirmText={$_('quitDialog.confirm')}
	cancelText={$_('quitDialog.cancel')}
	onConfirm={handleQuit}
	onCancel={() => (uiState.showQuitDialog = false)}
/>

<TimelineEndGameScreen
	visible={uiState.showEndGame}
	{cardsToWin}
	timelines={gameState.timelines}
	onHome={handleQuit}
	onPlayAgain={handlePlayAgain}
/>
