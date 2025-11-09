<script lang="ts">
	import { deezerPlayer } from '$lib/services';
	import { settings as settingsStore } from '$lib/stores';
	import { onMount } from 'svelte';
	import Popup from '../primitives/Popup.svelte';
	import Slider from '../primitives/Slider.svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
	}

	let { visible = false, onClose = () => {} }: Props = $props();

	let trackLength = $state(30);

	onMount(() => {
		// Get initial values from settings store
		trackLength = $settingsStore.trackLength;

		// Apply to player
		deezerPlayer.setTrackLength(trackLength);
	});

	function handleTrackLengthChange(value: number) {
		trackLength = value;
		deezerPlayer.setTrackLength(value);
		settingsStore.update((s) => ({ ...s, trackLength: value }));
	}
</script>

<Popup {visible} {onClose} width="md">
	<h2 class="mb-6 text-2xl font-bold text-cyan-400">{$_('inGameSettings.title')}</h2>

	<div class="space-y-6">
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
</Popup>
