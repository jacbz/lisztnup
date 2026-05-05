<script lang="ts">
	import { locale } from 'svelte-i18n';

	interface Props {
		country: string | undefined | null;
		size?: 'xs' | 'sm' | 'md';
		faded?: boolean;
		class?: string;
	}

	let { country, size = 'sm', faded = false, class: cls = '' }: Props = $props();

	const sizeClasses: Record<string, string> = {
		xs: 'h-2 w-3 rounded-[1px]',
		sm: 'h-2.5 w-3.75 rounded-xs',
		md: 'h-4 w-6 rounded-sm'
	};

	const flagUrl = $derived(() => {
		if (!country || country.length !== 2 || country === 'UNKNOWN') return null;
		return `/flags/${country.toUpperCase()}.svg`;
	});

	const title = $derived(() => {
		if (!country || country.length !== 2 || country === 'UNKNOWN') return '';
		try {
			return (
				new Intl.DisplayNames([$locale ?? 'en'], { type: 'region' }).of(country.toUpperCase()) ?? ''
			);
		} catch {
			return '';
		}
	});
</script>

{#if flagUrl()}
	<img
		src={flagUrl()}
		alt=""
		title={title()}
		class="inline-block border-[0.5px] border-slate-600 align-baseline select-none {sizeClasses[
			size
		]} {cls}"
		class:opacity-50={faded}
		draggable="false"
		oncontextmenu={(e) => e.preventDefault()}
	/>
{/if}
