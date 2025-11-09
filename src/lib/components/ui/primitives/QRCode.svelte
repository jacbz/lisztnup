<script lang="ts">
	import { onMount } from 'svelte';
	import QRCodeLib from 'qrcode';

	interface Props {
		text: string;
		width?: number;
		height?: number;
		class?: string;
	}

	let { text, width = 256, height = 256, class: className = '' }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state();

	async function generateQRCode() {
		if (!canvas) return;

		try {
			await QRCodeLib.toCanvas(canvas, text, {
				width,
				margin: 1,
				color: {
					dark: '#06b6d4', // cyan-500
					light: '#111827' // gray-900
				}
			});
		} catch (error) {
			console.error('Error generating QR code:', error);
		}
	}

	$effect(() => {
		if (canvas && text) {
			generateQRCode();
		}
	});

	onMount(() => {
		generateQRCode();
	});
</script>

<canvas bind:this={canvas} {width} {height} class={className}></canvas>
