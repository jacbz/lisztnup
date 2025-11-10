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
		shareTitle?: string;
		shareText?: string;
		showOpenButton?: boolean;
	}

	let { visible, url, onClose, shareTitle, shareText, showOpenButton = true }: Props = $props();

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
			toast.error($_('shareLink.copyFailed'));
		}
	}

	async function share() {
		try {
			if (navigator.share) {
				await navigator.share({
					title: shareTitle || $_('app.title'),
					text: shareText,
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

<Popup {visible} {onClose} width="3xl">
	<h2 class="mb-6 text-center text-2xl font-bold text-purple-400">
		{shareTitle || $_('shareLink.share')}
	</h2>

	<div class="flex min-w-[280px] flex-col items-center gap-4">
		<button
			type="button"
			onclick={openUrl}
			class="cursor-pointer rounded-lg border-2 border-cyan-400/30 bg-slate-900/50 p-4 transition-all hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)]"
		>
			<QRCode text={url} minWidth={256} class="block" />
		</button>

		<div class="flex gap-2">
			<button
				type="button"
				onclick={copyToClipboard}
				class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-slate-900/50 px-4 py-2 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-slate-800/70"
			>
				{#if copied}
					<Check class="h-5 w-5" />
					<span>{$_('shareLink.copied')}</span>
				{:else}
					<Copy class="h-5 w-5" />
					<span>{$_('shareLink.copy')}</span>
				{/if}
			</button>

			{#if hasShareSupport}
				<button
					type="button"
					onclick={share}
					class="flex items-center gap-2 rounded-lg border-2 border-cyan-400/30 bg-slate-900/50 px-4 py-2 text-cyan-400 transition-all hover:border-cyan-400 hover:bg-slate-800/70"
				>
					<Share class="h-5 w-5" />
					<span>{$_('shareLink.share')}</span>
				</button>
			{/if}

			{#if showOpenButton}
				<button
					type="button"
					onclick={openUrl}
					class="flex items-center gap-2 rounded-lg border-2 border-purple-400/30 bg-slate-900/50 px-4 py-2 text-purple-400 transition-all hover:border-purple-400 hover:bg-slate-800/70"
				>
					<ExternalLink class="h-5 w-5" />
					<span>{$_('shareLink.openLink')}</span>
				</button>
			{/if}
		</div>
	</div>
</Popup>
