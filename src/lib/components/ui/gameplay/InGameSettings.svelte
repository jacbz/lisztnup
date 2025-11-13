<script lang="ts">
	import { deezerPlayer } from '$lib/services';
	import { settings as settingsStore } from '$lib/stores';
	import { onMount } from 'svelte';
	import Popup from '../primitives/Popup.svelte';
	import Slider from '../primitives/Slider.svelte';
	import ToggleButton from '../primitives/ToggleButton.svelte';
	import { _ } from 'svelte-i18n';
	import type { GameMode } from '$lib/types';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
		mode: GameMode;
	}

	let { visible = false, onClose = () => {}, mode }: Props = $props();

	let trackLength = $state(30);
	let enableAudioNormalization = $state(true);
	let buzzerVolume = $state(0.75);

	onMount(() => {
		// Get initial values from settings store
		trackLength = $settingsStore.trackLength;
		enableAudioNormalization = $settingsStore.enableAudioNormalization;
		buzzerVolume = $settingsStore.buzzerVolume;

		// Apply to player
		deezerPlayer.setTrackLength(trackLength);
		deezerPlayer.setEnableAudioNormalization(enableAudioNormalization);
	});

	function handleTrackLengthChange(value: number) {
		trackLength = value;
		deezerPlayer.setTrackLength(value);
		settingsStore.update((s) => ({ ...s, trackLength: value }));
	}

	function handleAudioNormalizationToggle() {
		enableAudioNormalization = !enableAudioNormalization;
		deezerPlayer.stop();
		deezerPlayer.setEnableAudioNormalization(enableAudioNormalization);
		settingsStore.update((s) => ({ ...s, enableAudioNormalization }));
	}

	function handleBuzzerVolumeChange(value: number) {
		buzzerVolume = value;
		settingsStore.update((s) => ({ ...s, buzzerVolume: value }));
	}
</script>

<Popup {visible} {onClose} width="md">
	<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('inGameSettings.title')}</h2>

	<div class="space-y-6">
		<!-- Track Length Slider -->
		{#if mode !== 'buzzer'}
			<div>
				<Slider
					value={trackLength}
					min={5}
					max={30}
					step={1}
					label={$_('inGameSettings.trackLength')}
					showValue={true}
					valueSuffix="s"
					onChange={handleTrackLengthChange}
				/>
				<p class="mt-2 text-sm text-slate-400">{$_('inGameSettings.trackLengthHint')}</p>
			</div>
		{/if}

		<!-- Buzzer Volume Slider -->
		{#if mode === 'buzzer'}
			<div>
				<Slider
					value={buzzerVolume}
					min={0}
					max={1}
					step={0.01}
					label={$_('inGameSettings.buzzerVolume')}
					showValue={true}
					valueSuffix=""
					valueFormatter={(value) => `${Math.round(value * 100)}%`}
					onChange={handleBuzzerVolumeChange}
				/>
				<p class="mt-2 text-sm text-slate-400">{$_('inGameSettings.buzzerVolumeHint')}</p>
			</div>
		{/if}

		<!-- Audio Normalization Toggle -->
		<div>
			<div class="mb-2 flex items-center justify-between">
				<span class="font-semibold text-cyan-400">
					{$_('inGameSettings.audioNormalization')}
				</span>
				<ToggleButton value={enableAudioNormalization} onToggle={handleAudioNormalizationToggle} />
			</div>
			<p class="mt-2 text-sm text-slate-400">{$_('inGameSettings.audioNormalizationHint')}</p>
		</div>
	</div>
</Popup>
