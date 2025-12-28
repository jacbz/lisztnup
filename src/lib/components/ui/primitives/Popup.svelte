<script lang="ts">
	import type { Snippet } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import X from 'lucide-svelte/icons/x';

	interface Props {
		/**
		 * Whether the popup is visible.
		 * @default false
		 */
		visible?: boolean;
		/**
		 * The function to call when the popup is closed.
		 */
		onClose?: () => void;
		/**
		 * The content of the popup.
		 */
		children?: Snippet;
		/**
		 * Width preset or custom width class.
		 * @default 'md'
		 */
		width?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '5xl' | '6xl' | 'screen' | string;
		/**
		 * Padding.
		 * @default 'md'
		 */
		padding?: 'none' | 'sm' | 'md' | 'lg' | 'responsive';
		/**
		 * Overflow behavior.
		 * @default 'auto'
		 */
		overflow?: 'auto' | 'hidden' | 'visible';
		/**
		 * Border color.
		 * @default 'border-cyan-400'
		 */
		borderColor?: string;
		/**
		 * Shadow color for the glow effect.
		 * @default 'rgba(34,211,238,0.3)'
		 */
		shadowColor?: string;
		/**
		 * Whether to show the close button in the top-right corner.
		 * @default true
		 */
		showCloseButton?: boolean;
	}

	let {
		visible = false,
		onClose = () => {},
		children,
		width = 'md',
		padding = 'md',
		overflow = 'auto',
		borderColor = 'border-cyan-400',
		shadowColor = 'rgba(34,211,238,0.3)',
		showCloseButton = true
	}: Props = $props();

	function handleBackdropClick() {
		onClose();
	}

	function handleCloseClick() {
		onClose();
	}

	// Build width classes
	const widthClass = $derived.by(() => {
		if (
			typeof width === 'string' &&
			(width.startsWith('w-') || width.startsWith('max-w-') || width.startsWith('min-w-'))
		) {
			return width;
		}

		if (width === 'screen') {
			// let inline style control the exact width; keep classes permissive
			return 'w-dvw max-w-[95vw] h-dvh max-h-[95vh]';
		}
		const widthMap: Record<string, string> = {
			sm: 'w-full max-w-sm',
			md: 'w-full max-w-md',
			lg: 'w-full max-w-lg',
			xl: 'w-full max-w-xl',
			'2xl': 'w-full max-w-2xl',
			'3xl': 'w-full max-w-3xl',
			'5xl': 'w-full max-w-5xl min-w-0 lg:min-w-5xl',
			'6xl': 'w-full max-w-6xl'
		};
		return widthMap[width] || 'w-full max-w-md';
	});

	// Build overflow class
	const overflowClass = $derived(
		overflow === 'auto' ? 'overflow-y-auto' : overflow === 'hidden' ? 'overflow-hidden' : ''
	);

	// Build padding class
	const paddingClass = $derived.by(() => {
		const paddingMap: Record<string, string> = {
			none: 'p-0',
			sm: 'p-4',
			md: 'p-6',
			lg: 'p-8',
			responsive: 'p-4 md:p-8'
		};
		return paddingMap[padding] || 'p-6';
	});

	// Build border class/style
	const borderClass = $derived(
		borderColor && (borderColor.startsWith('border-') || borderColor.startsWith('#'))
			? borderColor.startsWith('#')
				? ''
				: `border-2 ${borderColor}`
			: ''
	);
	const borderStyle = $derived(
		borderColor?.startsWith('#') ? `border: 2px solid ${borderColor};` : ''
	);

	// Combine all classes
	const containerClasses = $derived(
		`relative ${widthClass} max-h-[90vh] ${overflowClass} rounded-2xl ${borderClass} bg-slate-900 ${paddingClass}`.trim()
	);

	// Build combined style
	const containerStyle = $derived(
		[borderStyle, `box-shadow: 0 0 30px ${shadowColor};`].filter(Boolean).join(' ')
	);
</script>

{#if visible}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/60"
		onclick={handleBackdropClick}
		role="presentation"
		in:fade={{ duration: 200 }}
		out:fade={{ duration: 200, delay: 100 }}
	></div>

	<!-- Content -->
	<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="pointer-events-auto"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			in:scale={{ duration: 300, easing: cubicOut, start: 0.9 }}
			out:scale={{ duration: 200, easing: cubicOut, start: 0.9 }}
		>
			<div class={containerClasses} style={containerStyle}>
				<!-- Close Button -->
				{#if showCloseButton}
					<button
						type="button"
						class="absolute top-4 right-4 z-10 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
						onclick={handleCloseClick}
						aria-label="Close"
					>
						<X class="h-6 w-6" />
					</button>
				{/if}

				{@render children?.()}
			</div>
		</div>
	</div>
{/if}
