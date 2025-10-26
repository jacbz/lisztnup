<script lang="ts">
	import type { Preset, WorkCategory, CategoryWeights } from '$lib/types';
	import { gameData, settings as settingsStore } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import { get } from 'svelte/store';
	import Popup from './Popup.svelte';
	import Slider from './Slider.svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		selectedPreset?: Preset;
		categoryWeights?: CategoryWeights;
		onSelect?: (preset: Preset) => void;
		onWeightsChange?: (weights: CategoryWeights) => void;
		onClose?: () => void;
	}

	let {
		visible = false,
		selectedPreset = 'default',
		categoryWeights = $settingsStore.categoryWeights,
		onSelect = () => {},
		onWeightsChange = () => {},
		onClose = () => {}
	}: Props = $props();

	const presets: { value: Preset }[] = [
		{ value: 'default' },
		{ value: 'piano' },
		{ value: 'concerto' },
		{ value: 'chamber' },
		{ value: 'ballet' },
		{ value: 'opera' },
		{ value: 'custom' }
	];

	// Compute preset info for each preset
	const presetInfoMap = $derived.by(() => {
		const data = get(gameData);
		if (!data)
			return {} as Record<Preset, { composers: number; works: number; tracks: number } | null>;

		const generator = new TracklistGenerator(data);
		const map: Record<Preset, { composers: number; works: number; tracks: number } | null> = {
			default: null,
			piano: null,
			concerto: null,
			chamber: null,
			ballet: null,
			opera: null,
			custom: null
		};

		// Calculate info for each preset except custom
		for (const preset of presets) {
			if (preset.value !== 'custom') {
				map[preset.value] = generator.getPresetInfo(preset.value);
			}
		}

		return map;
	});

	function handleSelect(preset: Preset) {
		onSelect(preset);
		// Don't close if custom is selected - user needs to configure weights
		if (preset !== 'custom') {
			onClose();
		}
	}

	function handleWeightChange(category: WorkCategory, value: number) {
		const newWeights = { ...categoryWeights, [category]: value };
		onWeightsChange(newWeights);
	}

	function handleDone() {
		onClose();
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="w-full max-w-2xl rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('modeSelector.title')}</h2>

		<!-- Mode Selection Grid -->
		<div class="mb-6 grid gap-3 md:grid-cols-2">
			{#each presets as preset}
				<button
					type="button"
					onclick={() => handleSelect(preset.value)}
					class="flex flex-col items-start gap-2 rounded-xl p-4 text-left transition-all
                         {selectedPreset === preset.value
						? 'bg-linear-to-r from-cyan-500 to-purple-600 text-white shadow-[0_0_20px_rgba(34,211,238,0.4)]'
						: 'border-2 border-gray-700 bg-gray-800 text-gray-300 hover:border-cyan-400/50 hover:bg-gray-700'}"
				>
					<span class="text-lg font-bold">
						{$_(`settings.presets.${preset.value}`)}
					</span>
					<span
						class="text-sm leading-relaxed {selectedPreset === preset.value
							? 'text-cyan-100'
							: 'text-gray-400'}"
					>
						{$_(`modeSelector.descriptions.${preset.value}`)}
					</span>
					{#if preset.value !== 'custom' && presetInfoMap[preset.value]}
						<span class="mt-1 text-xs opacity-70">
							{$_('settings.presetInfo.default', {
								values: {
									composers: presetInfoMap[preset.value]?.composers ?? 0,
									works: presetInfoMap[preset.value]?.works ?? 0,
									tracks: presetInfoMap[preset.value]?.tracks ?? 0
								}
							})}
						</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Category Weights (only visible when custom is selected) -->
		{#if selectedPreset === 'custom'}
			<div class="border-t-2 border-gray-700 pt-6">
				<h3 class="mb-4 text-lg font-semibold text-purple-400">
					{$_('settings.categoryWeights')}
				</h3>
				<div class="mb-6 space-y-4">
					{#each Object.entries(categoryWeights) as [category, weight]}
						<Slider
							value={weight}
							min={0}
							max={10}
							step={0.5}
							label={$_(`settings.categories.${category}`)}
							showValue={true}
							onChange={(val) => handleWeightChange(category as WorkCategory, val)}
						/>
					{/each}
				</div>
				<button
					type="button"
					onclick={handleDone}
					class="w-full rounded-xl bg-linear-to-r from-cyan-500 to-purple-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95"
				>
					{$_('modeSelector.done')}
				</button>
			</div>
		{/if}
	</div>
</Popup>
