<script lang="ts">
	import { _ } from 'svelte-i18n';
	import QRCode from '../primitives/QRCode.svelte';
	import { browser } from '$app/environment';

	interface Props {
		onOpenSharePopup?: () => void;
	}

	let { onOpenSharePopup = () => {} }: Props = $props();

	let bingoUrl = $state('');

	$effect(() => {
		if (browser) {
			bingoUrl = `${window.location.origin}/bingo`;
		}
	});
</script>

<div class="flex flex-row items-center gap-4">
	<div class="flex-1 md:text-left">
		<p class="text-sm text-gray-400">
			{$_('bingo.setupDescription')}
		</p>
	</div>

	{#if bingoUrl}
		<div class="shrink-0">
			<button
				type="button"
				onclick={onOpenSharePopup}
				class="cursor-pointer rounded-lg border-2 border-purple-400/30 bg-gray-900/50 p-1 transition-all hover:border-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
			>
				<QRCode text={bingoUrl} width={64} height={64} class="block" />
			</button>
		</div>
	{/if}
</div>
