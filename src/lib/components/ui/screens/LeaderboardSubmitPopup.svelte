<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import { getPlayerToken } from '$lib/stores/identity';
	import Send from 'lucide-svelte/icons/send';
	import Check from 'lucide-svelte/icons/check';

	export interface LeaderboardPlayer {
		name: string;
		color: string;
		score: number;
		cards: number;
		accuracy: number;
		longestStreak: number;
	}

	interface Props {
		visible?: boolean;
		players: LeaderboardPlayer[];
		tracklistId?: string | null;
		cardsToWin: number;
		onClose?: () => void;
	}

	let {
		visible = false,
		players,
		tracklistId = null,
		cardsToWin,
		onClose = () => {}
	}: Props = $props();

	let editedNames = $state<string[]>([]);
	let submitting = $state<boolean[]>([]);
	let submitted = $state<boolean[]>([]);
	let errors = $state<boolean[]>([]);

	/** Check if a player name is a default like "Player 1", "Spieler 2", "Joueur 3", etc. */
	function isDefaultName(name: string): boolean {
		for (let i = 1; i <= 10; i++) {
			if (name === $_('players.playerName', { values: { number: i } })) return true;
		}
		return false;
	}

	function canSubmit(index: number): boolean {
		return !submitted[index] && !submitting[index] && editedNames[index]?.trim().length > 0;
	}

	async function submitPlayer(index: number) {
		const p = players[index];
		const finalName = editedNames[index].trim();
		if (!finalName) return;
		submitting[index] = true;
		errors[index] = false;
		try {
			const res = await fetch('/api/game/leaderboard', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					playerToken: getPlayerToken(),
					playerName: finalName,
					score: Math.round(p.score),
					cards: p.cards,
					accuracy: p.accuracy,
					longestStreak: p.longestStreak,
					tracklistId,
					cardsToWin
				})
			});
			if (res.ok) {
				submitted[index] = true;
			} else {
				errors[index] = true;
			}
		} catch {
			errors[index] = true;
		} finally {
			submitting[index] = false;
		}
	}

	async function submitAll() {
		const pending = players.map((_, i) => i).filter((i) => canSubmit(i));
		await Promise.all(pending.map((i) => submitPlayer(i)));
	}

	// Reset state when popup opens
	$effect(() => {
		if (visible) {
			editedNames = players.map((p) => (isDefaultName(p.name) ? '' : p.name));
			submitting = players.map(() => false);
			submitted = players.map(() => false);
			errors = players.map(() => false);
		}
	});

	const allSubmitted = $derived(submitted.length > 0 && submitted.every(Boolean));
	const anySubmittable = $derived(players.some((_, i) => canSubmit(i)));
</script>

<Popup {visible} {onClose} width="w-[520px] max-w-[92vw]">
	<div class="flex flex-col gap-4">
		<h3 class="text-center text-xl font-bold text-cyan-400">{$_('leaderboard.publishScore')}</h3>

		<!-- Player table -->
		<div class="flex flex-col gap-2">
			{#each players as p, i (i)}
				<div class="flex items-center gap-3 rounded-lg border border-slate-700/30 bg-slate-900/50 px-3 py-2.5">
					<!-- Color dot -->
					<div class="h-3 w-3 shrink-0 rounded-full" style="background-color: {p.color};"></div>

					<!-- Name input or submitted name -->
					<div class="min-w-0 flex-1">
						{#if submitted[i]}
							<span class="text-sm font-semibold text-white">{editedNames[i]}</span>
						{:else}
							<input
								type="text"
								bind:value={editedNames[i]}
								placeholder={$_('leaderboard.namePlaceholder')}
								class="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-cyan-400"
							/>
						{/if}
					</div>

					<!-- Score -->
					<span class="shrink-0 text-sm font-bold text-cyan-400 tabular-nums">
						{$_('scoring.pts', { values: { points: Math.round(p.score).toLocaleString() } })}
					</span>

					<!-- Submit button per player -->
					{#if submitted[i]}
						<Check class="h-4 w-4 shrink-0 text-emerald-400" />
					{:else}
						<button
							type="button"
							onclick={() => submitPlayer(i)}
							disabled={!canSubmit(i)}
							class="shrink-0 cursor-pointer rounded-md border border-cyan-400/50 p-1.5 text-cyan-400 transition-all hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-30"
							aria-label={$_('leaderboard.submit')}
						>
							<Send class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>
				{#if errors[i]}
					<p class="text-center text-xs text-red-400">{$_('leaderboard.error')}</p>
				{/if}
			{/each}
		</div>

		{#if allSubmitted}
			<p class="text-center text-sm font-semibold text-emerald-400">{$_('leaderboard.submitted')}</p>
		{:else if players.length > 1}
			<button
				type="button"
				onclick={submitAll}
				disabled={!anySubmittable}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 text-base font-bold text-cyan-400 transition-all duration-200 hover:bg-slate-800 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Send class="h-5 w-5" />
				{$_('leaderboard.submit')}
			</button>
		{/if}
	</div>
</Popup>
