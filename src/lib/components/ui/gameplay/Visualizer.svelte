<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';

	interface Props {
		analyserNode: AnalyserNode | null;
		width: number;
		height: number;
	}

	let { analyserNode, width, height }: Props = $props();

	let canvas: HTMLCanvasElement | undefined = $state(undefined);
	let animationFrameId: number | null = null;
	let opacity = $state(0);
	let isMounted = $state(false);

	onMount(() => {
		// Small delay to ensure smooth fade-in even if analyserNode is already available
		setTimeout(() => {
			isMounted = true;
		}, 50);
	});

	// Track changes to analyserNode only (not canvas or dimensions)
	$effect(() => {
		const node = analyserNode;

		// Clean up previous animation if running
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}

		// Use untrack to access canvas, width, height without tracking them
		const currentCanvas = untrack(() => canvas);
		const currentWidth = untrack(() => width);
		const currentHeight = untrack(() => height);

		// Wait for canvas to be available
		if (!currentCanvas) {
			return;
		}

		const context = currentCanvas.getContext('2d');
		if (!context) {
			return;
		}

		// If no analyser, fade out and clear canvas
		if (!node) {
			// Fade out
			opacity = 0;

			// Clear canvas after fade completes
			setTimeout(() => {
				if (!analyserNode) {
					context.clearRect(0, 0, currentWidth, currentHeight);
				}
			}, 300);
			return;
		}

		// Only fade in if component is mounted
		if (untrack(() => isMounted)) {
			opacity = 1;
		}

		// Set up analyser
		node.fftSize = 256;
		const bufferLength = node.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);

		let isRunning = true;

		const draw = () => {
			if (!isRunning) return;

			animationFrameId = requestAnimationFrame(draw);

			node.getByteFrequencyData(dataArray);

			// Clear with transparency for no background
			context.clearRect(0, 0, currentWidth, currentHeight);

			const centerY = currentHeight / 2;
			const numPoints = 120; // Points along the width
			const time = Date.now() * 0.001; // Time for wave motion

			// Draw many more horizontal flowing waves (space warp lines)
			const numWaves = 12;
			for (let wave = 0; wave < numWaves; wave++) {
				const points: { x: number; y: number }[] = [];
				const waveOffset = (wave / numWaves) * currentHeight * 0.8 - currentHeight * 0.4;
				const phaseShift = wave * 0.4;
				const speed = 1.5 + (wave % 3) * 0.5;

				// Create horizontal wave across entire width
				for (let i = 0; i <= numPoints; i++) {
					const x = (i / numPoints) * currentWidth;
					const progress = i / numPoints;

					// Sample frequency data
					const freqIndex = Math.floor(progress * bufferLength);
					const amplitude = dataArray[freqIndex] / 255;

					// Create flowing sine wave with audio reactivity
					const baseY = centerY + waveOffset;
					const waveHeight = currentHeight * 0.12;
					const audioInfluence = amplitude * waveHeight * 0.8;
					const flowingWave =
						Math.sin(progress * Math.PI * 6 + time * speed + phaseShift) * waveHeight * 0.25;

					const y = baseY + flowingWave + audioInfluence;
					points.push({ x, y });
				}

				// Draw smooth wave line
				if (points.length > 2) {
					context.beginPath();
					context.moveTo(points[0].x, points[0].y);

					// Use quadratic curves for ultra-smooth lines
					for (let i = 0; i < points.length - 1; i++) {
						const xc = (points[i].x + points[i + 1].x) / 2;
						const yc = (points[i].y + points[i + 1].y) / 2;
						context.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
					}
					context.lineTo(points[points.length - 1].x, points[points.length - 1].y);

					// Neon cyan/purple gradient with more variation
					const hue = 175 + wave * 15; // Cyan through blue to purple
					const baseOpacity = 0.5 - wave * 0.035;
					context.strokeStyle = `hsla(${hue}, 90%, 70%, ${baseOpacity})`;
					context.lineWidth = 1.5 - wave * 0.08;
					context.stroke();

					// Add subtle glow effect
					context.shadowBlur = 6;
					context.shadowColor = `hsla(${hue}, 100%, 70%, ${baseOpacity * 0.4})`;
					context.stroke();
					context.shadowBlur = 0;
				}
			}
		};

		draw();

		// Cleanup function for this effect
		return () => {
			isRunning = false;
			if (animationFrameId !== null) {
				cancelAnimationFrame(animationFrameId);
				animationFrameId = null;
			}
		};
	});

	onDestroy(() => {
		if (animationFrameId !== null) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	});
</script>

<canvas
	bind:this={canvas}
	{width}
	{height}
	class="absolute top-0 left-0 z-0 transition-opacity duration-1000"
	style="opacity: {opacity};"
></canvas>
