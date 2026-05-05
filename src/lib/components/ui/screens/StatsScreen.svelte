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

	// Hover state
	let hoveredPoint = $state<{
		playerName: string;
		roundIndex: number;
		score: number;
		x: number;
		y: number;
	} | null>(null);

	// Calculate cumulative scores for each player over rounds (no leading 0)
	const chartData = $derived.by(() => {
		if (players.length === 0 || rounds.length === 0) return null;

		const playerCumulativeScores = players.map((player) => ({
			player,
			scores: [] as number[]
		}));

		let running: Record<string, number> = {};
		players.forEach((p) => (running[p.name] = 0));

		rounds.forEach((round) => {
			playerCumulativeScores.forEach((data) => {
				running[data.player.name] += round.playerScores[data.player.name] || 0;
				data.scores.push(Math.round(running[data.player.name]));
			});
		});

		return playerCumulativeScores;
	});

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
	const chartWidth = $derived(
		typeof window !== 'undefined' ? Math.min(window.innerWidth - 100, 600) : 600
	);
	const padding = $derived({
		top: 20,
		right: 40,
		bottom: 40,
		left: typeof window !== 'undefined' && window.innerWidth < 768 ? 30 : 50
	});

	function getX(index: number, totalPoints: number): number {
		const chartW = chartWidth - padding.left - padding.right;
		if (totalPoints <= 1) return padding.left + chartW / 2;
		return padding.left + (index / (totalPoints - 1)) * chartW;
	}

	function getY(score: number): number {
		const chartH = chartHeight - padding.top - padding.bottom;
		const normalized = scoreRange > 0 ? (score - minScore) / scoreRange : 0.5;
		return padding.top + chartH - normalized * chartH;
	}

	function createPath(scores: number[]): string {
		if (scores.length === 0) return '';
		return scores
			.map((score, i) => {
				const x = getX(i, scores.length);
				const y = getY(score);
				return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
			})
			.join(' ');
	}
</script>

<Popup {visible} {onClose} width="w-[700px] max-w-[90vw]">
	<h2 class="mb-4 text-center text-2xl font-bold text-cyan-400 md:mb-6 md:text-3xl">
		{$_('stats.title')}
	</h2>

	{#if chartData && chartData.length > 0}
		<div class="mb-6 overflow-visible rounded-xl bg-slate-800 p-2 md:p-5">
			<svg width={chartWidth} height={chartHeight} class="mx-auto block w-full">
				<!-- Grid lines -->
				<g class="grid-lines">
					{#each [0, 1, 2, 3, 4] as i (i)}
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
						<text x={padding.left - 10} y={y + 5} class="fill-slate-400 text-xs" text-anchor="end">
							{Math.round(score)}
						</text>
					{/each}
				</g>

				<!-- X-axis labels (rounds starting at 1) -->
				<g class="x-axis">
					{#each rounds as _, i (i)}
						{@const x = getX(i, rounds.length)}
						<text
							{x}
							y={chartHeight - padding.bottom + 20}
							class="fill-slate-400 text-xs"
							text-anchor="middle"
						>
							{i + 1}
						</text>
					{/each}
					<text
						x={chartWidth / 2}
						y={chartHeight - 5}
						class="fill-slate-300 text-sm font-semibold"
						text-anchor="middle"
					>
						{$_('stats.round')}
					</text>
				</g>

				<!-- Player lines -->
				{#each chartData as { player, scores } (player.name)}
					<path
						d={createPath(scores)}
						fill="none"
						stroke={player.color}
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="transition-[stroke-width] duration-200 hover:stroke-5"
					/>

					<!-- Points (with hover) -->
					{#each scores as score, i (i)}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<circle
							cx={getX(i, scores.length)}
							cy={getY(score)}
							r={hoveredPoint?.playerName === player.name && hoveredPoint?.roundIndex === i ? 6 : 4}
							fill={player.color}
							stroke="white"
							stroke-width="2"
							class="cursor-pointer transition-[r] duration-200"
							onpointerenter={() => {
								hoveredPoint = {
									playerName: player.name,
									roundIndex: i,
									score,
									x: getX(i, scores.length),
									y: getY(score)
								};
							}}
							onpointerleave={() => {
								hoveredPoint = null;
							}}
						/>
					{/each}
				{/each}

				<!-- Hover tooltip -->
				{#if hoveredPoint}
					{@const tx = Math.min(hoveredPoint.x, chartWidth - padding.right - 40)}
					<g>
						<rect
							x={tx - 25}
							y={hoveredPoint.y - 30}
							width="50"
							height="20"
							rx="4"
							fill="#1e293b"
							stroke="#475569"
							stroke-width="1"
						/>
						<text
							x={tx}
							y={hoveredPoint.y - 16}
							class="fill-white text-xs font-bold"
							text-anchor="middle"
						>
							{Math.round(hoveredPoint.score)}
						</text>
					</g>
				{/if}
			</svg>
		</div>

		<!-- Legend -->
		<div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
			{#each chartData as { player, scores } (player.name)}
				<div class="flex items-center gap-2 rounded-lg bg-slate-700 p-2">
					<div
						class="h-5 w-5 shrink-0 rounded-full"
						style="background-color: {player.color};"
					></div>
					<span class="flex-1 text-sm font-semibold text-white">{player.name}</span>
					<span class="text-sm font-bold text-cyan-400"
						>{$_('scoring.pts', {
							values: { points: Math.round(scores[scores.length - 1]).toLocaleString() }
						})}</span
					>
				</div>
			{/each}
		</div>
	{:else}
		<p class="py-12 text-center text-lg text-slate-400">
			{$_('stats.noData')}
		</p>
	{/if}
</Popup>
