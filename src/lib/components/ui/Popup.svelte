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
		transition:fade={{ duration: 200 }}
	></div>

	<!-- Content -->
	<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="popup-scrollable pointer-events-auto max-h-[90vh] overflow-y-auto"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			transition:scale={{ duration: 300, easing: cubicOut, start: 0.9 }}
		>
			{@render children?.()}
		</div>
	</div>
{/if}

<style>
	.popup-scrollable {
		/* Webkit browsers (Chrome, Safari, Edge) */
		scrollbar-width: thin;
		scrollbar-color: rgba(34, 211, 238, 0.5) rgba(31, 41, 55, 0.3);
	}

	.popup-scrollable::-webkit-scrollbar {
		width: 8px;
	}

	.popup-scrollable::-webkit-scrollbar-track {
		background: rgba(31, 41, 55, 0.3);
		border-radius: 4px;
	}

	.popup-scrollable::-webkit-scrollbar-thumb {
		background: rgba(34, 211, 238, 0.5);
		border-radius: 4px;
		transition: background 0.2s;
	}

	.popup-scrollable::-webkit-scrollbar-thumb:hover {
		background: rgba(34, 211, 238, 0.7);
	}
</style>
