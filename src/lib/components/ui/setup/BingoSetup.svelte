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

<div class="space-y-4">
	<div class="text-center">
		<p class="text-sm text-gray-400">
			{$_('bingo.setupDescription', {
				default:
					'Each player needs their own device with a unique 5×5 bingo grid. Share the link or QR code below:'
			})}
		</p>
	</div>

	{#if bingoUrl}
		<div class="flex justify-center">
			<button
				type="button"
				onclick={onOpenSharePopup}
				class="cursor-pointer rounded-lg border-2 border-purple-400/30 bg-gray-900/50 p-2 transition-all hover:border-purple-400 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]"
			>
				<QRCode text={bingoUrl} width={120} height={120} class="block" />
			</button>
		</div>
	{/if}
</div>
