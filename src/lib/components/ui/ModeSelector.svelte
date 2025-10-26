<script lang="ts">
	import type { Preset } from '$lib/types';
	import { gameData } from '$lib/stores';
	import { TracklistGenerator } from '$lib/services';
	import { get } from 'svelte/store';
	import Popup from './Popup.svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		selectedPreset?: Preset;
		onSelect?: (preset: Preset) => void;
		onClose?: () => void;
	}

	let {
		visible = false,
		selectedPreset = 'default',
		onSelect = () => {},
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
		onClose();
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="w-full max-w-2xl rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('modeSelector.title')}</h2>

		<div class="grid gap-3 md:grid-cols-2">
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
						class="text-sm {selectedPreset === preset.value ? 'text-cyan-100' : 'text-gray-400'}"
					>
						{#if preset.value === 'custom'}
							{$_('settings.presetInfo.custom')}
						{:else if presetInfoMap[preset.value]}
							{$_('settings.presetInfo.default', {
								values: {
									composers: presetInfoMap[preset.value]?.composers ?? 0,
									works: presetInfoMap[preset.value]?.works ?? 0,
									tracks: presetInfoMap[preset.value]?.tracks ?? 0
								}
							})}
						{:else}
							{$_(`modeSelector.descriptions.${preset.value}`)}
						{/if}
					</span>
				</button>
			{/each}
		</div>
	</div>
</Popup>
