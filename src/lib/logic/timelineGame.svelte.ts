import type { Track } from '$lib/models';
import type { Player, PlayerEdge } from '$lib/types';
import { ALL_EDGES } from '$lib/types';
import { formatYearRange } from '$lib/utils';
import { SvelteMap } from 'svelte/reactivity';
import type {
	TimelineEntry,
	StackItem,
	TimelineRow,
	DragKind,
	TurnPhase,
	TurnScoreBreakdown,
	ConsolationBreakdown
} from './timelineTypes';
import {
	calculateTurnScore,
	calculateGap,
	calculateCompletion,
	calculateConsolationScore
} from './timelineScoring';

// Re-export types for convenience
export type { TimelineEntry, StackItem, TimelineRow, DragKind, TurnPhase, TurnScoreBreakdown };

/** Minimum consecutive correct placements to activate streak visuals. */
export const STREAK_THRESHOLD = 3;

// ─── Context subset ────────────────────────────────────────

/**
 * Minimal interface for the GameScreen functions the game class needs.
 * Kept deliberately small so the class doesn't couple to the full context.
 */
export interface TimelineGameActions {
	playTrack: () => Promise<void>;
	stopTrack: () => void;
	nextRound: () => Promise<void>;
	sampleRawTrack: () => Track | null;
}

// ─── TimelineGame ──────────────────────────────────────────

/**
 * Encapsulates **all** state and logic for the Timeline game mode.
 *
 * Owns: game state, turn management, drag-and-drop, reveal flow,
 *       viewport-aware layout, and center-stack management.
 *
 * Does NOT own: Svelte-store subscriptions ($tracklist, $currentRound),
 *               audio-progress forwarding, or media-query setup — those
 *               stay in the thin TimelineGameScreen component.
 */
export class TimelineGame {
	// ═══════════════════════════════════════════════════════
	// CONFIG (immutable)
	// ═══════════════════════════════════════════════════════
	readonly #players: Player[];
	readonly #target: number;
	readonly #ctx: TimelineGameActions;
	readonly #getCurrentTrack: () => Track | null;

	// ═══════════════════════════════════════════════════════
	// VIEWPORT  (set by the component via media-query listeners)
	// ═══════════════════════════════════════════════════════
	isMdViewport = $state(false);
	isLgWidth = $state(false);
	isMdHeight = $state(false);

	// ═══════════════════════════════════════════════════════
	// UI STATE
	// ═══════════════════════════════════════════════════════
	showEndGame = $state(false);
	/** Analytics session ID captured at game end, for leaderboard submission. */
	endgameSessionId = $state<string | null>(null);
	showRevealPopup = $state(false);
	isDealing = $state(true);
	dealingToName = $state<string | null>(null);

	// ═══════════════════════════════════════════════════════
	// CORE GAME STATE
	// ═══════════════════════════════════════════════════════
	timelines = $state<TimelineRow[]>([]);
	activePlayerIndex = $state(0);
	totalTurns = $state(0);
	centerStack = $state<StackItem[]>([]);
	turnPhase = $state<TurnPhase>('idle');
	pendingEntryId = $state<string | null>(null);
	resolvingTurn = $state(false);
	hasPlaybackStarted = $state(false);

	// ═══════════════════════════════════════════════════════
	// TIMER STATE
	// ═══════════════════════════════════════════════════════
	/** Countdown seconds remaining, or null when timer is inactive. */
	timerSeconds = $state<number | null>(null);
	wasStoppedManually = $state(false);
	#timerInterval: ReturnType<typeof setInterval> | null = null;

	// ═══════════════════════════════════════════════════════
	// STREAK STATE
	// ═══════════════════════════════════════════════════════
	streakFlash = $state<{ playerName: string; streak: number; rotation: number } | null>(null);
	/** True while the reveal popup is open and streak visuals should show pre-turn values. */
	streakRevealPending = $state(false);
	/** Snapshot of active player's streak before the current placement. */
	preRevealCurrentStreak = $state(0);
	preRevealLongestStreak = $state(0);

	// ═══════════════════════════════════════════════════════
	// REVEAL STATE
	// ═══════════════════════════════════════════════════════
	revealEntryId = $state<string | null>(null);
	revealTrack = $state<Track | null>(null);
	revealIsCorrect = $state<boolean | null>(null);
	revealPurpose = $state<'turn' | 'inspect'>('turn');
	revealReachedWin = $state(false);
	popupRotation = $state(0);

	// ═══════════════════════════════════════════════════════
	// SCORING STATE
	// ═══════════════════════════════════════════════════════
	/** Last computed turn score breakdown, used by the reveal popup. */
	lastTurnScoreBreakdown = $state<TurnScoreBreakdown | null>(null);
	/** Consolation breakdown for incorrect placements. */
	lastConsolationBreakdown = $state<ConsolationBreakdown | null>(null);
	/** Score the active player had before this turn (for the reveal popup "Score" row). */
	scoreBeforeTurn = $state(0);
	/** Client-side timestamp (ms) when the current turn's playback started. */
	#turnStartTime: number = 0;
	/**
	 * Per-turn score deltas for every player, used by the stats graph.
	 * Each entry is one complete rotation (round) of all players.
	 * Structure: { roundIndex, playerScores: { playerName: scoreThisRound } }
	 */
	roundScores = $state<Array<{ roundIndex: number; playerScores: Record<string, number> }>>([]);
	/** Accumulates score deltas for the current (in-progress) round. */
	#currentRoundScores: Record<string, number> = {};
	/** Tracks which rotation index we're on (0-based). */
	#roundCounter = 0;

	// ═══════════════════════════════════════════════════════
	// ENDGAME STATE
	// ═══════════════════════════════════════════════════════
	/** True once any player reaches the target — triggers "final round" visuals. */
	endgameActive = $state(false);
	/** One-shot flash when endgame activates (multiplayer only). */
	endgameFlash = $state(false);
	/** Deferred endgame flash — fires after popup closes so it's not hidden by streak flash. */
	#pendingEndgameFlash = false;
	/** Whether this is a solo game (1 player). Solo ends immediately on target. */
	readonly #isSoloMode: boolean;

	// ═══════════════════════════════════════════════════════
	// DRAG STATE  (grouped — many coordinate fields travel together)
	// ═══════════════════════════════════════════════════════
	drag = $state({
		active: false,
		kind: 'none' as DragKind,
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

	// ═══════════════════════════════════════════════════════
	// INTERNAL GUARDS  (plain fields — no reactivity needed)
	// ═══════════════════════════════════════════════════════
	#lastSyncedTrack: Track | null = null;
	#isClosingRevealPopup = false;
	#isInitializing = false;
	#boundOnDragMove: ((ev: PointerEvent) => void) | null = null;
	#boundOnDragUp: ((ev: PointerEvent) => void) | null = null;

	static readonly #TIMER_DURATION = 10;

	// ═══════════════════════════════════════════════════════
	// DERIVED VALUES
	// (ordered so each field's dependencies are declared above it)
	// ═══════════════════════════════════════════════════════

	activePlayer = $derived(this.timelines[this.activePlayerIndex]);
	activePlayerName = $derived(this.activePlayer?.player.name ?? '');

	/** Per-player analytics: timeline years, accuracy, longest streak, and score. */
	playerStats = $derived(
		this.timelines.map((t) => ({
			timeline: t.entries
				.filter((e) => e.confirmed && e.correct !== false)
				.map((e) => this.#getTimelineYear(e.track)),
			accuracy: t.totalPlacements > 0 ? t.correctPlacements / t.totalPlacements : 0,
			longestStreak: t.longestStreak,
			score: t.score
		}))
	);

	topStackItem = $derived(this.centerStack[0] ?? null);
	topCard = $derived(this.topStackItem?.track ?? null);

	canDragCenter = $derived(
		!this.isDealing &&
			this.hasPlaybackStarted &&
			this.turnPhase !== 'locked' &&
			!this.pendingEntryId
	);

	canConfirm = $derived(!!this.pendingEntryId && !this.resolvingTurn && !this.drag.active);

	isStackInteractive = $derived(
		!this.isDealing && !this.pendingEntryId && this.turnPhase !== 'locked'
	);

	centerDragScale = $derived.by(() => {
		if (!this.drag.active || this.drag.kind !== 'center') return 1;
		return this.isMdViewport ? 16 / 38 : 14 / 32;
	});

	revealYearText = $derived.by(() => {
		if (!this.revealTrack) return '';
		return formatYearRange(this.revealTrack.work.begin_year, this.revealTrack.work.end_year, {
			preferEndYearWhenRange: true
		});
	});

	/** Timelines grouped by effective screen edge, with active-player rotation applied. */
	timelinesByEdge = $derived.by(() => {
		const grouped = new SvelteMap<PlayerEdge, TimelineRow[]>();
		ALL_EDGES.forEach((edge) => grouped.set(edge, []));

		// Group by viewport-adjusted edge
		this.timelines.forEach((timeline) => {
			const originalEdge = timeline.player.edge || 'bottom';
			const effectiveEdge = this.#getEffectiveEdge(originalEdge);
			const edgeTimelines = grouped.get(effectiveEdge) || [];
			edgeTimelines.push(timeline);
			grouped.set(effectiveEdge, edgeTimelines);
		});

		// Rotate so active player appears last (closest to center)
		if (!this.isDealing && this.timelines.length > 0) {
			const activeTimeline = this.timelines[this.activePlayerIndex];
			const activeEdge = this.#getEffectiveEdge(activeTimeline.player.edge || 'bottom');
			const edgeTimelines = grouped.get(activeEdge) || [];
			const activeIdx = edgeTimelines.findIndex(
				(t) => t.player.name === activeTimeline.player.name
			);
			if (activeIdx !== -1) {
				const before = edgeTimelines.slice(activeIdx + 1);
				const after = edgeTimelines.slice(0, activeIdx + 1);
				grouped.set(activeEdge, [...before, ...after]);
			}
		}

		return grouped;
	});

	// ═══════════════════════════════════════════════════════
	// CONSTRUCTOR
	// ═══════════════════════════════════════════════════════

	constructor(
		players: Player[],
		target: number,
		ctx: TimelineGameActions,
		getCurrentTrack: () => Track | null,
		isSoloMode: boolean = false
	) {
		this.#players = players;
		this.#target = target;
		this.#ctx = ctx;
		this.#getCurrentTrack = getCurrentTrack;
		this.#isSoloMode = isSoloMode;
	}

	// ═══════════════════════════════════════════════════════
	// HELPERS
	// ═══════════════════════════════════════════════════════

	#newId(): string {
		return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
	}

	#getEffectiveEdge(originalEdge: PlayerEdge): PlayerEdge {
		if (!this.isMdHeight) return 'bottom';
		if (!this.isLgWidth) {
			if (originalEdge === 'left') return 'top';
			if (originalEdge === 'right') return 'bottom';
		}
		return originalEdge;
	}

	static readonly #EDGE_ROTATION: Record<PlayerEdge, number> = {
		bottom: 0,
		top: 180,
		left: 90,
		right: -90
	};

	#getRotationForPlayer(player: Player): number {
		const edge = this.#getEffectiveEdge(player.edge || 'bottom');
		return TimelineGame.#EDGE_ROTATION[edge];
	}

	/**
	 * Pads the visual center stack to a target depth with placeholder cards.
	 * Sub-cards are face-down decorative duplicates of the top card so we
	 * don't burn real tracks from the generator for purely visual purposes.
	 */
	#restockCenterStack() {
		const targetDepth = 6;
		if (this.centerStack.length === 0) return;
		const placeholderTrack = this.centerStack[0].track;
		while (this.centerStack.length < targetDepth) {
			this.centerStack.push({ track: placeholderTrack, id: this.#newId() });
		}
	}

	// ═══════════════════════════════════════════════════════
	// TRACK SYNCHRONISATION
	// ═══════════════════════════════════════════════════════

	/**
	 * Sync the top of the center stack with the currently-loaded track.
	 *
	 * Called by the component's `$effect` whenever `$tracklist` changes.
	 * Compares by object identity so same-index replacements (e.g. after a
	 * Deezer load failure) are still picked up.
	 */
	syncTopCard(track: Track) {
		if (track === this.#lastSyncedTrack) return;
		this.#lastSyncedTrack = track;

		if (this.centerStack.length === 0) {
			this.centerStack.push({ track, id: this.#newId() });
		} else {
			this.centerStack[0].track = track;
		}

		// New card ⇒ reset local playback flag
		this.hasPlaybackStarted = false;
	}

	// ═══════════════════════════════════════════════════════
	// DEALING / INIT
	// ═══════════════════════════════════════════════════════

	/** Deal initial cards and prepare the game for the first turn. */
	async initGame() {
		if (this.#isInitializing) return;
		this.#isInitializing = true;

		this.isDealing = true;
		this.#lastSyncedTrack = null;

		this.timelines = this.#players.map((p) => ({
			player: p,
			entries: [],
			totalPlacements: 0,
			correctPlacements: 0,
			currentStreak: 0,
			absoluteStreak: 0,
			longestStreak: 0,
			score: 0,
			reachedTarget: false,
			completionBonus: 0,
			initialPartGid: null,
			replayTurns: []
		}));
		this.activePlayerIndex = 0;
		this.endgameActive = false;
		this.lastTurnScoreBreakdown = null;
		this.lastConsolationBreakdown = null;
		this.scoreBeforeTurn = 0;
		this.roundScores = [];
		this.#currentRoundScores = {};
		this.#roundCounter = 0;

		// Sample exactly one track per player for the deal
		const dealTracks: Track[] = [];
		for (let i = 0; i < this.#players.length; i++) {
			const track = this.#ctx.sampleRawTrack();
			if (track) dealTracks.push(track);
		}

		// Seed visual stack with the first deal track
		this.centerStack = [];
		if (dealTracks.length > 0) {
			this.centerStack.push({ track: dealTracks[0], id: this.#newId() });
			this.#restockCenterStack();
		}

		// Let empty timelines render before dealing animation
		await new Promise((r) => setTimeout(r, 500));

		// Animate dealing one card per player
		for (let i = 0; i < dealTracks.length; i++) {
			this.dealingToName = this.timelines[i].player.name;

			if (this.centerStack.length > 0) {
				this.centerStack.shift();
				this.#restockCenterStack();
			}

			const entry: TimelineEntry = {
				id: this.#newId(),
				track: dealTracks[i],
				confirmed: true,
				correct: null,
				isDiscarding: false
			};
			this.timelines[i].entries.push(entry);
			this.timelines[i].initialPartGid = dealTracks[i].part.gid;

			await new Promise((r) => setTimeout(r, 800));
		}

		// Sync top card with the audio-loaded track from the tracklist
		const loadedTrack = this.#getCurrentTrack();
		if (loadedTrack) {
			if (this.centerStack.length > 0) {
				this.centerStack[0].track = loadedTrack;
			} else {
				this.centerStack.push({ track: loadedTrack, id: this.#newId() });
				this.#restockCenterStack();
			}
		}

		this.dealingToName = null;
		this.isDealing = false;
		this.#resetTurnState();
		this.#isInitializing = false;
	}

	// ═══════════════════════════════════════════════════════
	// TURN MANAGEMENT
	// ═══════════════════════════════════════════════════════

	#resetTurnState() {
		this.#clearTimer();
		this.pendingEntryId = null;
		this.resolvingTurn = false;
		this.turnPhase = 'idle';
		this.drag.active = false;
		this.drag.kind = 'none';
		this.drag.track = null;
		this.hasPlaybackStarted = false;
		this.wasStoppedManually = false;
	}

	#rotateToNextPlayer() {
		this.activePlayerIndex = (this.activePlayerIndex + 1) % this.timelines.length;
	}

	async handlePlay() {
		if (!this.topCard || this.resolvingTurn || this.turnPhase === 'locked' || this.showRevealPopup)
			return;

		this.turnPhase = 'playing';
		this.hasPlaybackStarted = true;
		this.#turnStartTime = Date.now();

		try {
			await this.#ctx.playTrack();
		} catch (error) {
			console.error('[TimelineGame] Error playing track:', error);
			// Reset turn phase so the player can retry
			this.turnPhase = 'idle';
			this.hasPlaybackStarted = false;
		}
	}

	handleStop() {
		this.wasStoppedManually = true;
		this.#ctx.stopTrack();
		// isPlaying becomes false via the store; hasPlaybackStarted remains true
		// so the UI transitions to the "Drag" prompt state.
	}

	// ═══════════════════════════════════════════════════════
	// DRAG-AND-DROP
	// ═══════════════════════════════════════════════════════

	startDragFromCenter(ev: PointerEvent) {
		if (!this.canDragCenter || !this.topCard) return;

		this.turnPhase = 'locked';
		this.#initDrag(ev, 'center', this.topCard);
	}

	startDragPending(entryId: string, ev: PointerEvent) {
		if (this.resolvingTurn || this.showRevealPopup) return;
		if (this.pendingEntryId !== entryId) return;

		const entry = this.activePlayer.entries.find((e) => e.id === entryId);
		if (!entry) return;

		this.#initDrag(ev, 'pending', entry.track);
		this.drag.previewEntryId = entryId;
		this.drag.previewInserted = true;

		const el = document.querySelector(`[data-entry-id="${entryId}"]`);
		if (el) {
			this.drag.pendingStartRect = el.getBoundingClientRect();
		}
	}

	// ─── Internal drag plumbing ───────────────────────────

	#initDrag(ev: PointerEvent, kind: DragKind, track: Track) {
		this.drag.active = true;
		this.drag.kind = kind;
		this.drag.track = track;
		this.drag.start = { x: ev.clientX, y: ev.clientY };
		this.drag.current = { x: ev.clientX, y: ev.clientY };
		this.drag.translate = { x: 0, y: 0 };

		const target = ev.currentTarget as HTMLElement | null;
		if (target) {
			const rect = target.getBoundingClientRect();
			this.drag.origin = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
		}

		if (kind === 'center') {
			this.drag.previewEntryId = this.#newId();
			this.drag.previewInserted = false;
		}

		// Use arrow wrappers to preserve `this`
		this.#boundOnDragMove = (ev: PointerEvent) => this.#onDragMove(ev);
		this.#boundOnDragUp = () => this.#onDragUp();

		window.addEventListener('pointermove', this.#boundOnDragMove, { passive: false });
		window.addEventListener('pointerup', this.#boundOnDragUp);
		window.addEventListener('pointercancel', this.#boundOnDragUp);
	}

	#onDragMove(ev: PointerEvent) {
		if (!this.drag.active) return;
		ev.preventDefault();

		this.drag.current = { x: ev.clientX, y: ev.clientY };
		this.drag.translate = {
			x: ev.clientX - this.drag.start.x,
			y: ev.clientY - this.drag.start.y
		};

		const within = this.#isWithinTimeline(ev.clientX, ev.clientY);
		const idx = within ? this.#getInsertionIndex(ev.clientX, ev.clientY) : null;

		if (this.drag.kind === 'center') {
			if (idx == null) {
				this.#removePreviewEntry();
			} else {
				if (!this.drag.previewInserted) this.#insertPreviewEntry(idx);
				else this.#updatePreviewPosition(idx);
			}
		} else if (this.drag.kind === 'pending') {
			if (idx != null) this.#updatePendingPosition(idx);
			this.#measurePendingDragOffset();
		}
	}

	#onDragUp() {
		if (this.#boundOnDragMove) {
			window.removeEventListener('pointermove', this.#boundOnDragMove);
		}
		if (this.#boundOnDragUp) {
			window.removeEventListener('pointerup', this.#boundOnDragUp);
			window.removeEventListener('pointercancel', this.#boundOnDragUp);
		}

		if (!this.drag.active) return;

		const success = this.drag.kind === 'center' && this.drag.previewInserted;
		const droppedId = this.drag.previewEntryId;
		const droppedTrack = this.drag.track;

		if (this.drag.kind === 'center' && !success) {
			this.#removePreviewEntry();
			this.turnPhase = 'playing'; // Unlock if drag failed
		}

		if (success && droppedId && droppedTrack) {
			this.pendingEntryId = droppedId;
			this.centerStack.shift(); // Remove the visual card
		}

		this.drag.active = false;
		this.drag.kind = 'none';
		this.drag.track = null;
		this.drag.previewInserted = false;
		this.drag.previewEntryId = null;
	}

	// ─── Hit testing ──────────────────────────────────────

	#isWithinTimeline(x: number, y: number): boolean {
		if (typeof document === 'undefined') return false;
		return document.elementsFromPoint(x, y).some((el) => el.hasAttribute('data-rotation'));
	}

	#getInsertionIndex(x: number, y: number): number {
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
				if (rotation === -90) {
					if (y > r.top + r.height / 2) return i;
				} else {
					if (y < r.top + r.height / 2) return i;
				}
			} else {
				if (isInvertedHorizontal) {
					if (x > r.left + r.width / 2) return i;
				} else {
					if (x < r.left + r.width / 2) return i;
				}
			}
		}
		return cards.length;
	}

	#getActiveTimelineEntryRect(id: string): DOMRect | null {
		const candidates = Array.from(document.querySelectorAll(`[data-entry-id="${id}"]`));
		if (candidates.length === 0) return null;

		const mx = this.drag.current.x;
		const my = this.drag.current.y;

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

	// ─── Entry manipulation ───────────────────────────────

	#insertPreviewEntry(atIndex: number) {
		if (!this.drag.previewEntryId || !this.drag.track) return;
		const entry: TimelineEntry = {
			id: this.drag.previewEntryId,
			track: this.drag.track,
			confirmed: false,
			correct: null,
			isDiscarding: false
		};
		this.activePlayer.entries.splice(atIndex, 0, entry);
		this.drag.previewInserted = true;
	}

	#removePreviewEntry() {
		if (!this.drag.previewEntryId) return;
		this.activePlayer.entries = this.activePlayer.entries.filter(
			(e) => e.id !== this.drag.previewEntryId
		);
		this.drag.previewInserted = false;
	}

	#updatePreviewPosition(toIndex: number) {
		this.#moveEntryInList(this.drag.previewEntryId!, toIndex);
	}

	#updatePendingPosition(toIndex: number) {
		this.#moveEntryInList(this.pendingEntryId!, toIndex);
	}

	#moveEntryInList(id: string, toIndex: number) {
		const entries = this.activePlayer.entries;
		const from = entries.findIndex((e) => e.id === id);
		if (from < 0) return;
		let to = toIndex;
		if (to > from) to -= 1;
		to = Math.max(0, Math.min(entries.length - 1, to));
		if (from === to) return;
		const [item] = entries.splice(from, 1);
		entries.splice(to, 0, item);
	}

	#measurePendingDragOffset() {
		if (!this.drag.previewEntryId) return;
		requestAnimationFrame(() => {
			const rect = this.#getActiveTimelineEntryRect(this.drag.previewEntryId!);
			if (rect && this.drag.pendingStartRect) {
				this.drag.pendingLayoutOffset = {
					x: rect.left - this.drag.pendingStartRect.left,
					y: rect.top - this.drag.pendingStartRect.top
				};
			}
		});
	}

	// ═══════════════════════════════════════════════════════
	// RESOLUTION
	// ═══════════════════════════════════════════════════════

	#getTimelineYear(track: Track): number {
		return track.work.end_year ?? track.work.begin_year ?? 0;
	}

	async handleConfirmPlacement() {
		if (!this.pendingEntryId) return;
		this.#clearTimer();
		this.resolvingTurn = true;
		this.totalTurns++;
		this.#ctx.stopTrack();

		const entries = this.activePlayer.entries;
		const idx = entries.findIndex((e) => e.id === this.pendingEntryId);
		if (idx < 0) return;

		const track = entries[idx].track;
		const year = this.#getTimelineYear(track);
		const prev = idx > 0 ? this.#getTimelineYear(entries[idx - 1].track) : -Infinity;
		const next =
			idx < entries.length - 1 ? this.#getTimelineYear(entries[idx + 1].track) : Infinity;
		const isCorrect = year >= prev && year <= next;

		entries[idx].confirmed = true;
		entries[idx].correct = isCorrect;

		this.activePlayer.totalPlacements++;

		// Snapshot streak before updating so UI can defer the visual change
		this.preRevealCurrentStreak = this.activePlayer.currentStreak;
		this.preRevealLongestStreak = this.activePlayer.longestStreak;
		this.streakRevealPending = true;

		// ── Scoring ──────────────────────────────────────────
		const secondsTaken = (Date.now() - this.#turnStartTime) / 1000;
		this.scoreBeforeTurn = this.activePlayer.score;
		let placementPoints: number;

		if (isCorrect) {
			this.activePlayer.correctPlacements++;
			this.activePlayer.currentStreak++;
			this.activePlayer.absoluteStreak++;
			if (this.activePlayer.absoluteStreak > this.activePlayer.longestStreak) {
				this.activePlayer.longestStreak = this.activePlayer.absoluteStreak;
			}

			const prevYear = idx > 0 ? this.#getTimelineYear(entries[idx - 1].track) : null;
			const nextYear =
				idx < entries.length - 1 ? this.#getTimelineYear(entries[idx + 1].track) : null;
			const gap = calculateGap(prevYear, nextYear);
			const isEdgePlacement = prevYear === null || nextYear === null;

			const breakdown = calculateTurnScore({
				gap,
				seconds: secondsTaken,
				streak: this.activePlayer.currentStreak,
				isEdgePlacement
			});
			this.lastTurnScoreBreakdown = breakdown;
			this.lastConsolationBreakdown = null;
			this.activePlayer.score += breakdown.score;
			placementPoints = breakdown.score;

			// Check if this player just reached the target (cards on timeline including dealt card)
			const cardsOnTimeline = this.activePlayer.entries.filter(
				(e) => e.confirmed && e.correct !== false
			).length;
			if (cardsOnTimeline >= this.#target && !this.activePlayer.reachedTarget) {
				const completion = calculateCompletion(this.#target, this.activePlayer.totalPlacements);
				this.activePlayer.completionBonus = completion;
				this.activePlayer.score += completion;
				this.activePlayer.reachedTarget = true;
			}
		} else {
			// Soft decay: Min(½, −3) — drop to min(streak//2, streak−3), floor 0 for multiplier tier
			const s = this.activePlayer.currentStreak;
			this.activePlayer.currentStreak = Math.max(0, Math.min(Math.floor(s / 2), s - 3));
			this.activePlayer.absoluteStreak = 0;
			this.lastTurnScoreBreakdown = null;

			// Consolation: find the correct slot (excluding the misplaced card)
			const otherEntries = entries.filter((_, i) => i !== idx);
			let correctLeftYear: number | null = null;
			let correctRightYear: number | null = null;
			for (let j = 0; j <= otherEntries.length; j++) {
				const leftY = j > 0 ? this.#getTimelineYear(otherEntries[j - 1].track) : -Infinity;
				const rightY =
					j < otherEntries.length ? this.#getTimelineYear(otherEntries[j].track) : Infinity;
				if (year >= leftY && year <= rightY) {
					correctLeftYear = j > 0 ? leftY : null;
					correctRightYear = j < otherEntries.length ? rightY : null;
					break;
				}
			}
			const consolation = calculateConsolationScore(
				year,
				correctLeftYear,
				correctRightYear,
				this.#target,
				this.activePlayer.totalPlacements
			);
			this.lastConsolationBreakdown = consolation;
			this.activePlayer.score += consolation.consolation;
			placementPoints = consolation.consolation;
		}

		// Track per-round scores for the stats graph
		const scoreDelta = this.activePlayer.score - this.scoreBeforeTurn;
		this.activePlayer.replayTurns.push({
			part: track.part.gid,
			index: idx,
			ok: isCorrect,
			seconds: Math.round(secondsTaken * 10) / 10,
			points: Math.round(placementPoints),
			streak: this.activePlayer.absoluteStreak,
			score: Math.round(this.activePlayer.score)
		});
		this.#currentRoundScores[this.activePlayer.player.name] =
			(this.#currentRoundScores[this.activePlayer.player.name] ?? 0) + scoreDelta;

		// Log placement to analytics (enhanced with scoring data)
		const scoreBreakdown = this.lastTurnScoreBreakdown;
		const consolationBreakdown = this.lastConsolationBreakdown;
		import('$lib/game-logger')
			.then(({ analytics }) => {
				analytics.logPlacement(track.work.gid, track.part.gid, isCorrect, {
					turnScore: scoreBreakdown?.score ?? consolationBreakdown?.consolation ?? 0,
					secondsTaken,
					streakCount: this.activePlayer.currentStreak,
					gap: scoreBreakdown?.gap ?? consolationBreakdown?.dErr ?? 0
				});
				analytics.updateProgress({
					numberOfTurns: this.totalTurns,
					players: this.playerStats
				});
			})
			.catch(() => {});

		const audio = isCorrect ? new Audio('/correct.mp3') : new Audio('/wrong.mp3');
		audio.play().catch(() => {});

		// Determine if endgame should trigger
		const reachedWin = isCorrect && this.activePlayer.reachedTarget;

		this.revealEntryId = entries[idx].id;
		this.revealTrack = track;
		this.revealIsCorrect = isCorrect;
		this.revealPurpose = 'turn';
		this.revealReachedWin = reachedWin;
		this.pendingEntryId = null;
		this.popupRotation = this.#getRotationForPlayer(this.activePlayer.player);

		// Activate endgame trigger (multiplayer: round must finish first)
		if (reachedWin && !this.endgameActive) {
			this.endgameActive = true;
			if (!this.#isSoloMode) {
				this.#pendingEndgameFlash = true;
			}
		}

		// Show streak flash immediately (appears on top of popup)
		if (isCorrect && this.activePlayer.currentStreak >= STREAK_THRESHOLD) {
			this.streakFlash = {
				playerName: this.activePlayer.player.name,
				streak: this.activePlayer.currentStreak,
				rotation: this.popupRotation
			};
		}

		this.showRevealPopup = true;
	}

	/**
	 * Close the reveal popup and advance the game.
	 *
	 * Guarded against re-entrant calls (e.g. mobile double-tap during
	 * the popup out-transition). Captures all reveal state upfront so
	 * setTimeout callbacks don't read stale reactive state.
	 */
	handleCloseRevealPopup() {
		if (this.#isClosingRevealPopup) return;
		this.#isClosingRevealPopup = true;

		this.showRevealPopup = false;
		// Dismiss streak flash immediately (it was shown on top of popup)
		this.streakFlash = null;

		// Snapshot reveal state before async delays
		const wasWrong = this.revealIsCorrect === false;
		const entryId = this.revealEntryId;
		const purpose = this.revealPurpose;
		const reachedWin = this.revealReachedWin;
		const shouldFlashEndgame = this.#pendingEndgameFlash;
		this.#pendingEndgameFlash = false;

		if (purpose === 'turn') {
			this.#ctx.nextRound().catch((error) => {
				console.error('[TimelineGame] Error advancing to next round:', error);
			});
		}

		setTimeout(() => {
			if (purpose === 'inspect') {
				this.#clearRevealState();
				this.#isClosingRevealPopup = false;
				return;
			}

			// Fire deferred endgame flash now that popup + streak flash are gone
			if (shouldFlashEndgame) {
				this.endgameFlash = true;
			}

			// Reveal deferred streak visuals
			this.streakRevealPending = false;

			if (reachedWin && this.#isSoloMode) {
				// Solo mode: end immediately, no round to complete
				this.#clearRevealState();
				this.#endGameNow();
				this.#isClosingRevealPopup = false;
				return;
			}

			// Multiplayer endgame: round continues via #finalizeTurn() which
			// checks endgameActive and ends when the round completes.

			if (wasWrong && entryId) {
				const entry = this.activePlayer.entries.find((e) => e.id === entryId);
				if (entry) {
					entry.isDiscarding = true;
					setTimeout(() => {
						this.activePlayer.entries = this.activePlayer.entries.filter((e) => e.id !== entryId);
						this.#finalizeTurn();
						this.#isClosingRevealPopup = false;
					}, 600);
					this.#clearRevealState();
					return;
				}
			}

			this.#clearRevealState();
			this.#finalizeTurn();
			this.#isClosingRevealPopup = false;
		}, 300);
	}

	#finalizeTurn() {
		this.activePlayer.entries.forEach((e) => {
			e.correct = null;
		});

		this.#rotateToNextPlayer();

		// If we've completed a full round (back to player 0), commit round scores
		if (this.activePlayerIndex === 0) {
			this.roundScores.push({
				roundIndex: this.#roundCounter,
				playerScores: { ...this.#currentRoundScores }
			});
			this.#currentRoundScores = {};
			this.#roundCounter++;
		}

		// Endgame check: if the round is now complete, end the game.
		// The round is complete when we've rotated back to the starting player.
		if (this.endgameActive && this.activePlayerIndex === 0) {
			this.#endGameNow();
			return;
		}

		// Safety-net sync: ensure centerStack[0] reflects the current track.
		// The component's $effect normally handles this, but if the identity
		// guard was already satisfied by a prior run this guarantees the
		// visual card metadata stays in sync with audio.
		const track = this.#getCurrentTrack();
		if (track) {
			this.#lastSyncedTrack = track;
			if (this.centerStack.length > 0) {
				this.centerStack[0].track = track;
			} else {
				this.centerStack.push({ track, id: this.#newId() });
			}
		}

		this.#restockCenterStack();
		this.#resetTurnState();
	}

	/** End the game, send analytics, and show the end screen. */
	#endGameNow() {
		// Flush any incomplete round scores
		if (Object.keys(this.#currentRoundScores).length > 0) {
			this.roundScores.push({
				roundIndex: this.#roundCounter,
				playerScores: { ...this.#currentRoundScores }
			});
			this.#currentRoundScores = {};
		}

		// Capture session ID before endGame() clears it — needed for leaderboard submission.
		// Eagerly send game_end so the event isn't lost if the tab closes.
		import('$lib/game-logger')
			.then(({ analytics }) => {
				this.endgameSessionId = analytics.getSessionId();
				analytics.endGame('completed', {
					numberOfTurns: this.totalTurns,
					players: this.playerStats,
					scores: this.timelines.map((t) => ({
						score: t.score,
						completionBonus: t.completionBonus
					}))
				});
			})
			.catch(() => {})
			.finally(() => {
				this.showEndGame = true;
			});
	}

	/** Called by FlashingText onComplete — clears flash (turn already finalized). */
	handleStreakFlashComplete() {
		this.streakFlash = null;
	}

	#clearRevealState() {
		this.revealEntryId = null;
		this.revealTrack = null;
		this.revealIsCorrect = null;
		this.revealPurpose = 'turn';
		this.revealReachedWin = false;
	}

	openInspectCard(entryId: string, track: Track, rotation: number = 0) {
		if (this.drag.active || this.resolvingTurn || this.pendingEntryId) return;
		this.revealEntryId = entryId;
		this.revealTrack = track;
		this.revealPurpose = 'inspect';
		this.popupRotation = rotation;
		this.showRevealPopup = true;
	}

	// ═══════════════════════════════════════════════════════
	// PLAYBACK TIMER
	// ═══════════════════════════════════════════════════════

	/** Start the post-playback countdown. No-op if already running. */
	startPlaybackTimer() {
		if (this.timerSeconds !== null || this.resolvingTurn || this.showRevealPopup) return;
		this.timerSeconds = TimelineGame.#TIMER_DURATION;
		this.#timerInterval = setInterval(() => this.#tickTimer(), 1000);
	}

	#tickTimer() {
		if (this.timerSeconds === null) return;
		this.timerSeconds--;
		if (this.timerSeconds <= 0) {
			this.#handleTimeout();
		}
	}

	#handleTimeout() {
		this.#clearTimer();
		this.resolvingTurn = true;
		this.#ctx.stopTrack();

		const audio = new Audio('/wrong.mp3');
		audio.play().catch(() => {});

		this.scoreBeforeTurn = this.activePlayer.score;
		this.totalTurns++;
		this.activePlayer.totalPlacements++;

		// Snapshot streak before applying soft decay
		this.preRevealCurrentStreak = this.activePlayer.currentStreak;
		this.preRevealLongestStreak = this.activePlayer.longestStreak;
		this.streakRevealPending = true;
		const s = this.activePlayer.currentStreak;
		this.activePlayer.currentStreak = Math.max(0, Math.min(Math.floor(s / 2), s - 3));
		this.lastTurnScoreBreakdown = null;
		this.lastConsolationBreakdown = null;
		const secondsTaken = this.#turnStartTime > 0 ? (Date.now() - this.#turnStartTime) / 1000 : null;

		if (this.pendingEntryId) {
			// Card was placed in the timeline — mark it wrong and show reveal
			const entries = this.activePlayer.entries;
			const idx = entries.findIndex((e) => e.id === this.pendingEntryId);
			if (idx >= 0) {
				entries[idx].confirmed = true;
				entries[idx].correct = false;
				this.activePlayer.replayTurns.push({
					part: entries[idx].track.part.gid,
					index: idx,
					ok: false,
					seconds: secondsTaken === null ? null : Math.round(secondsTaken * 10) / 10,
					points: 0,
					streak: 0,
					score: Math.round(this.activePlayer.score)
				});

				this.revealEntryId = entries[idx].id;
				this.revealTrack = entries[idx].track;
				this.revealIsCorrect = false;
				this.revealPurpose = 'turn';
				this.revealReachedWin = false;
				this.popupRotation = this.#getRotationForPlayer(this.activePlayer.player);
				this.pendingEntryId = null;
				this.showRevealPopup = true;
				return;
			}
		}

		// No card placed — show reveal popup for the forfeited track
		const currentTrack = this.#getCurrentTrack();
		if (currentTrack) {
			this.activePlayer.replayTurns.push({
				part: currentTrack.part.gid,
				index: null,
				ok: false,
				seconds: secondsTaken === null ? null : Math.round(secondsTaken * 10) / 10,
				points: 0,
				streak: 0,
				score: Math.round(this.activePlayer.score)
			});
			this.revealEntryId = null;
			this.revealTrack = currentTrack;
			this.revealIsCorrect = false;
			this.revealPurpose = 'turn';
			this.revealReachedWin = false;
			this.popupRotation = this.#getRotationForPlayer(this.activePlayer.player);
			this.showRevealPopup = true;
			return;
		}

		// Fallback: no track available — just advance
		this.streakRevealPending = false;
		this.#finalizeTurn();
		this.resolvingTurn = false;
	}

	#clearTimer() {
		if (this.#timerInterval) {
			clearInterval(this.#timerInterval);
			this.#timerInterval = null;
		}
		this.timerSeconds = null;
	}

	/** Clean up any window-level event listeners (e.g. from an in-progress drag). */
	destroy() {
		this.#clearTimer();
		if (this.#boundOnDragMove) {
			window.removeEventListener('pointermove', this.#boundOnDragMove);
			this.#boundOnDragMove = null;
		}
		if (this.#boundOnDragUp) {
			window.removeEventListener('pointerup', this.#boundOnDragUp);
			window.removeEventListener('pointercancel', this.#boundOnDragUp);
			this.#boundOnDragUp = null;
		}
	}
}
