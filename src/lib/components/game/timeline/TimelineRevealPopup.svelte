<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { fly, fade, slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount, tick } from 'svelte';
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import TrackInfo from '$lib/components/ui/gameplay/TrackInfo.svelte';
	import type { Track } from '$lib/models';
	import type { TurnScoreBreakdown } from '$lib/logic/timelineTypes';
	import Flame from 'lucide-svelte/icons/flame';
	import Sparkles from 'lucide-svelte/icons/sparkles';
	import Trophy from 'lucide-svelte/icons/trophy';
	import { ArrowRight, Zap } from 'lucide-svelte';

	interface Props {
		visible?: boolean;
		track?: Track | null;
		yearText?: string;
		isCorrect?: boolean | null;
		purpose?: 'turn' | 'inspect';
		scoreBreakdown?: TurnScoreBreakdown | null;
		consolationScore?: number;
		completionBonus?: number;
		reachedTarget?: boolean;
		isFlawlessGame?: boolean;
		scoreBeforeTurn?: number;
		rotation?: number;
		onClose?: () => void;
	}

	let {
		visible = false,
		track = null,
		yearText = '',
		isCorrect = null,
		purpose = 'turn',
		scoreBreakdown = null,
		consolationScore = 0,
		completionBonus = 0,
		reachedTarget = false,
		isFlawlessGame = false,
		scoreBeforeTurn = 0,
		rotation = 0,
		onClose = () => {}
	}: Props = $props();

	// ─── Animated counters ─────────────────────────────────
	let displayedValues = $state<Record<string, number>>({});
	let displayedTurnTotal = $state(0);
	let displayedScore = $state(0);
	let scoreOpacity = $state(0.3);
	let turnTotalOpacity = $state(1);
	let animationsFinished = $state(false);
	// Track which rows have started animating (for fade-in of multipliers)
	let rowVisible = $state<Record<string, boolean>>({});
	let animFrame: number | null = null;
	let pendingTimeouts: ReturnType<typeof setTimeout>[] = [];
	let scoreTableEl: HTMLDivElement | undefined = $state();

	function clearAllTimers() {
		pendingTimeouts.forEach((id) => clearTimeout(id));
		pendingTimeouts = [];
		if (animFrame) {
			cancelAnimationFrame(animFrame);
			animFrame = null;
		}
	}

	function scheduleTimeout(fn: () => void, delay: number) {
		const id = setTimeout(fn, delay);
		pendingTimeouts.push(id);
		return id;
	}

	/** Smoothly scroll to bottom, optionally following a growing container. */
	function scrollToBottom(duration: number = 600, follow: boolean = false) {
		if (!scoreTableEl) return;
		const scrollParent = scoreTableEl.closest('.overflow-y-auto') ?? scoreTableEl.parentElement;
		if (!scrollParent) return;

		const start = performance.now();
		const startScroll = scrollParent.scrollTop;

		function step(now: number) {
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			const eased = 1 - Math.pow(1 - progress, 3);

			// Re-calculate target in every step if we are following a growing element
			const targetScroll = scrollParent!.scrollHeight - scrollParent!.clientHeight;
			const delta = targetScroll - startScroll;

			if (delta > 0) {
				scrollParent!.scrollTop = startScroll + delta * eased;
			}

			if (progress < 1 || (follow && elapsed < duration + 100)) {
				animFrame = requestAnimationFrame(step);
			}
		}
		animFrame = requestAnimationFrame(step);
	}

	$effect(() => {
		if (visible && isCorrect && scoreBreakdown) {
			clearAllTimers();
			const turnTotal = scoreBreakdown.score + completionBonus;
			displayedValues = {};
			displayedTurnTotal = 0;
			displayedScore = scoreBeforeTurn;
			scoreOpacity = 0.3;
			turnTotalOpacity = 1;
			rowVisible = {};
			animationsFinished = false;

			scheduleTimeout(() => {
				scrollToBottom();

				// Phase 1: Count up point rows (base, difficulty)
				const startTime = performance.now();
				const pointDuration = 1200;
				const pointTargets: Record<string, number> = {
					base: scoreBreakdown!.base,
					difficulty: scoreBreakdown!.diff
				};
				const pointStagger: Record<string, number> = {
					base: 0,
					difficulty: 300
				};

				// Schedule speed & streak to appear while point rows are still counting
				scheduleTimeout(() => {
					rowVisible.speed = true;
					rowVisible = rowVisible;
					displayedValues = { ...displayedValues, speed: scoreBreakdown!.speed };
				}, 900);
				scheduleTimeout(() => {
					rowVisible.streak = true;
					rowVisible = rowVisible;
					displayedValues = { ...displayedValues, streak: scoreBreakdown!.streakMult };
				}, 1200);

				function tickPoints(now: number) {
					const elapsed = now - startTime;
					const vals: Record<string, number> = { ...displayedValues };
					let allDone = true;
					for (const [key, target] of Object.entries(pointTargets)) {
						const offset = pointStagger[key] ?? 0;
						const localElapsed = Math.max(0, elapsed - offset);
						const progress = Math.min(localElapsed / pointDuration, 1);
						const eased = 1 - Math.pow(1 - progress, 3);
						if (localElapsed > 0 && !rowVisible[key]) {
							rowVisible[key] = true;
							rowVisible = rowVisible;
						}
						vals[key] = target * eased;
						if (progress < 1) allDone = false;
					}
					displayedValues = vals;
					if (!allDone) {
						animFrame = requestAnimationFrame(tickPoints);
					} else {
						// Point rows done — proceed to completion bonus or totals
						const hasCompletion = reachedTarget && completionBonus > 0;

						if (hasCompletion) {
							// Brief pause then completion bonus
							scheduleTimeout(() => {
								rowVisible.completion = true;
								rowVisible = rowVisible;
								// Count up completion bonus
								const compStart = performance.now();
								const compDuration = 1200;
								function tickCompletion(now: number) {
									const elapsed = now - compStart;
									const progress = Math.min(elapsed / compDuration, 1);
									const eased = 1 - Math.pow(1 - progress, 3);
									displayedValues = { ...displayedValues, completion: completionBonus * eased };
									if (progress < 1) {
										animFrame = requestAnimationFrame(tickCompletion);
									} else {
										showTotals();
									}
								}
								animFrame = requestAnimationFrame(tickCompletion);
							}, 300);
						} else {
							showTotals();
						}
					}
				}

				function showTotals() {
					// Phase 3: Show turnTotal immediately, then score after pause
					rowVisible.turnTotal = true;
					rowVisible = rowVisible;
					displayedTurnTotal = turnTotal;
					// Phase 4: Count up score with opacity transitions
					scheduleTimeout(() => {
						const countStart = performance.now();
						const countDuration = 600;
						function countTick(now: number) {
							const elapsed = now - countStart;
							const progress = Math.min(elapsed / countDuration, 1);
							const eased = 1 - Math.pow(1 - progress, 3);
							displayedScore = Math.round(scoreBeforeTurn + turnTotal * eased);
							scoreOpacity = 0.3 + 0.7 * eased;
							turnTotalOpacity = 1 - 0.6 * eased;
							if (progress < 1) {
								animFrame = requestAnimationFrame(countTick);
							} else {
								animationsFinished = true;
							}
						}
						animFrame = requestAnimationFrame(countTick);
					}, 900);
				}

				animFrame = requestAnimationFrame(tickPoints);
			}, 350);
		} else if (visible && isCorrect === false) {
			clearAllTimers();
			displayedValues = {};
			displayedTurnTotal = 0;
			displayedScore = scoreBeforeTurn;
			scoreOpacity = 0.3;
			turnTotalOpacity = 1;
			rowVisible = {};
			animationsFinished = false;

			const turnTotal = consolationScore;

			if (turnTotal > 0) {
				// Phase 1: Count up consolation points
				scheduleTimeout(() => {
					rowVisible.consolation = true;
					rowVisible = rowVisible;
					const startTime = performance.now();
					const countDuration = 800;
					function tickConsolation(now: number) {
						const elapsed = now - startTime;
						const progress = Math.min(elapsed / countDuration, 1);
						const eased = 1 - Math.pow(1 - progress, 3);
						displayedValues = { ...displayedValues, consolation: turnTotal * eased };
						if (progress < 1) {
							animFrame = requestAnimationFrame(tickConsolation);
						} else {
							// Phase 2: Show turn total
							rowVisible.turnTotal = true;
							rowVisible = rowVisible;
							displayedTurnTotal = turnTotal;
							// Phase 3: Count up score with crossfade
							scheduleTimeout(() => {
								const countStart = performance.now();
								const scoreDuration = 600;
								function countTick(now: number) {
									const elapsed = now - countStart;
									const progress = Math.min(elapsed / scoreDuration, 1);
									const eased = 1 - Math.pow(1 - progress, 3);
									displayedScore = Math.round(scoreBeforeTurn + turnTotal * eased);
									scoreOpacity = 0.3 + 0.7 * eased;
									turnTotalOpacity = 1 - 0.6 * eased;
									if (progress < 1) {
										animFrame = requestAnimationFrame(countTick);
									} else {
										animationsFinished = true;
									}
								}
								animFrame = requestAnimationFrame(countTick);
							}, 800);
						}
					}
					animFrame = requestAnimationFrame(tickConsolation);
				}, 350);
			} else {
				displayedScore = scoreBeforeTurn;
				scoreOpacity = 1;
				animationsFinished = true;
			}
		} else {
			displayedValues = {};
			displayedTurnTotal = 0;
			displayedScore = 0;
			scoreOpacity = 0.3;
			turnTotalOpacity = 1;
			rowVisible = {};
			animationsFinished = false;
			clearAllTimers();
		}
	});

	// Smoothly scroll to bottom when animations finish and button appears
	$effect(() => {
		if (animationsFinished && visible && purpose === 'turn') {
			tick().then(() => {
				// Duration matches the slide transition (400ms) + buffer
				scrollToBottom(500, true);
			});
		}
	});

	onMount(() => {
		return () => {
			clearAllTimers();
		};
	});

	const borderColor = $derived(
		reachedTarget && isCorrect
			? 'border-amber-400'
			: isCorrect === true
				? 'border-green-400'
				: isCorrect === false
					? 'border-red-400'
					: 'border-cyan-400'
	);
	const shadowColor = $derived(
		reachedTarget && isCorrect
			? 'rgba(251,191,36,0.3)'
			: isCorrect === true
				? 'rgba(74,222,128,0.3)'
				: isCorrect === false
					? 'rgba(248,113,113,0.3)'
					: 'rgba(34,211,238,0.3)'
	);

	function fmtNum(n: number | undefined): string {
		return Math.round(n ?? 0).toLocaleString();
	}
	function fmtMult(n: number | undefined): string {
		return (n ?? 1).toFixed(2) + '×';
	}
	function fmtSeconds(n: number | undefined): string {
		return `${(n ?? 0).toFixed(1)}s`;
	}
</script>

<Popup
	{visible}
	onClose={() => onClose()}
	width="w-[520px] max-w-[92vw]"
	{borderColor}
	{shadowColor}
	{rotation}
>
	{#if track}
		<div class="flex h-full w-full flex-col gap-4">
			<div class="text-center text-5xl font-black tracking-wide text-slate-200">{yearText}</div>
			<div
				class="min-h-0 overflow-hidden rounded-2xl border border-slate-700/50 bg-slate-950/30 p-3"
			>
				<TrackInfo
					{track}
					bleed="sm"
					showMirror={false}
					fixedWidth={true}
					showTimelineStats={true}
				/>
			</div>

			{#if purpose === 'turn' && isCorrect && scoreBreakdown}
				<div
					bind:this={scoreTableEl}
					class="flex flex-col gap-1 rounded-xl border border-slate-700/40 bg-slate-900/60 px-4 py-3"
				>
					<!-- Point-based rows -->
					<!-- Base -->
					<div
						class="flex items-center justify-between text-sm"
						in:fly={{ y: 10, duration: 300, delay: 0, easing: cubicOut }}
					>
						<span class="text-slate-400">{$_('timeline.scoring.base')}</span>
						<span class="font-bold text-slate-200 tabular-nums"
							>{$_('scoring.pts', { values: { points: fmtNum(displayedValues.base) } })}</span
						>
					</div>

					<!-- Difficulty -->
					<div
						class="flex items-center justify-between text-sm"
						in:fly={{ y: 10, duration: 300, delay: 80, easing: cubicOut }}
					>
						<span class="text-slate-400">{$_('timeline.scoring.difficulty')}</span>
						<span class="font-bold text-green-400 tabular-nums"
							>+{$_('scoring.pts', {
								values: { points: fmtNum(displayedValues.difficulty) }
							})}</span
						>
					</div>

					<!-- Separator: point-based ↔ multiplier-based -->
					<div
						class="my-0.5 border-t border-dashed border-slate-700/30"
						in:fly={{ y: 10, duration: 200, delay: 160, easing: cubicOut }}
					></div>

					<!-- Speed (fade in, no number count-up) -->
					<div
						class="flex items-center justify-between text-sm"
						in:fly={{ y: 10, duration: 300, delay: 240, easing: cubicOut }}
					>
						<span class="flex items-center gap-1 text-slate-400">
							<Zap class="h-3.5 w-3.5 text-cyan-400" />
							{$_('timeline.scoring.speed')}
							<span class="ml-1 flex items-center text-[0.7rem] text-slate-500">
								(<span class="tabular-nums">{fmtSeconds(scoreBreakdown.seconds)}</span>)
							</span>
						</span>
						{#if rowVisible.speed}
							<span class="font-bold text-cyan-400 tabular-nums" in:fade={{ duration: 500 }}
								>{fmtMult(displayedValues.speed)}</span
							>
						{/if}
					</div>

					<!-- Streak (fade in, no number count-up) -->
					<div
						class="flex items-center justify-between text-sm"
						in:fly={{ y: 10, duration: 300, delay: 320, easing: cubicOut }}
					>
						<span
							class="flex items-center gap-1 {scoreBreakdown.streak >= 3
								? 'text-orange-400'
								: 'text-slate-400'}"
						>
							<Flame
								class="h-3.5 w-3.5 {scoreBreakdown.streak >= 3
									? 'text-orange-400'
									: 'text-slate-500'}"
							/>
							{$_('timeline.scoring.streak')}
						</span>
						{#if rowVisible.streak}
							<span
								class="font-bold tabular-nums {scoreBreakdown.streakMult > 1
									? 'text-orange-400'
									: 'text-slate-300'}"
								in:fade={{ duration: 500 }}>{fmtMult(displayedValues.streak)}</span
							>
						{/if}
					</div>

					<div
						class="my-1 border-t border-slate-700/60"
						in:fly={{ y: 10, duration: 200, delay: 400, easing: cubicOut }}
					></div>

					<!-- Completion Bonus (reserves space, content fades in) -->
					{#if reachedTarget && completionBonus > 0}
						<div
							class="flex items-center justify-between text-sm"
							style="opacity: {rowVisible.completion ? 1 : 0}; transition: opacity 400ms;"
						>
							<span class="flex items-center gap-1 font-bold text-amber-400">
								{#if isFlawlessGame}
									<Sparkles class="h-3.5 w-3.5" />
									{$_('timeline.scoring.flawlessGame')}
								{:else}
									<Trophy class="h-3.5 w-3.5" />
									{$_('timeline.scoring.completionBonus')}
								{/if}
							</span>
							<span class="font-bold text-amber-400 tabular-nums"
								>+{$_('scoring.pts', {
									values: { points: fmtNum(displayedValues.completion) }
								})}</span
							>
						</div>
					{/if}

					<!-- Turn Total -->
					<div
						class="flex items-center justify-between text-sm"
						style="opacity: {turnTotalOpacity};"
					>
						<span class="font-bold text-slate-200">{$_('timeline.scoring.turnTotal')}</span>
						<span
							class="font-bold text-slate-200 tabular-nums transition-opacity duration-300"
							style="opacity: {rowVisible.turnTotal ? 1 : 0};"
						>
							+{$_('scoring.pts', { values: { points: displayedTurnTotal.toLocaleString() } })}
						</span>
					</div>

					<!-- Total Score -->
					<div class="flex items-center justify-between" style="opacity: {scoreOpacity};">
						<span class="text-base font-bold text-slate-200">{$_('timeline.scoring.score')}</span>
						<span
							class="font-black text-cyan-400 tabular-nums transition-opacity duration-300"
							style="opacity: {rowVisible.turnTotal ? 1 : 0};"
						>
							{$_('scoring.pts', {
								values: { points: Math.round(displayedScore).toLocaleString() }
							})}
						</span>
					</div>
				</div>
			{/if}

			<!-- Wrong Placement / Forfeit -->
			{#if purpose === 'turn' && isCorrect === false}
				<div
					bind:this={scoreTableEl}
					class="flex flex-col gap-1.5 rounded-xl border border-slate-700/40 bg-slate-900/60 px-4 py-3"
					in:fly={{ y: 10, duration: 300, easing: cubicOut }}
				>
					<!-- Consolation row -->
					{#if rowVisible.consolation}
						<div transition:slide={{ duration: 400, easing: cubicOut }}>
							<div class="flex items-center justify-between text-sm">
								<span class="font-bold text-yellow-700">{$_('timeline.scoring.consolation')}</span>
								<span class="font-bold text-yellow-700 tabular-nums"
									>+{$_('scoring.pts', {
										values: { points: fmtNum(displayedValues.consolation) }
									})}</span
								>
							</div>

							<div class="my-0.5 border-t border-slate-700/60"></div>
						</div>
					{/if}

					<!-- Turn Total -->
					<div
						class="flex items-center justify-between text-sm"
						style="opacity: {turnTotalOpacity};"
					>
						<span class="font-bold text-slate-200">{$_('timeline.scoring.turnTotal')}</span>
						<span
							class="font-bold tabular-nums transition-all duration-300 {rowVisible.turnTotal
								? 'text-slate-200'
								: 'text-red-400'}"
						>
							+{$_('scoring.pts', {
								values: { points: (rowVisible.turnTotal ? displayedTurnTotal : 0).toLocaleString() }
							})}
						</span>
					</div>

					<!-- Total Score -->
					<div class="flex items-center justify-between" style="opacity: {scoreOpacity};">
						<span class="text-base font-bold text-slate-200">{$_('timeline.scoring.score')}</span>
						<span class="font-black text-cyan-400 tabular-nums">
							{$_('scoring.pts', {
								values: { points: Math.round(displayedScore).toLocaleString() }
							})}
						</span>
					</div>
				</div>
			{/if}

			<!-- Continue Button (animates in when finished, scrolls into view) -->
			{#if purpose === 'turn' && animationsFinished}
				<div transition:slide={{ duration: 400, easing: cubicOut }}>
					<button
						type="button"
						onclick={() => onClose()}
						class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 font-bold text-cyan-400 transition-all duration-200 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]"
					>
						{$_('scoring.continue')}
						<ArrowRight class="h-5 w-5" />
					</button>
				</div>
			{/if}
		</div>
	{/if}
</Popup>
