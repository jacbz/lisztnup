<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Popup from '../primitives/Popup.svelte';
	import type { Player, RoundScore } from '$lib/types';

	interface Props {
		visible?: boolean;
		players?: Player[];
		rounds?: RoundScore[];
		onClose?: () => void;
	}

	let { visible = false, players = [], rounds = [], onClose = () => {} }: Props = $props();

	// Calculate cumulative scores for each player over rounds
	const chartData = $derived.by(() => {
		if (players.length === 0 || rounds.length === 0) return null;

		const playerCumulativeScores = players.map((player) => ({
			player,
			scores: [0] // Start at 0
		}));

		// Build cumulative scores (using name as identifier)
		rounds.forEach((round) => {
			playerCumulativeScores.forEach((data) => {
				const previousScore = data.scores[data.scores.length - 1];
				const roundScore = round.playerScores[data.player.name] || 0;
				data.scores.push(previousScore + roundScore);
			});
		});

		return playerCumulativeScores;
	});

	// Calculate chart dimensions
	const maxScore = $derived.by(() => {
		if (!chartData) return 100;
		return Math.max(...chartData.flatMap((d) => d.scores), 50);
	});

	const minScore = $derived.by(() => {
		if (!chartData) return 0;
		return Math.min(...chartData.flatMap((d) => d.scores), 0);
	});

	const scoreRange = $derived(maxScore - minScore);
	const chartHeight = 300;
	const chartWidth = 600;
	const padding = { top: 20, right: 40, bottom: 40, left: 50 };

	function getX(index: number, totalPoints: number): number {
		const chartW = chartWidth - padding.left - padding.right;
		return padding.left + (index / (totalPoints - 1)) * chartW;
	}

	function getY(score: number): number {
		const chartH = chartHeight - padding.top - padding.bottom;
		const normalized = (score - minScore) / scoreRange;
		return padding.top + chartH - normalized * chartH;
	}

	function createPath(scores: number[]): string {
		if (scores.length === 0) return '';

		const points = scores.map((score, i) => {
			const x = getX(i, scores.length);
			const y = getY(score);
			return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
		});

		return points.join(' ');
	}
</script>

<Popup {visible} {onClose}>
	{#snippet children()}
		<div
			class="max-h-[85vh] w-[700px] max-w-[90vw] overflow-y-auto rounded-3xl border-2 border-cyan-400 bg-gray-900 p-8 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<h2 class="mb-6 text-center text-3xl font-bold text-cyan-400">
				{$_('stats.title')}
			</h2>

			{#if chartData && chartData.length > 0}
				<!-- Chart -->
				<div class="mb-6 overflow-x-auto rounded-xl bg-gray-800 p-5">
					<svg width={chartWidth} height={chartHeight} class="mx-auto block">
						<!-- Grid lines -->
						<g class="grid-lines">
							{#each Array(5) as _, i}
								{@const score = minScore + (scoreRange / 4) * i}
								{@const y = getY(score)}
								<line
									x1={padding.left}
									y1={y}
									x2={chartWidth - padding.right}
									y2={y}
									stroke="#374151"
									stroke-width="1"
									stroke-dasharray="4 4"
								/>
								<text
									x={padding.left - 10}
									y={y + 5}
									class="fill-gray-400 text-xs"
									text-anchor="end"
								>
									{Math.round(score)}
								</text>
							{/each}
						</g>

						<!-- X-axis labels (rounds) -->
						<g class="x-axis">
							{#each Array(rounds.length + 1) as _, i}
								{@const x = getX(i, rounds.length + 1)}
								<text
									{x}
									y={chartHeight - padding.bottom + 20}
									class="fill-gray-400 text-xs"
									text-anchor="middle"
								>
									{i}
								</text>
							{/each}
							<text
								x={chartWidth / 2}
								y={chartHeight - 5}
								class="fill-gray-300 text-sm font-semibold"
								text-anchor="middle"
							>
								{$_('stats.round')}
							</text>
						</g>

						<!-- Player lines -->
						{#each chartData as { player, scores }}
							<path
								d={createPath(scores)}
								fill="none"
								stroke={player.color}
								stroke-width="3"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="transition-[stroke-width] duration-200 hover:stroke-5"
							/>

							<!-- Points -->
							{#each scores as score, i}
								<circle
									cx={getX(i, scores.length)}
									cy={getY(score)}
									r="4"
									fill={player.color}
									stroke="white"
									stroke-width="2"
									class="hover:r-[6] cursor-pointer transition-[r] duration-200"
								/>
							{/each}
						{/each}
					</svg>
				</div>

				<!-- Legend -->
				<div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
					{#each chartData as { player, scores }}
						<div class="flex items-center gap-2 rounded-lg bg-gray-700 p-2">
							<div
								class="h-5 w-5 shrink-0 rounded-full"
								style="background-color: {player.color};"
							></div>
							<span class="flex-1 text-sm font-semibold text-white">{player.name}</span>
							<span class="text-sm font-bold text-cyan-400"
								>{$_('scoring.pts', { values: { points: scores[scores.length - 1] } })}</span
							>
						</div>
					{/each}
				</div>
			{:else}
				<p class="py-12 text-center text-lg text-gray-400">
					{$_('stats.noData')}
				</p>
			{/if}

			<!-- Close Button -->
			<div class="mt-6">
				<button
					type="button"
					onclick={onClose}
					class="w-full cursor-pointer rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3.5 text-base font-bold text-cyan-400 transition-all duration-200 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
				>
					{$_('stats.close')}
				</button>
			</div>
		</div>
	{/snippet}
</Popup>
