<script lang="ts">
	import QRCode from '../primitives/QRCode.svelte';
	import Popup from '../primitives/Popup.svelte';
	import Copy from 'lucide-svelte/icons/copy';
	import Share from 'lucide-svelte/icons/share';
	import Check from 'lucide-svelte/icons/check';
	import ExternalLink from 'lucide-svelte/icons/external-link';
	import { _ } from 'svelte-i18n';
	import { toast } from '$lib/stores';

	interface Props {
		visible: boolean;
		url: string;
		onClose: () => void;
	}

	let { visible, url, onClose }: Props = $props();

	let copied = $state(false);
	let hasShareSupport = $state(false);

	$effect(() => {
		hasShareSupport = typeof navigator !== 'undefined' && 'share' in navigator;
	});

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (error) {
			toast.error($_('bingo.copyFailed', { default: 'Failed to copy to clipboard' }));
		}
	}

	async function share() {
		try {
			if (navigator.share) {
				await navigator.share({
					title: $_('app.title'),
					text: $_('bingo.shareText', { default: 'Join my Bingo game!' }),
					url
				});
			} else {
				// Fallback to copy
				await copyToClipboard();
			}
		} catch (error) {
			console.warn('Share failed:', error);
		}
	}

	function openUrl() {
		window.open(url, '_blank');
	}
</script>

<Popup {visible} {onClose}>
	<div
		class="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border-2 border-cyan-400 bg-gray-900 p-6 shadow-[0_0_40px_rgba(34,211,238,0.6)]"
	>
		<h2 class="mb-6 text-center text-2xl font-bold text-purple-400">
			{$_('bingo.shareTitle', { default: 'Share Bingo Grid' })}
		</h2>

		<div class="flex flex-col items-center gap-4">
			<button
				type="button"
				onclick={openUrl}
				class="cursor-pointer rounded-lg border-2 border-cyan-400/30 bg-gray-900/50 p-4 transition-all hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
			>
				<QRCode text={url} width={256} height={256} class="block" />
			</button>

			<div class="flex gap-2">
				<button
					type="button"
					onclick={copyToClipboard}
					class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-gray-900/50 px-4 py-2 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-gray-800/70"
				>
					{#if copied}
						<Check class="h-5 w-5" />
						<span>{$_('bingo.copied', { default: 'Copied!' })}</span>
					{:else}
						<Copy class="h-5 w-5" />
						<span>{$_('bingo.copy', { default: 'Copy' })}</span>
					{/if}
				</button>

				{#if hasShareSupport}
					<button
						type="button"
						onclick={share}
						class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-gray-900/50 px-4 py-2 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-gray-800/70"
					>
						<Share class="h-5 w-5" />
						<span>{$_('bingo.share', { default: 'Share' })}</span>
					</button>
				{/if}

				<button
					type="button"
					onclick={openUrl}
					class="flex items-center gap-2 rounded-lg border-2 border-purple-400/30 bg-gray-900/50 px-4 py-2 text-purple-400 transition-all hover:border-purple-400 hover:bg-gray-800/70"
				>
					<ExternalLink class="h-5 w-5" />
					<span>{$_('bingo.openGrid', { default: 'Open Grid' })}</span>
				</button>
			</div>
		</div>
	</div>
</Popup>
