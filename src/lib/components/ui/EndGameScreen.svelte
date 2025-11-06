<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import type { Player, GameMode } from '$lib/types';
	import Trophy from 'lucide-svelte/icons/trophy';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import Home from 'lucide-svelte/icons/home';

	interface Props {
		visible?: boolean;
		players?: Player[];
		isSoloMode?: boolean;
		mode?: GameMode;
		onPlayAgain?: () => void;
		onViewStats?: () => void;
		onHome?: () => void;
	}

	let {
		visible = false,
		players = [],
		isSoloMode = false,
		mode = 'classic',
		onPlayAgain = () => {},
		onViewStats = () => {},
		onHome = () => {}
	}: Props = $props();

	// Sort players by score
	const sortedPlayers = $derived([...players].sort((a, b) => b.score - a.score));
	const winner = $derived(sortedPlayers[0]);
	const isTie = $derived(
		sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score
	);
</script>

{#if visible}
	<div
		class="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-5"
		transition:fly={{ y: 50, duration: 500 }}
	>
		<div
			class="w-full max-w-[600px] rounded-3xl border-2 border-cyan-400 bg-gray-900 p-10 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<!-- Winner Announcement -->
			{#if !isSoloMode}
				<div class="mb-10 text-center">
					<Trophy
						class="trophy-icon mx-auto mb-5 h-20 w-20 animate-trophy-glow text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]"
						size={80}
					/>
					<h1 class="text-[40px] font-bold text-cyan-400 sm:text-[32px]">
						{#if isTie}
							{$_('endGame.tie')}
						{:else if winner}
							{$_('endGame.winner', { values: { name: winner.name } })}
						{/if}
					</h1>
				</div>
			{:else}
				<div class="mb-10 text-center">
					<Trophy
						class="trophy-icon mx-auto mb-5 h-20 w-20 animate-trophy-glow text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]"
						size={80}
					/>
					<h1 class="text-[40px] font-bold text-cyan-400 sm:text-[32px]">
						{$_('game.gameOver')}
					</h1>
					{#if sortedPlayers.length > 0}
						<p class="mt-4 text-3xl font-bold text-white">
							{sortedPlayers[0].score} pts
						</p>
					{/if}
				</div>
			{/if}

			<!-- Final Scores -->
			{#if !isSoloMode}
				<div class="mb-8">
					<h2 class="mb-5 text-center text-2xl font-bold text-cyan-400 sm:text-xl">
						{$_('endGame.finalScores')}
					</h2>
					<div class="flex flex-col gap-3">
						{#each sortedPlayers as player, index}
							<div
								class={index === 0
									? 'flex items-center gap-4 rounded-xl border-2 border-amber-400 bg-gray-800 p-4 shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all duration-200 sm:gap-3 sm:p-3'
									: 'flex items-center gap-4 rounded-xl border-2 border-transparent bg-gray-700 p-4 transition-all duration-200 sm:gap-3 sm:p-3'}
								style="border-color: {index === 0 ? '#fbbf24' : player.color};"
							>
								<div
									class="w-10 text-xl font-bold sm:w-[30px] sm:text-base {index === 0
										? 'text-amber-400'
										: 'text-gray-400'}"
								>
									#{index + 1}
								</div>
								<div
									class="h-6 w-6 shrink-0 rounded-full"
									style="background-color: {player.color};"
								></div>
								<div class="flex-1 text-lg font-semibold text-white sm:text-base">
									{player.name}
								</div>
								<div class="text-xl font-bold text-cyan-400 sm:text-lg">{player.score} pts</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex flex-col gap-3">
				{#if !isSoloMode}
					<button
						type="button"
						onclick={onViewStats}
						class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400/50 bg-gray-800 px-6 py-3.5 text-base font-bold text-cyan-400 transition-all duration-200 hover:border-cyan-400 hover:bg-gray-700 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]"
					>
						<BarChart class="h-5 w-5" />
						{$_('endGame.viewStats')}
					</button>
				{/if}
				{#if mode !== 'buzzer'}
					<button
						type="button"
						onclick={onPlayAgain}
						class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3.5 text-base font-bold text-cyan-400 transition-all duration-200 hover:bg-gray-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
					>
						{$_('endGame.playAgain')}
					</button>
				{/if}
				<button
					type="button"
					onclick={onHome}
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-gray-600 bg-gray-800 px-6 py-3.5 text-base font-bold text-gray-400 transition-all duration-200 hover:border-gray-500 hover:bg-gray-700"
				>
					<Home class="h-5 w-5" />
					{$_('endGame.home')}
				</button>
			</div>
		</div>
	</div>
{/if}
