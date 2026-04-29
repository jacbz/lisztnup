<script lang="ts">
	import { scale, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import Flame from 'lucide-svelte/icons/flame';

	interface Props {
		/** The text to display. */
		text: string;
		/** Whether the flash is visible. */
		visible?: boolean;
		/** Rotation angle (from EdgeDisplay) to orient the text correctly. */
		rotation?: number;
		/** Intensity level 1–5. Controls glow size and text scale. */
		intensity?: number;
		/** Called when the flash animation completes and the text should hide. */
		onComplete?: () => void;
	}

	let {
		text,
		visible = false,
		rotation = 0,
		intensity = 1,
		onComplete = () => {}
	}: Props = $props();

	let showing = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (visible) {
			showing = true;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				showing = false;
				timer = setTimeout(() => {
					onComplete();
				}, 400);
			}, 1800);
		}
	});

	const glowSpread = $derived(10 + intensity * 5);
	const iconSize = $derived(1.4 + intensity * 0.2);

	onMount(() => {
		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

{#if showing}
	<div
		class="pointer-events-none fixed inset-0 z-999 flex items-center justify-center"
	>
		<div style="transform: rotate({rotation}deg);">
			<div
				class="rounded-2xl border border-orange-400/40 bg-slate-950/85 px-6 py-4 backdrop-blur-lg"
				style="box-shadow: 0 0 {glowSpread}px rgba(251,146,60,0.5), 0 0 {glowSpread * 2.5}px rgba(249,115,22,0.2);"
				in:scale={{ duration: 350, start: 0.5, easing: cubicOut }}
				out:fade={{ duration: 300 }}
			>
				<div class="flex items-center gap-3">
					<div class="animate-streak-flash shrink-0">
						<Flame
							class="text-orange-400"
							style="width: {iconSize}em; height: {iconSize}em; filter: drop-shadow(0 0 6px rgba(251,146,60,0.8));"
						/>
					</div>
					<span
						class="whitespace-nowrap font-extrabold tracking-wide text-orange-300 select-none"
						style="font-size: {1.5 + intensity * 0.25}rem;"
					>
						{text}
					</span>
				</div>
			</div>
		</div>
	</div>
{/if}
