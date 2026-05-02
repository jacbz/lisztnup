<script lang="ts">
	import Popup from '$lib/components/ui/primitives/Popup.svelte';
	import { _ } from 'svelte-i18n';
	import Trophy from 'lucide-svelte/icons/trophy';
	import { getPlayerToken } from '$lib/stores/identity';

	interface LeaderboardEntry {
		player_name: string;
		score: number;
		cards: number;
		accuracy: number;
		longest_streak: number;
		tracklist_id: string | null;
		cards_to_win: number;
		timestamp: string;
		is_me?: boolean;
	}

	interface Props {
		visible?: boolean;
		onClose?: () => void;
	}

	let { visible = false, onClose = () => {} }: Props = $props();

	let entries = $state<LeaderboardEntry[]>([]);
	let loading = $state(false);

	$effect(() => {
		if (visible) {
			loadLeaderboard();
		}
	});

	async function loadLeaderboard() {
		loading = true;
		try {
			const res = await fetch(`/api/game/leaderboard?limit=10&token=${encodeURIComponent(getPlayerToken())}`);
			if (res.ok) {
				const data: { entries?: LeaderboardEntry[] } = await res.json();
				entries = data.entries ?? [];
			}
		} catch {
			// Silently fail — leaderboard is non-critical
		} finally {
			loading = false;
		}
	}

	const MEDAL_COLORS = ['text-amber-400', 'text-slate-300', 'text-amber-700'] as const;
</script>

<Popup {visible} {onClose} width="lg">
	<div class="flex flex-col gap-4">
		<div class="flex items-center justify-center gap-2">
			<Trophy class="h-6 w-6 text-amber-400" />
			<h2 class="text-2xl font-bold text-cyan-400">{$_('leaderboard.title')}</h2>
		</div>

		{#if loading}
			<p class="py-8 text-center text-slate-400">{$_('leaderboard.loading')}</p>
		{:else if entries.length === 0}
			<p class="py-8 text-center text-slate-400">{$_('leaderboard.noScores')}</p>
		{:else}
			<div class="flex flex-col gap-2">
				{#each entries as entry, i (i)}
					<div
						class="flex items-center gap-3 rounded-xl border px-3 py-2 {entry.is_me ? 'border-cyan-500/30 bg-cyan-950/30' : 'border-slate-700/50 bg-slate-800/50'}"
					>
						<span
							class="w-7 text-center text-sm font-bold {i < 3 ? MEDAL_COLORS[i] : 'text-slate-500'}"
						>
							{i + 1}
						</span>
						<div class="flex flex-1 flex-col">
							<span class="text-sm font-semibold text-white">{entry.player_name}</span>
							<span class="text-xs text-slate-400">
								{entry.cards} {$_('leaderboard.cards')} · {Math.round(entry.accuracy * 100)}%
							</span>
						</div>
						<span class="text-lg font-bold text-cyan-400 tabular-nums">
							{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</Popup>
