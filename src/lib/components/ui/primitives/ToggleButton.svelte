<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		value?: boolean;
		onToggle?: () => void;
		disabled?: boolean;
		enabledText?: string;
		disabledText?: string;
	}

	let {
		value = false,
		onToggle = () => {},
		disabled = false,
		enabledText,
		disabledText
	}: Props = $props();

	const displayText = $derived(
		value ? enabledText || $_('common.enabled') : disabledText || $_('common.disabled')
	);
</script>

<button
	type="button"
	onclick={onToggle}
	{disabled}
	class="rounded-lg px-3 py-1.5 text-sm font-semibold transition-all"
	class:bg-cyan-400={value && !disabled}
	class:text-slate-900={value && !disabled}
	class:bg-slate-700={!value || disabled}
	class:text-slate-400={!value || disabled}
	class:cursor-not-allowed={disabled}
	class:opacity-50={disabled}
>
	{displayText}
</button>
