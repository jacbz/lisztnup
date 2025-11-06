<script lang="ts">
	import { _ } from 'svelte-i18n';
	import { PLAYER_COLORS, type Player } from '$lib/types';
	import { settings } from '$lib/stores';
	import X from 'lucide-svelte/icons/x';
	import Plus from 'lucide-svelte/icons/plus';

	interface Props {
		onPlayersChange?: (players: Player[], isSoloMode: boolean, isValid: boolean) => void;
		onAddPlayer?: () => void;
	}

	let { onPlayersChange = () => {}, onAddPlayer }: Props = $props();

	let nameErrors = $state<Map<number, string>>(new Map());

	// Initialize players from settings (only once)
	let players = $state<Array<{ name: string; color: string }>>(
		$settings.players.length > 0
			? $settings.players.map((p) => ({ ...p }))
			: [{ name: 'Player 1', color: PLAYER_COLORS[0] }]
	);

	// Auto-detect solo mode and notify parent when players change
	$effect(() => {
		const isSoloMode = players.length === 1;

		// Validate all names and update errors map
		const newErrors = new Map<number, string>();
		let allValid = true;

		players.forEach((p, i) => {
			const trimmedName = p.name.trim();
			if (!trimmedName) {
				newErrors.set(i, 'Name cannot be empty');
				allValid = false;
				return;
			}

			// Check for duplicates
			const duplicate = players.some(
				(other, otherIndex) =>
					otherIndex !== i && other.name.trim().toLowerCase() === trimmedName.toLowerCase()
			);

			if (duplicate) {
				newErrors.set(i, 'Name already exists');
				allValid = false;
			}
		});

		// Update the errors map to trigger reactivity
		nameErrors = newErrors;

		const playersWithScore: Player[] = players.map((p) => ({ ...p, score: 0 }));

		// Save to settings only if all names are valid
		if (allValid) {
			settings.update((s) => ({
				...s,
				players: players.map((p) => ({ name: p.name, color: p.color }))
			}));
		}

		// Always notify parent, but include validation state
		onPlayersChange(playersWithScore, isSoloMode, allValid);
	});

	function removePlayer(index: number) {
		// Don't allow deleting the last player
		if (players.length <= 1) return;
		players = players.filter((_, i) => i !== index);
	}

	// Export addPlayer function for external use
	export function addPlayer() {
		if (players.length >= 10) return;

		// Find a unique name
		let baseName = 'Player';
		let num = players.length + 1;
		let newName = `${baseName} ${num}`;

		while (players.some((p) => p.name === newName)) {
			num++;
			newName = `${baseName} ${num}`;
		}

		const newPlayer = {
			name: newName,
			color: PLAYER_COLORS[players.length % PLAYER_COLORS.length]
		};
		players = [...players, newPlayer];
		onAddPlayer?.();
	}
</script>

<div class="flex w-full flex-col gap-2">
	<!-- Players List -->
	{#each players as player, index (index)}
		<div class="flex flex-col gap-1">
			<div class="flex items-center gap-2">
				<!-- Player Name Input -->
				<input
					type="text"
					bind:value={player.name}
					placeholder={$_('players.nameLabel')}
					class="flex-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-200 outline-none focus:border-cyan-400 {nameErrors.has(
						index
					)
						? 'border-red-500 bg-red-950'
						: 'border-gray-700 bg-gray-800'}"
					maxlength="20"
				/>

				<!-- Color -->
				<!-- <button
					type="button"
					class="h-6 w-6 shrink-0 cursor-pointer rounded-full border-2 border-white p-0 transition-transform duration-200 hover:scale-110"
					style="background-color: {player.color};"
					aria-label="Choose color"
				></button> -->

				<!-- Remove Button (disabled if only one player) -->
				<button
					type="button"
					onclick={() => removePlayer(index)}
					class="shrink-0 cursor-pointer rounded-md border-none bg-transparent p-1 text-red-400 transition-all duration-200 hover:bg-red-400/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-20 disabled:hover:bg-transparent"
					aria-label="Remove player"
					disabled={players.length <= 1}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
			{#if nameErrors.has(index)}
				<p class="pl-1 text-xs text-red-400">
					{nameErrors.get(index)}
				</p>
			{/if}
		</div>
	{/each}
</div>

<!-- Add Player Button - Exported for external use -->
{#if onAddPlayer === undefined}
	{#if players.length < 10}
		<button
			type="button"
			onclick={addPlayer}
			class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-700 bg-transparent p-2 text-sm text-gray-500 transition-all duration-200 hover:border-cyan-400 hover:text-cyan-400"
		>
			<Plus class="h-4 w-4" />
			{$_('players.addPlayer')}
		</button>
	{/if}
{/if}
