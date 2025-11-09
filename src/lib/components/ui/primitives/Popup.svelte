<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	interface Props {
		visible?: boolean;
		onClose?: () => void;
		children?: Snippet;
	}

	let { visible = false, onClose = () => {}, children }: Props = $props();

	function handleBackdropClick() {
		onClose();
	}
</script>

{#if visible}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/60"
		onclick={handleBackdropClick}
		role="presentation"
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200, delay: 100 }}
	></div>

	<!-- Content -->
	<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="pointer-events-auto"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			in:scale={{ duration: 300, easing: cubicOut, start: 0.9 }}
			out:scale={{ duration: 200, easing: cubicOut, start: 0.9 }}
		>
			{@render children?.()}
		</div>
	</div>
{/if}
