<script lang="ts">
	import type { GameSettings, Preset, WorkCategory } from '$lib/types';
	import { DEFAULT_SETTINGS } from '$lib/types';
	import { settings as settingsStore, gameData } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import ArrowLeft from 'lucide-svelte/icons/arrow-left';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import { get } from 'svelte/store';

	interface Props {
		onBack?: () => void;
		onSave?: (settings: GameSettings) => void;
	}

	let { onBack = () => {}, onSave = () => {} }: Props = $props();

	let localSettings = $state<GameSettings>({ ...$settingsStore });
	let presetInfo = $state<{ composers: number; works: number; tracks: number } | null>(null);

	const presets: { value: Preset; label: string }[] = [
		{ value: 'default', label: 'Default (All Music)' },
		{ value: 'piano', label: 'Piano Works' },
		{ value: 'concerto', label: 'Concertos' },
		{ value: 'chamber', label: 'Chamber Music' },
		{ value: 'ballet', label: 'Ballet' },
		{ value: 'opera', label: 'Opera' },
		{ value: 'custom', label: 'Custom' }
	];

	// Update preset info when preset changes
	$effect(() => {
		const data = get(gameData);
		if (data && localSettings.preset !== 'custom') {
			const generator = new TracklistGenerator(data);
			presetInfo = generator.getPresetInfo(localSettings.preset);
		} else {
			presetInfo = null;
		}
	});

	function handlePresetChange(preset: Preset) {
		localSettings.preset = preset;

		// Reset category weights when switching presets
		if (preset !== 'custom') {
			localSettings.categoryWeights = { ...DEFAULT_SETTINGS.categoryWeights };
		}
	}

	function handleSave() {
		settingsStore.save(localSettings);
		onSave(localSettings);
	}

	function handleReset() {
		localSettings = { ...DEFAULT_SETTINGS };
	}
</script>

<div class="min-h-screen w-full bg-gray-950 p-8 text-white">
	<div class="mx-auto max-w-4xl">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<button
				type="button"
				onclick={onBack}
				class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-cyan-400
                     transition-colors hover:bg-gray-700"
			>
				<ArrowLeft class="h-5 w-5" />
				Back
			</button>

			<h1
				class="bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-4xl font-bold text-transparent"
			>
				Settings
			</h1>

			<button
				type="button"
				onclick={handleReset}
				class="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-gray-400
                     transition-colors hover:bg-gray-700"
			>
				<RotateCcw class="h-5 w-5" />
				Reset
			</button>
		</div>

		<div class="space-y-8">
			<!-- Number of Tracks -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-6">
				<label class="mb-4 block">
					<span class="text-lg font-semibold text-cyan-400">Number of Tracks</span>
					<div class="mt-2 flex items-center gap-4">
						<input
							type="range"
							min="5"
							max="50"
							bind:value={localSettings.numberOfTracks}
							class="flex-1 accent-cyan-500"
						/>
						<span class="w-12 text-right text-2xl font-bold text-white">
							{localSettings.numberOfTracks}
						</span>
					</div>
				</label>
			</div>

			<!-- Preset Selection -->
			<div class="rounded-xl border border-gray-800 bg-gray-900 p-6">
				<h2 class="mb-4 text-lg font-semibold text-cyan-400">Preset</h2>
				<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
					{#each presets as preset}
						<button
							type="button"
							onclick={() => handlePresetChange(preset.value)}
							class="rounded-lg px-4 py-3 font-semibold transition-all
                             {localSettings.preset === preset.value
								? 'bg-linear-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
								: 'bg-gray-800 text-gray-300 hover:bg-gray-700'}"
						>
							{preset.label}
						</button>
					{/each}
				</div>

				{#if presetInfo && localSettings.preset !== 'custom'}
					<p class="mt-4 text-sm text-gray-400">
						{presetInfo.composers} composers • {presetInfo.works} works • {presetInfo.tracks} tracks
						available
					</p>
				{/if}
			</div>

			<!-- Custom Settings (only visible when preset is 'custom') -->
			{#if localSettings.preset === 'custom'}
				<div class="rounded-xl border border-gray-800 bg-gray-900 p-6">
					<h2 class="mb-4 text-lg font-semibold text-purple-400">Category Weights</h2>
					<p class="mb-4 text-sm text-gray-400">
						Adjust the weights to control how often each category appears. Set to 0 to exclude.
					</p>

					<div class="space-y-4">
						{#each Object.entries(localSettings.categoryWeights) as [category, weight]}
							<label class="block">
								<div class="mb-2 flex items-center justify-between">
									<span class="text-gray-300 capitalize">{category}</span>
									<span class="font-semibold text-cyan-400">{weight}</span>
								</div>
								<input
									type="range"
									min="0"
									max="10"
									step="0.5"
									bind:value={localSettings.categoryWeights[category as WorkCategory]}
									class="w-full accent-purple-500"
								/>
							</label>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Save Button -->
			<button
				type="button"
				onclick={handleSave}
				class="w-full rounded-xl bg-linear-to-r from-cyan-500 to-purple-600 px-8 py-4 text-xl font-bold text-white
                     shadow-[0_0_30px_rgba(34,211,238,0.4)]
                     transition-all
                     duration-200 hover:shadow-[0_0_40px_rgba(34,211,238,0.6)] active:scale-98"
			>
				Save Settings
			</button>
		</div>
	</div>
</div>
