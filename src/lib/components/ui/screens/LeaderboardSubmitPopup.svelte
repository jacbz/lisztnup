<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import { getPlayerToken } from '$lib/stores/identity';
	import { settings } from '$lib/stores';
	import PenLine from 'lucide-svelte/icons/pen-line';
	import Check from 'lucide-svelte/icons/check';
	import Loader2 from 'lucide-svelte/icons/loader-2';
	import { patchLeaderboardName } from '$lib/services/client';

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
		entryIds: (number | null)[];
		onClose?: () => void;
		onNamed?: () => void;
	}

	let {
		visible = false,
		players,
		entryIds,
		onClose = () => {},
		onNamed = () => {}
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
		return !submitted[index] && !submitting[index] && entryIds[index] != null && (editedNames[index]?.trim() ?? '').length > 0;
	}

	async function namePlayer(index: number) {
		const p = players[index];
		const entryId = entryIds[index];
		const finalName = editedNames[index].trim();
		if (!finalName || entryId == null) return;
		submitting[index] = true;
		errors[index] = false;
		try {
			// Persist edited name back to player setup so it sticks for future games
			settings.update((s) => ({
				...s,
				players: s.players.map((sp) =>
					sp.color === p.color ? { ...sp, name: finalName } : sp
				)
			}));
			await patchLeaderboardName({
				id: entryId,
				playerToken: getPlayerToken(),
				playerName: finalName
			});
			submitted[index] = true;
			onNamed();
		} catch {
			errors[index] = true;
		} finally {
			submitting[index] = false;
		}
	}

	async function nameAll() {
		const pending = players.map((_, i) => i).filter((i) => canSubmit(i));
		await Promise.all(pending.map((i) => namePlayer(i)));
	}

	// Reset state when popup opens (preserve submitted status)
	$effect(() => {
		if (visible) {
			// Only initialize editedNames if empty to avoid overwriting user input on re-renders
			if (editedNames.length !== players.length) {
				editedNames = players.map((p) => (isDefaultName(p.name) ? '' : p.name));
			}
			submitting = players.map(() => false);
			errors = players.map(() => false);
			// Only reset submitted if player list changed (new game)
			if (submitted.length !== players.length) {
				submitted = players.map(() => false);
			}
		} else {
			// Clear on close so next open re-initializes
			editedNames = [];
		}
	});

	const allNamed = $derived(submitted.length > 0 && submitted.every(Boolean));
	const anyNameable = $derived(players.some((_, i) => canSubmit(i)));
</script>

<Popup {visible} {onClose} width="w-[520px] max-w-[92vw]">
	<div class="flex flex-col gap-4">
		<h3 class="text-center text-xl font-bold text-cyan-400">{$_('leaderboard.nameYourScore')}</h3>
		<p class="text-center text-sm text-slate-400">{$_('leaderboard.namePrompt')}</p>

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
								disabled={entryIds[i] == null}
								class="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm font-semibold text-white placeholder-slate-500 outline-none focus:border-cyan-400 disabled:opacity-40"
							/>
						{/if}
					</div>

					<!-- Score -->
					<span class="shrink-0 text-sm font-bold text-cyan-400 tabular-nums">
						{$_('scoring.pts', { values: { points: Math.round(p.score).toLocaleString() } })}
					</span>

					<!-- Name button per player -->
					{#if submitted[i]}
						<Check class="h-4 w-4 shrink-0 text-emerald-400" />
					{:else if entryIds[i] == null}
						<div class="flex shrink-0 items-center justify-center px-4 py-1.5">
							<Loader2 class="h-4 w-4 animate-spin text-slate-500" />
						</div>
					{:else}
						<button
							type="button"
							onclick={() => namePlayer(i)}
							disabled={!canSubmit(i)}
							class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-cyan-400/50 px-2.5 py-1.5 text-sm font-semibold text-cyan-400 transition-all hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-30"
						>
							<PenLine class="h-3.5 w-3.5" />
							{$_('leaderboard.name')}
						</button>
					{/if}
				</div>
				{#if errors[i]}
					<p class="text-center text-xs text-red-400">{$_('leaderboard.error')}</p>
				{/if}
			{/each}
		</div>

		{#if allNamed}
			<p class="text-center text-sm font-semibold text-emerald-400">{$_('leaderboard.named')}</p>
		{:else if players.length > 1}
			<button
				type="button"
				onclick={nameAll}
				disabled={!anyNameable}
				class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 px-6 py-3 text-base font-bold text-cyan-400 transition-all duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if submitting.some(Boolean)}
					<Loader2 class="h-5 w-5 animate-spin" />
				{:else}
					<PenLine class="h-5 w-5" />
				{/if}
				{$_('leaderboard.nameAll')}
			</button>
		{/if}
	</div>
</Popup>
