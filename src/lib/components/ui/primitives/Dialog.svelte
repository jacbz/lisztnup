<script lang="ts">
	import type { Snippet } from 'svelte';
	import Popup from './Popup.svelte';

	interface Props {
		visible?: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		onConfirm?: () => void;
		onCancel?: () => void;
		children?: Snippet;
	}

	let {
		visible = false,
		title = '',
		message = '',
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		onConfirm = undefined,
		onCancel = undefined,
		children
	}: Props = $props();
</script>

<Popup {visible} onClose={onCancel}>
	<div
		class="w-full max-w-md rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		{#if title}
			<h2 class="mb-4 text-2xl font-bold text-cyan-400">{title}</h2>
		{/if}

		{#if children}
			<div class="mb-6 text-gray-300">
				{@render children()}
			</div>
		{:else if message}
			<p class="mb-6 text-gray-300">{message}</p>
		{/if}

		<div class="flex gap-3">
			{#if onCancel}
				<button
					type="button"
					onclick={onCancel}
					class="flex-1 rounded-xl border-2 border-gray-600 bg-gray-800 px-6 py-3 font-semibold text-gray-300 transition-all hover:border-gray-500 hover:bg-gray-700 active:scale-95"
				>
					{cancelText}
				</button>
			{/if}
			{#if onConfirm}
				<button
					type="button"
					onclick={onConfirm}
					class="flex-1 rounded-xl border-2 border-cyan-400 bg-gray-900 px-6 py-3 font-semibold text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all hover:bg-gray-800 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95"
				>
					{confirmText}
				</button>
			{/if}
		</div>
	</div>
</Popup>
