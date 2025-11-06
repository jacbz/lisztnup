<script lang="ts">
	import { deezerPlayer } from '$lib/services';
	import { settings as settingsStore } from '$lib/stores';
	import { onMount } from 'svelte';
	import Popup from './Popup.svelte';
	import Slider from './Slider.svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
	}

	let { visible = false, onClose = () => {} }: Props = $props();

	let volume = $state(100);
	let trackLength = $state(25);

	onMount(() => {
		// Get initial values from settings store
		volume = $settingsStore.volume;
		trackLength = $settingsStore.trackLength;

		// Apply to player
		deezerPlayer.setVolume(volume / 100);
		deezerPlayer.setTrackLength(trackLength);
	});

	function handleVolumeChange(value: number) {
		volume = value;
		deezerPlayer.setVolume(value / 100);
		settingsStore.update((s) => ({ ...s, volume: value }));
	}

	function handleTrackLengthChange(value: number) {
		trackLength = value;
		deezerPlayer.setTrackLength(value);
		settingsStore.update((s) => ({ ...s, trackLength: value }));
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="w-full max-w-md rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('inGameSettings.title')}</h2>

		<div class="space-y-6">
			<!-- Volume Control -->
			<Slider
				value={volume}
				min={0}
				max={100}
				step={1}
				label={$_('inGameSettings.volume')}
				showValue={true}
				valueSuffix="%"
				onChange={handleVolumeChange}
			/>

			<!-- Track Length Slider -->
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
				<p class="mt-2 text-sm text-gray-400">{$_('inGameSettings.trackLengthHint')}</p>
			</div>
		</div>

		<!-- Close button -->
		<button
			type="button"
			onclick={onClose}
			class="mt-6 w-full rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3 font-semibold text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:bg-gray-800 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95"
		>
			{$_('inGameSettings.close')}
		</button>
	</div>
</Popup>
