<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { fly } from 'svelte/transition';
	import CheckCircle from 'lucide-svelte/icons/check-circle';
	import AlertCircle from 'lucide-svelte/icons/alert-circle';
	import AlertTriangle from 'lucide-svelte/icons/alert-triangle';
	import Info from 'lucide-svelte/icons/info';
	import X from 'lucide-svelte/icons/x';

	const iconMap = {
		success: CheckCircle,
		error: AlertCircle,
		warning: AlertTriangle,
		info: Info
	};

	const colorMap = {
		success: 'bg-green-500/90',
		error: 'bg-red-500/90',
		warning: 'bg-yellow-500/90',
		info: 'bg-blue-500/90'
	};
</script>

<div class="toast-container">
	{#each $toast.toasts as toastItem (toastItem.id)}
		<div class="toast {colorMap[toastItem.type]}" transition:fly={{ y: -20, duration: 300 }}>
			<svelte:component this={iconMap[toastItem.type]} class="h-5 w-5 shrink-0" />
			<p class="flex-1 text-sm font-medium">{toastItem.message}</p>
			<button
				type="button"
				onclick={() => toast.dismiss(toastItem.id)}
				class="shrink-0 rounded p-1 transition-colors hover:bg-white/20"
				aria-label="Dismiss"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 20px;
		right: 20px;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-width: 400px;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border-radius: 12px;
		color: white;
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
		pointer-events: auto;
	}
</style>
