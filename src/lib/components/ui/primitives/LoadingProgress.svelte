<script lang="ts">
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		progress?: number;
		showText?: boolean;
		compact?: boolean;
		indeterminate?: boolean;
	}

	let { progress = 0, showText = true, compact = false, indeterminate = false }: Props = $props();
	let clampedProgress = $derived(Math.max(0, Math.min(100, progress)));
	let messageIndex = $state(0);

	const MESSAGE_COUNT = 10;
	const MESSAGE_ROTATION_MS = 3000;

	function nextMessageIndex(current: number): number {
		if (MESSAGE_COUNT <= 1) return 0;
		const next = Math.floor(Math.random() * (MESSAGE_COUNT - 1));
		return next >= current ? next + 1 : next;
	}

	onMount(() => {
		messageIndex = Math.floor(Math.random() * MESSAGE_COUNT);
		const interval = setInterval(() => {
			messageIndex = nextMessageIndex(messageIndex);
		}, MESSAGE_ROTATION_MS);

		return () => clearInterval(interval);
	});
</script>

<div class="text-center">
	<div
		class="relative mx-auto overflow-hidden rounded-full border border-cyan-500/35 bg-[#130d22]/85 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05),0_0_22px_rgba(8,145,178,0.16)] {compact
			? 'h-2 w-56'
			: 'h-3 w-full max-w-80'}"
		class:mt-2={showText}
	>
		<div
			class="absolute inset-0 bg-linear-to-r from-cyan-950/45 via-purple-950/35 to-slate-950/45"
		></div>
		{#if indeterminate}
			<div
				class="relative h-full w-full overflow-hidden rounded-full opacity-100 shadow-[0_0_24px_rgba(6,182,212,0.48),0_0_42px_rgba(14,116,144,0.28)]"
			>
				<div
					class="absolute inset-0"
					style="background: linear-gradient(90deg, rgba(8,47,73,0.9), rgba(6,95,112,0.78), rgba(49,46,129,0.7), rgba(8,47,73,0.9));"
				></div>
				<div
					class="loading-scan absolute top-0 h-full w-1/2 bg-linear-to-r from-transparent via-cyan-200/80 to-transparent blur-[1px]"
				></div>
				<div
					class="loading-scan-soft absolute top-0 h-full w-2/3 bg-linear-to-r from-transparent via-sky-400/35 to-transparent blur-md"
				></div>
				<div
					class="absolute inset-y-0 left-1/2 w-1/2 -translate-x-1/2 bg-cyan-400/18 blur-md"
				></div>
			</div>
		{:else}
			<div
				class="relative h-full overflow-hidden rounded-full bg-linear-to-r from-cyan-600 via-teal-500 to-cyan-700 shadow-[0_0_16px_rgba(8,145,178,0.42)] transition-all duration-300 ease-out"
				style="width: {clampedProgress}%"
			>
				<div
					class="absolute inset-0 animate-shimmer bg-linear-to-r from-transparent via-cyan-100/24 to-transparent"
					style="background-size: 220% 100%;"
				></div>
			</div>
		{/if}
		<div
			class="pointer-events-none absolute inset-x-1 top-0 h-px rounded-full bg-linear-to-r from-transparent via-cyan-200/35 to-transparent"
		></div>
	</div>
	{#if showText}
		<p class="mt-3 text-center text-sm font-semibold text-cyan-300">
			{$_(`loading.progress.${messageIndex}`)}
		</p>
	{/if}
</div>

<style>
	.loading-scan {
		animation: loading-scan 1.65s linear infinite;
	}

	.loading-scan-soft {
		animation: loading-scan 2.35s linear infinite;
	}

	@keyframes loading-scan {
		from {
			transform: translateX(-140%);
		}
		to {
			transform: translateX(260%);
		}
	}
</style>
