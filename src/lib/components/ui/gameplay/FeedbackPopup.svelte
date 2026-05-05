<script lang="ts">
	import { _ } from 'svelte-i18n';
	import Popup from '../primitives/Popup.svelte';
	import { analytics } from '$lib/game-logger';
	import Loader from 'lucide-svelte/icons/loader-2';
	import Send from 'lucide-svelte/icons/send';
	import MessageSquare from 'lucide-svelte/icons/message-square';

	interface Props {
		visible: boolean;
		onClose: () => void;
	}

	let { visible, onClose }: Props = $props();

	let message = $state('');
	let email = $state('');
	let isSending = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);

	const charCount = $derived(message.length);
	const isTooShort = $derived(charCount > 0 && charCount < 5);
	const isTooLong = $derived(charCount > 1000);
	const isValid = $derived(charCount >= 5 && charCount <= 1000);

	async function handleSubmit() {
		if (!isValid || isSending) return;

		isSending = true;
		error = null;

		const result = await analytics.sendFeedback(message.trim(), email.trim() || undefined);

		isSending = false;

		if (result) {
			success = true;
			message = '';
			email = '';
			setTimeout(() => {
				success = false;
				onClose();
			}, 2000);
		} else {
			error = 'Failed to send feedback. Please try again.';
		}
	}

	function handleClose() {
		if (isSending) return;
		onClose();
	}
</script>

<Popup {visible} onClose={handleClose} width="w-full max-w-3xl md:min-w-[600px]">
	<div class="flex flex-col gap-6">
		<!-- Header -->
		<div class="flex items-center gap-3 border-b border-slate-800 pb-4">
			<MessageSquare class="h-6 w-6 text-cyan-400" />
			<h2 class="text-2xl font-bold text-white">{$_('feedback.title')}</h2>
		</div>

		<div class="flex flex-col gap-4">
			{#if success}
				<div class="flex flex-col items-center justify-center gap-4 py-8 text-center">
					<div
						class="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-400"
					>
						<Send class="h-8 w-8" />
					</div>
					<p class="text-lg font-medium text-slate-200">{$_('feedback.success')}</p>
				</div>
			{:else}
				<p class="text-sm text-slate-400">
					{$_('feedback.prompt')}
				</p>

				<div class="flex flex-col gap-2">
					<div class="relative">
						<textarea
							bind:value={message}
							placeholder={$_('feedback.placeholder')}
							class="h-48 w-full rounded-xl border-2 {isTooShort || isTooLong
								? 'border-red-500/50'
								: 'border-slate-700/50'} bg-slate-950/50 p-4 text-lg text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-hidden"
							disabled={isSending}
							maxlength="1100"
						></textarea>
						<div
							class="absolute right-3 bottom-3 text-xs {isTooLong || isTooShort
								? 'text-red-400'
								: charCount > 900
									? 'text-yellow-400'
									: 'text-slate-500'}"
						>
							{charCount}/1000
						</div>
					</div>
					<input
						type="email"
						bind:value={email}
						placeholder={$_('common.emailPlaceholder')}
						class="w-full rounded-xl border-2 border-slate-700/50 bg-slate-950/50 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/50 focus:outline-hidden"
						disabled={isSending}
						maxlength="254"
					/>
				</div>

				{#if error}
					<p class="text-xs text-red-400">{error}</p>
				{/if}

				<button
					type="button"
					onclick={handleSubmit}
					disabled={isSending || !isValid}
					class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-cyan-400 bg-slate-900 py-3.5 font-bold text-white shadow-[0_0_20px_rgba(34,211,238,0.4)] transition-all duration-200 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isSending}
						<Loader class="h-5 w-5 animate-spin" />
						{$_('feedback.sending')}
					{:else}
						<Send class="h-5 w-5" />
						{$_('feedback.submit')}
					{/if}
				</button>
			{/if}
		</div>
	</div>
</Popup>
