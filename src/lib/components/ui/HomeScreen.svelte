<script lang="ts">
	import Settings from 'lucide-svelte/icons/settings';
	import Play from 'lucide-svelte/icons/play';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import { _ } from 'svelte-i18n';
	import { settings as settingsStore } from '$lib/stores';
	import ModeSelector from './ModeSelector.svelte';
	import type { Preset } from '$lib/types';

	interface Props {
		onStart?: () => void;
		onSettings?: () => void;
	}

	let { onStart = () => {}, onSettings = () => {} }: Props = $props();

	let showModeSelector = $state(false);
	let localSettings = $state({ ...$settingsStore });

	// Update local settings when store changes
	$effect(() => {
		localSettings = { ...$settingsStore };
	});

	function handleModeSelect(preset: Preset) {
		localSettings.preset = preset;
		settingsStore.update((s) => ({ ...s, preset }));
	}

	function handleNumberOfTracksChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const numberOfTracks = parseInt(target.value);
		localSettings.numberOfTracks = numberOfTracks;
		settingsStore.update((s) => ({ ...s, numberOfTracks }));
	}
</script>

<div class="flex h-screen w-full items-center justify-center bg-gray-950">
	<div class="text-center">
		<!-- Title -->
		<h1
			class="neon-title mb-16 bg-linear-to-r from-cyan-400 to-purple-500 bg-clip-text text-8xl font-bold text-transparent"
		>
			{$_('app.title')}
		</h1>

		<!-- Subtitle -->
		<p class="mb-12 text-xl text-cyan-300">{$_('app.subtitle')}</p>

		<!-- Game Parameters Container -->
		<div
			class="mx-auto mb-8 max-w-md rounded-2xl border-2 border-cyan-400/30 bg-gray-900/50 p-6 backdrop-blur-sm"
		>
			<!-- Mode Selection -->
			<div class="mb-4">
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-semibold text-gray-400">{$_('home.mode')}</span>
					<button
						type="button"
						onclick={() => (showModeSelector = true)}
						class="flex items-center gap-1 rounded-lg px-3 py-1 text-cyan-400 transition-colors hover:bg-cyan-400/10"
					>
						<span class="font-bold">{$_(`settings.presets.${localSettings.preset}`)}</span>
						<ChevronRight class="h-4 w-4" />
					</button>
				</div>
				<p class="text-sm text-gray-500">
					{$_(`modeSelector.descriptions.${localSettings.preset}`)}
				</p>
			</div>

			<!-- Number of Tracks -->
			<div>
				<div class="mb-2 flex items-center justify-between">
					<span class="text-sm font-semibold text-gray-400">{$_('settings.numberOfTracks')}</span>
					<span class="text-xl font-bold text-cyan-400">{localSettings.numberOfTracks}</span>
				</div>
				<input
					type="range"
					min="5"
					max="50"
					value={localSettings.numberOfTracks}
					oninput={handleNumberOfTracksChange}
					class="w-full accent-cyan-500"
				/>
			</div>
		</div>

		<!-- Start Button -->
		<button
			type="button"
			onclick={onStart}
			class="mx-auto mb-6 flex items-center gap-4 rounded-2xl bg-linear-to-r from-cyan-500 to-purple-600 px-16
                 py-6
                 text-2xl
                 font-bold
                 text-white shadow-[0_0_40px_rgba(34,211,238,0.6)]
                 transition-all duration-200 hover:shadow-[0_0_60px_rgba(34,211,238,0.8)] active:scale-95"
		>
			<Play class="h-8 w-8" fill="white" />
			{$_('home.start')}
		</button>

		<!-- Settings Button -->
		<button
			type="button"
			onclick={onSettings}
			class="mx-auto flex items-center gap-2 rounded-xl border-2
                 border-cyan-400/50 bg-gray-800
                 px-8 py-3
                 font-semibold
                 text-cyan-400 transition-all
                 duration-200 hover:border-cyan-400 hover:bg-gray-700 active:scale-95"
		>
			<Settings class="h-5 w-5" />
			{$_('home.settings')}
		</button>
	</div>
</div>

<!-- Mode Selector Popup -->
<ModeSelector
	visible={showModeSelector}
	selectedPreset={localSettings.preset}
	onSelect={handleModeSelect}
	onClose={() => (showModeSelector = false)}
/>

<style>
	.neon-title {
		animation: neonPulse 3s ease-in-out infinite;
		filter: drop-shadow(0 0 20px rgba(34, 211, 238, 0.8));
	}

	@keyframes neonPulse {
		0%,
		100% {
			filter: drop-shadow(0 0 20px rgba(34, 211, 238, 0.8));
		}
		50% {
			filter: drop-shadow(0 0 40px rgba(34, 211, 238, 1));
		}
	}
</style>
