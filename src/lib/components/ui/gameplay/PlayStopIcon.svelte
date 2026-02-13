<script lang="ts">
	import { Spring } from 'svelte/motion';

	interface Props {
		isPlaying: boolean;
		size?: number;
		color?: string;
	}

	let { isPlaying, size = 24, color = 'currentColor' }: Props = $props();

	// Define the shape points for Stop (Square) and Play (Triangle)
	// We use 4 points for both to allow smooth morphing.
	// Coordinate system: viewBox="-50 -50 100 100"

	// Stop: Centered Square
	// TL, TR, BR, BL
	const stopPoints = [
		{ x: -34, y: -34 }, // TL
		{ x: 34, y: -34 }, // TR
		{ x: 34, y: 34 }, // BR
		{ x: -34, y: 34 } // BL
	];

	// Play: Right-pointing Triangle
	// To morph from square:
	// P1 (TL) matches Top-Left of triangle
	// P2 (TR) and P3 (BR) merge to form the Tip of the triangle
	// P4 (BL) matches Bottom-Left of triangle
	const playPoints = [
		{ x: -24, y: -37 }, // Top-Left
		{ x: 38, y: 0 }, // Tip (Top part)
		{ x: 38, y: 0 }, // Tip (Bottom part) - Merged with above
		{ x: -24, y: 37 } // Bottom-Left
	];

	// Create a single spring for all points
	const shapeSpring = new Spring(isPlaying ? stopPoints : playPoints, {
		stiffness: 0.1,
		damping: 0.4
	});

	// Update spring when isPlaying changes
	$effect(() => {
		shapeSpring.target = isPlaying ? stopPoints : playPoints;
	});

	// Construct SVG path from animated points
	const d = $derived(
		`M ${shapeSpring.current[0].x} ${shapeSpring.current[0].y} ` +
			`L ${shapeSpring.current[1].x} ${shapeSpring.current[1].y} ` +
			`L ${shapeSpring.current[2].x} ${shapeSpring.current[2].y} ` +
			`L ${shapeSpring.current[3].x} ${shapeSpring.current[3].y} Z`
	);
</script>

<div
	style="width: {size}px; height: {size}px; display: flex; align-items: center; justify-content: center;"
>
	<svg
		viewBox="-50 -50 100 100"
		width="100%"
		height="100%"
		style="overflow: visible;"
		class="text-cyan-400"
	>
		<!-- 
            We use stroke-linejoin="round" and a thick stroke to achieve rounded corners 
            while keeping the fill. 
            paint-order="stroke" ensures the stroke doesn't eat into the shape if we didn't want it to,
            but here we want the roundness on the outside.
        -->
		<path
			{d}
			fill={color}
			stroke={color}
			stroke-width="12"
			stroke-linejoin="round"
			stroke-linecap="round"
			class="neon-glow transition-colors duration-300"
		/>
	</svg>
</div>

<style>
	.neon-glow {
		animation: neon-pulse 3s infinite ease-in-out;
		/* Fallback filter if animation fails or prefers reduced motion */
		filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.8))
			drop-shadow(0 0 16px rgba(34, 211, 238, 0.4));
	}

	@keyframes neon-pulse {
		0%,
		100% {
			filter: drop-shadow(0 0 6px rgba(34, 211, 238, 0.6))
				drop-shadow(0 0 12px rgba(34, 211, 238, 0.3));
		}
		50% {
			filter: drop-shadow(0 0 10px rgba(34, 211, 238, 0.9))
				drop-shadow(0 0 20px rgba(34, 211, 238, 0.6));
		}
	}
</style>
