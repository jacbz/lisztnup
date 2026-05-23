<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import NationalFlag from 'lucide-svelte/icons/flag';
	import { onMount, tick } from 'svelte';
	import { locale } from 'svelte-i18n';
	import Flag from './Flag.svelte';

	export interface CountryDropdownOption {
		code: string;
		count?: number;
	}

	interface Props {
		options: CountryDropdownOption[];
		value?: string | null;
		variant?: 'filter' | 'icon';
		active?: boolean;
		allLabel?: string;
		emptyLabel?: string;
		ariaLabel?: string;
		title?: string;
		showCounts?: boolean;
		maxMenuHeight?: number;
		openWhenActiveOnly?: boolean;
		onChange?: (country: string) => void;
		onClear?: () => void;
		onTriggerClick?: () => void;
	}

	let {
		options,
		value = null,
		variant = 'filter',
		active = false,
		allLabel = '',
		emptyLabel = '',
		ariaLabel = '',
		title = '',
		showCounts = true,
		maxMenuHeight = 208,
		openWhenActiveOnly = false,
		onChange = () => {},
		onClear,
		onTriggerClick = () => {}
	}: Props = $props();

	let isOpen = $state(false);
	let triggerElement: HTMLButtonElement | null = $state(null);
	let menuElement: HTMLDivElement | null = $state(null);
	let menuStyle = $state('');

	const countryDisplayNames = $derived.by(() => {
		try {
			return new Intl.DisplayNames([$locale ?? 'en'], { type: 'region' });
		} catch {
			return new Intl.DisplayNames(['en'], { type: 'region' });
		}
	});

	function countryName(country: string): string {
		try {
			return countryDisplayNames.of(country) ?? country;
		} catch {
			return country;
		}
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);

		return {
			destroy() {
				node.remove();
			}
		};
	}

	function updateMenuPosition() {
		if (!triggerElement || typeof window === 'undefined') return;

		const rect = triggerElement.getBoundingClientRect();
		const width = variant === 'filter' ? Math.max(192, rect.width) : 208;
		const menuMaxHeight = Math.min(maxMenuHeight, window.innerHeight - 16);
		const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
		const belowTop = rect.bottom + 4;
		const aboveTop = rect.top - menuMaxHeight - 4;
		const top =
			belowTop + menuMaxHeight <= window.innerHeight || aboveTop < 8
				? Math.min(belowTop, window.innerHeight - menuMaxHeight - 8)
				: aboveTop;

		menuStyle = `top: ${Math.max(8, top)}px; left: ${left}px; width: ${width}px; max-height: ${menuMaxHeight}px;`;
	}

	async function openMenu() {
		isOpen = true;
		await tick();
		updateMenuPosition();
	}

	function toggleMenu() {
		if (isOpen) {
			isOpen = false;
		} else {
			void openMenu();
		}
	}

	function handleClick() {
		const wasActive = active;
		onTriggerClick();
		if (openWhenActiveOnly && !wasActive) return;
		toggleMenu();
	}

	function handleClear() {
		onClear?.();
		isOpen = false;
	}

	function handleSelect(country: string) {
		onChange(country);
		isOpen = false;
	}

	function handlePointerDown(event: PointerEvent) {
		if (!isOpen) return;
		const target = event.target as Node | null;
		if (!target) return;
		if (triggerElement?.contains(target) || menuElement?.contains(target)) return;
		isOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') isOpen = false;
	}

	onMount(() => {
		document.addEventListener('pointerdown', handlePointerDown, true);
		document.addEventListener('keydown', handleKeydown);
		window.addEventListener('resize', updateMenuPosition);
		window.addEventListener('scroll', updateMenuPosition, true);

		return () => {
			document.removeEventListener('pointerdown', handlePointerDown, true);
			document.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('resize', updateMenuPosition);
			window.removeEventListener('scroll', updateMenuPosition, true);
		};
	});
</script>

<button
	bind:this={triggerElement}
	type="button"
	onclick={handleClick}
	class={variant === 'icon'
		? `relative flex w-9 items-center justify-center rounded-full py-1 transition-all ${
				active ? 'bg-cyan-400 text-slate-950' : 'text-slate-500 hover:text-slate-200'
			}`
		: `flex items-center gap-1.5 rounded-full border-none px-2.5 py-1 text-xs font-medium transition-all duration-150 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none ${
				value
					? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50'
					: 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
			}`}
	aria-label={ariaLabel || title}
	aria-haspopup="listbox"
	aria-expanded={isOpen}
	{title}
>
	{#if variant === 'icon'}
		{#if active && value}
			<span class="flex items-center gap-0.5">
				<Flag country={value} size="xs" />
				<ChevronDown class="-mr-1 h-2.5 w-2.5 opacity-45" />
			</span>
		{:else}
			<NationalFlag class="h-3 w-3" />
		{/if}
	{:else}
		{#if value}
			<Flag country={value} size="xs" />
			<span>{countryName(value)}</span>
		{:else}
			<span>{allLabel}</span>
		{/if}
		<ChevronDown class="h-3 w-3 opacity-70" />
	{/if}
</button>

{#if isOpen}
	<div
		bind:this={menuElement}
		use:portal
		class="fixed z-1000 overflow-y-auto rounded-md border border-cyan-400/20 bg-slate-950 py-1 shadow-2xl"
		style={menuStyle}
		role="listbox"
	>
		{#if onClear && allLabel}
			<button
				type="button"
				onclick={handleClear}
				class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors {value
					? 'text-slate-300 hover:bg-slate-800 hover:text-cyan-300'
					: 'bg-cyan-400/10 text-cyan-300'}"
			>
				<span class="min-w-0 flex-1 truncate">{allLabel}</span>
			</button>
		{/if}
		{#if options.length === 0}
			<p class="px-3 py-2 text-xs text-slate-500">{emptyLabel}</p>
		{:else}
			{#each options as option (option.code)}
				<button
					type="button"
					onclick={() => handleSelect(option.code)}
					class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors {value ===
					option.code
						? 'bg-cyan-400/10 text-cyan-300'
						: 'text-slate-300 hover:bg-slate-800 hover:text-cyan-300'}"
					role="option"
					aria-selected={value === option.code}
				>
					<Flag country={option.code} size="md" />
					<span class="min-w-0 flex-1 truncate">{countryName(option.code)}</span>
					{#if showCounts && option.count != null}
						<span class="text-slate-500 tabular-nums">{option.count}</span>
					{/if}
				</button>
			{/each}
		{/if}
	</div>
{/if}
