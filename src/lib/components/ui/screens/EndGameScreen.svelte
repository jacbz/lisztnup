<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { fly } from 'svelte/transition';
	import type { Player } from '$lib/types';
	import Trophy from 'lucide-svelte/icons/trophy';
	import BarChart from 'lucide-svelte/icons/bar-chart-3';
	import Home from 'lucide-svelte/icons/home';
	import MessageSquare from 'lucide-svelte/icons/message-square';
	import FeedbackPopup from '../gameplay/FeedbackPopup.svelte';
	import { onMount } from 'svelte';

	interface Props {
		visible?: boolean;
		players?: Player[];
		isSoloMode?: boolean;
		enableScoring?: boolean;
		tracksExhausted?: boolean;
		onViewStats?: () => void;
		onHome?: () => void;
	}

	let {
		visible = false,
		players = [],
		isSoloMode = false,
		enableScoring = true,
		tracksExhausted = false,
		onViewStats = () => {},
		onHome = () => {}
	}: Props = $props();

	// Sort players by score
	const sortedPlayers = $derived([...players].sort((a, b) => b.score - a.score));
	const winner = $derived(sortedPlayers[0]);
	const isTie = $derived(
		sortedPlayers.length > 1 && sortedPlayers[0].score === sortedPlayers[1].score
	);

	let showFeedbackPopup = $state(false);
	let gameoverAudio: HTMLAudioElement | null = null;
	let gameoverPlayed = false;

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

	onMount(() => {
		gameoverAudio = new Audio('/gameover.mp3');
	});
</script>

{#if visible}
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-black/90 p-5"
		transition:fly={{ y: 50, duration: 500 }}
	>
		<div
			class="w-full max-w-150 rounded-3xl border-2 border-cyan-400 bg-slate-900 p-10 shadow-[0_0_30px_rgba(34,211,238,0.3)]"
		>
			<!-- Winner Announcement -->
			{#if !isSoloMode && enableScoring}
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
					{#if tracksExhausted}
						<p class="mt-1 text-sm text-slate-400">{$_('endGame.noMoreTracks')}</p>
					{/if}
				</div>
			{:else if isSoloMode && enableScoring}
				<div class="mb-10 text-center">
					<Trophy
						class="trophy-icon mx-auto mb-5 h-20 w-20 animate-trophy-glow text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]"
						size={80}
					/>
					<h1 class="text-[40px] font-bold text-cyan-400 sm:text-[32px]">
						{$_('game.gameOver')}
					</h1>
					{#if tracksExhausted}
						<p class="mt-1 text-sm text-slate-400">{$_('endGame.noMoreTracks')}</p>
					{/if}
					{#if sortedPlayers.length > 0}
						<p class="mt-4 text-3xl font-bold text-white">
							{$_('scoring.pts', { values: { points: sortedPlayers[0].score.toLocaleString() } })}
						</p>
					{/if}
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
					{#if tracksExhausted}
						<p class="mt-1 text-sm text-slate-400">{$_('endGame.noMoreTracks')}</p>
					{/if}
				</div>
			{/if}

			<!-- Final Scores -->
			{#if !isSoloMode && enableScoring}
				<div class="mb-8">
					<h2 class="mb-5 text-center text-2xl font-bold text-cyan-400 sm:text-xl">
						{$_('endGame.finalScores')}
					</h2>
					<div class="flex flex-col gap-3">
						{#each sortedPlayers as player, index (player.name)}
							<div
								class={index === 0
									? 'flex items-center gap-4 rounded-xl border-2 border-amber-400 bg-slate-800 p-4 shadow-[0_0_20px_rgba(251,191,36,0.3)] transition-all duration-200 sm:gap-3 sm:p-3'
									: 'flex items-center gap-4 rounded-xl border-2 border-transparent bg-slate-700 p-4 transition-all duration-200 sm:gap-3 sm:p-3'}
								style="border-color: {index === 0 ? '#fbbf24' : player.color};"
							>
								<div
									class="w-10 text-xl font-bold sm:w-7.5 sm:text-base {index === 0
										? 'text-amber-400'
										: 'text-slate-400'}"
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
								<div class="text-xl font-bold text-cyan-400 sm:text-lg">
									{$_('scoring.pts', { values: { points: player.score.toLocaleString() } })}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Action Buttons -->
			<div class="flex items-center gap-2">
				{#if enableScoring}
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
					onclick={onHome}
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
{/if}

<FeedbackPopup visible={showFeedbackPopup} onClose={() => (showFeedbackPopup = false)} />
