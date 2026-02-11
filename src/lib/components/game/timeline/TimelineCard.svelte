<script lang="ts">
	import type { Track } from '$lib/types';
	import Logo from '$lib/components/ui/primitives/Logo.svelte';

	interface Props {
		track?: Track | null;
		/**
		 * face-down: Logo (Back of card)
		 * revealed: Year text (Front of card)
		 * interactive: Active turn (Player Control slot)
		 */
		state?: 'face-down' | 'revealed' | 'interactive';

		size?: 'xs' | 'sm' | 'md' | 'lg';
		borderVariant?: 'neutral' | 'correct' | 'wrong';

		// For 'revealed' state
		yearText?: string;

		// Interaction
		draggable?: boolean;
		onClick?: () => void;
		onPointerDown?: (ev: PointerEvent) => void;

		// Slot for interactive content (PlayerControl)
		children?: import('svelte').Snippet;
	}

	let {
		state = 'face-down',
		size = 'md',
		borderVariant = 'neutral',
		yearText = '',
		draggable = false,
		onClick = () => {},
		onPointerDown = () => {},
		children
	}: Props = $props();

	const borderRadius = $derived.by(() => (size === 'xs' ? 'rounded-[6px]' : 'rounded-[10px]'));

	const sizeClasses = $derived.by(() => {
		switch (size) {
			case 'xs':
				return 'h-7 w-7 md:h-8 md:w-8 max-w-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))] max-h-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))]';
			case 'sm':
				return 'h-14 w-14 md:h-16 md:w-16 max-w-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))] max-h-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))]';
			case 'md':
				return 'h-14 w-14 md:h-18 md:w-18 max-w-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))] max-h-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))]';
			case 'lg':
				return 'h-40 w-40 md:h-48 md:w-48 max-w-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))] max-h-[calc((90cqw-var(--gap)*(var(--entry-count)-1))/var(--entry-count))]';
		}
	});

	const borderClasses = $derived.by(() => {
		switch (borderVariant) {
			case 'correct':
				return 'border-green-400/80 shadow-[0_0_15px_rgba(74,222,128,0.4)]';
			case 'wrong':
				return 'border-red-400/80 shadow-[0_0_15px_rgba(248,113,113,0.4)]';
			default:
				return 'border-slate-700/70';
		}
	});

	const isInteractive = $derived(state === 'interactive');
	// In 'revealed' mode (year), we allow clicking if the parent asks (for inspection)
	const isClickable = $derived(isInteractive || (state === 'revealed' && !draggable));
</script>

<button
	type="button"
	class={`relative shrink ${borderRadius} border-2 bg-slate-900 backdrop-blur-sm ${sizeClasses} ${borderClasses} transition-all`}
	style="container-type: size;"
	class:cursor-pointer={isClickable || draggable}
	class:cursor-grab={draggable}
	class:touch-none={draggable}
	onclick={() => isClickable && onClick()}
	onpointerdown={(ev) => draggable && onPointerDown(ev)}
>
	<!-- Subtle paper-ish highlight -->
	<div
		class={`pointer-events-none absolute inset-0 ${borderRadius} bg-linear-to-br from-white/8 to-transparent`}
	></div>

	<div class="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
		{#if state === 'interactive'}
			<div class="h-full w-full">
				{@render children?.()}
			</div>
		{:else if state === 'revealed'}
			<div class="font-black tracking-wide text-slate-200" style="font-size: 40cqw;">
				{yearText}
			</div>
		{:else}
			<!-- Face Down / Logo -->
			<div
				class="pointer-events-none flex h-full w-full items-center justify-center opacity-80 select-none"
			>
				<Logo size="fit" onClick={() => {}} />
			</div>
		{/if}
	</div>
</button>
