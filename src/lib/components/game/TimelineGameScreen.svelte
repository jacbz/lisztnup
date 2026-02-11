<script lang="ts">
	import { onMount, getContext } from 'svelte';
	import { flip } from 'svelte/animate';
	import { fly } from 'svelte/transition';
	import type { Player, Track, PlayerEdge } from '$lib/types';
	import { ALL_EDGES } from '$lib/types';
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

	let isMdViewport = $state(false);
	let isLgWidth = $state(false);
	let isMdHeight = $state(false);

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
		// Simplified scaling: if we are dragging, we assume we are moving towards a timeline
		// Just return the smaller scale immediately to show it "detached" from the stack
		return isMdViewport ? 16 / 38 : 14 / 32;
	});

	// Map original edge to effective edge based on viewport constraints
	function getEffectiveEdge(originalEdge: PlayerEdge): PlayerEdge {
		// If height is smaller than md, override all edges to bottom
		if (!isMdHeight) {
			return 'bottom';
		}

		// If width is smaller than lg, override left/right
		if (!isLgWidth) {
			if (originalEdge === 'left') return 'top';
			if (originalEdge === 'right') return 'bottom';
		}

		return originalEdge;
	}

	// Group timelines by edge, with rotation logic applied within each edge
	const timelinesByEdge = $derived.by(() => {
		const grouped = new Map<PlayerEdge, typeof gameState.timelines>();

		// Initialize all edges
		ALL_EDGES.forEach((edge) => grouped.set(edge, []));

		// Group timelines by player edge, applying viewport-based overrides
		gameState.timelines.forEach((timeline) => {
			const originalEdge = timeline.player.edge || 'bottom';
			const effectiveEdge = getEffectiveEdge(originalEdge);
			const edgeTimelines = grouped.get(effectiveEdge) || [];
			edgeTimelines.push(timeline);
			grouped.set(effectiveEdge, edgeTimelines);
		});

		// Apply rotation logic within each edge during gameplay (not dealing)
		if (!uiState.isDealing && gameState.timelines.length > 0) {
			const idx = gameState.activePlayerIndex;
			const activeTimeline = gameState.timelines[idx];
			const originalEdge = activeTimeline.player.edge || 'bottom';
			const activeEdge = getEffectiveEdge(originalEdge);

			// Only rotate timelines on the active player's edge
			const edgeTimelines = grouped.get(activeEdge) || [];
			const activeIndexInEdge = edgeTimelines.findIndex(
				(t) => t.player.name === activeTimeline.player.name
			);

			if (activeIndexInEdge !== -1) {
				const before = edgeTimelines.slice(activeIndexInEdge + 1);
				const after = edgeTimelines.slice(0, activeIndexInEdge + 1);
				grouped.set(activeEdge, [...before, ...after]);
			}
		}

		return grouped;
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
		const mqWidth = window.matchMedia('(min-width: 768px)');
		const mqLgWidth = window.matchMedia('(min-width: 1024px)');
		const mqMdHeight = window.matchMedia('(min-height: 768px)');

		const updateMq = () => {
			isMdViewport = mqWidth.matches;
			isLgWidth = mqLgWidth.matches;
			isMdHeight = mqMdHeight.matches;
		};

		updateMq();
		mqWidth.addEventListener('change', updateMq);
		mqLgWidth.addEventListener('change', updateMq);
		mqMdHeight.addEventListener('change', updateMq);

		initGame();

		return () => {
			mqWidth.removeEventListener('change', updateMq);
			mqLgWidth.removeEventListener('change', updateMq);
			mqMdHeight.removeEventListener('change', updateMq);
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

		// Find the element to get rect
		// We can't rely on activeTimelineEl. Find by ID in document.
		const el = document.querySelector(`[data-entry-id="${entryId}"]`);
		if (el) {
			dragState.pendingStartRect = el.getBoundingClientRect();
		}
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
		const idx = within ? getInsertionIndex(ev.clientX, ev.clientY) : null;

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
		if (typeof document === 'undefined') return false;
		const elements = document.elementsFromPoint(x, y);
		return elements.some((el) => el.hasAttribute('data-rotation'));
	}

	function getInsertionIndex(x: number, y: number): number {
		if (typeof document === 'undefined') return 0;
		const elements = document.elementsFromPoint(x, y);
		const container = elements.find((el) => el.hasAttribute('data-rotation')) as HTMLElement;
		if (!container) return 0;

		const rotation = parseInt(container.getAttribute('data-rotation') || '0', 10);
		const cards = Array.from(container.querySelectorAll('[data-timeline-entry]'));
		if (cards.length === 0) return 0;

		const isVertical = Math.abs(rotation) === 90;
		const isInvertedHorizontal = Math.abs(rotation) === 180;

		for (let i = 0; i < cards.length; i++) {
			const r = cards[i].getBoundingClientRect();
			if (isVertical) {
				// Vertical (90/-90) is always Top->Bottom (Global Y+)
				if (y < r.top + r.height / 2) return i;
			} else {
				// Horizontal
				if (isInvertedHorizontal) {
					// 180 deg: Global X- (Right to Left)
					if (x > r.left + r.width / 2) return i;
				} else {
					// 0 deg: Global X+ (Left to Right)
					if (x < r.left + r.width / 2) return i;
				}
			}
		}
		return cards.length;
	}

	function getActiveTimelineEntryRect(id: string): DOMRect | null {
		const candidates = Array.from(document.querySelectorAll(`[data-entry-id="${id}"]`));
		if (candidates.length === 0) return null;

		const mx = dragState.current.x;
		const my = dragState.current.y;

		let best = candidates[0];
		let minDist = Infinity;

		for (const el of candidates) {
			const r = el.getBoundingClientRect();
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;
			const d = (mx - cx) ** 2 + (my - cy) ** 2;
			if (d < minDist) {
				minDist = d;
				best = el;
			}
		}
		return best.getBoundingClientRect();
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

{#snippet dealingOverlay()}
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
{/snippet}

{#snippet cardStackDisplay()}
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
{/snippet}

{#snippet timelineDisplay(
	timeline: (typeof gameState.timelines)[0],
	rotation: number,
	edge: PlayerEdge
)}
	{@const isTurnOwner = timeline.player.name === activePlayerName}
	{@const isActive = !uiState.isDealing && isTurnOwner}

	<PlayerTimeline
		playerName={timeline.player.name}
		playerColor={timeline.player.color}
		entries={timeline.entries}
		active={isActive}
		compact={!isActive}
		acceptingDrop={isActive && canDragCenter}
		{rotation}
		isVertical={edge === 'left' || edge === 'right'}
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
{/snippet}

<div class="fixed inset-0 overflow-hidden text-white">
	{#if isMdHeight}
		<!-- Standard centered layout for taller screens -->
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
			{@const edgeTimelines = timelinesByEdge.get(edge) || []}
			{#if edgeTimelines.length > 0}
				{@const hideTop = edge !== 'top'}
				{@const hideLeftRight = edge !== 'left' && edge !== 'right'}
				{@const hideBottom = edge !== 'bottom'}
				<!-- EdgeDisplay shows all 4 positions by default, we hide the ones we don't want -->
				<EdgeDisplay visible={true} disablePointerEvents={false} {hideTop} {hideLeftRight}>
					{#snippet children({ rotation })}
						<!-- Only render if this rotation matches our edge -->
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
		<div class="fixed top-32 right-48 z-200">
			{@render cardStackDisplay()}
		</div>

		<div class="fixed top-4 left-1/2 z-150 -translate-x-1/2">
			{@render dealingOverlay()}
		</div>

		<div class="fixed inset-0 flex items-center px-4 pt-20">
			<div class="flex w-full flex-col gap-3 overflow-y-auto">
				{#each timelinesByEdge.get('bottom') || [] as timeline (timeline.player.name)}
					<div animate:flip={{ duration: 500 }}>
						{@render timelineDisplay(timeline, 0, 'bottom')}
					</div>
				{/each}
			</div>
		</div>
	{/if}
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
				<TrackInfo track={gameState.revealTrack} />
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
