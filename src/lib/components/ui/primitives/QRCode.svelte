<script lang="ts">
	import { onMount } from 'svelte';
	import QRCodeLib from 'qrcode';

	interface Props {
		/**
		 * The text to encode in the QR code.
		 */
		text: string;
		/**
		 * The width of the QR code.
		 */
		width?: number;
		/**
		 * The minimum width of the QR code.
		 */
		minWidth?: number;
		/**
		 * Additional classes to apply to the canvas.
		 * @default ''
		 */
		class?: string;
	}

	let { text, width, minWidth, class: className = '' }: Props = $props();

	let viewportWidth = $state(0);
	let viewportHeight = $state(0);

	function updateViewport() {
		viewportWidth = window.innerWidth;
		viewportHeight = window.innerHeight;
	}

	let computedWidth = $derived(
		width ?? Math.min(Math.max(viewportWidth * 0.6, minWidth ?? 0), viewportHeight * 0.6)
	);
	let canvas: HTMLCanvasElement | undefined = $state();

	async function generateQRCode() {
		if (!canvas) return;

		try {
			await QRCodeLib.toCanvas(canvas, text, {
				width: computedWidth,
				margin: 1,
				color: {
					dark: '#06b6d4', // cyan-500
					light: '#ffffff00' // transparent
				}
			});
		} catch (error) {
			console.error('Error generating QR code:', error);
		}
	}

	$effect(() => {
		if (canvas && text && computedWidth) {
			generateQRCode();
		}
	});

	onMount(() => {
		updateViewport();
		window.addEventListener('resize', updateViewport);
		generateQRCode();
		return () => window.removeEventListener('resize', updateViewport);
	});
</script>

<canvas bind:this={canvas} width={computedWidth} class={className}></canvas>
