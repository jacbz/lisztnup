<script lang="ts">
	import type { GuessCategory } from '$lib/types';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		onCategorySelected?: (category: GuessCategory) => void;
		onSpinStart?: () => void;
		onSpinEnd?: () => void;
		currentRoundIndex?: number; // Used to reset state between rounds
	}

	let {
		onCategorySelected = () => {},
		onSpinStart = () => {},
		onSpinEnd = () => {},
		currentRoundIndex = 0
	}: Props = $props();

	const categories: {
		id: GuessCategory;
		color1: string;
		color2: string;
		glowColor: string;
		iconPath: string;
	}[] = [
		{
			id: 'composer',
			color1: '#06b6d4',
			color2: '#22d3ee',
			glowColor: 'rgba(6, 182, 212, 0.8)',
			// Person icon (user-circle)
			iconPath:
				'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'
		},
		{
			id: 'composition',
			color1: '#ec4899',
			color2: '#f472b6',
			glowColor: 'rgba(236, 72, 153, 0.8)',
			// Music note icon
			iconPath:
				'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'
		},
		{
			id: 'year',
			color1: '#8b5cf6',
			color2: '#a78bfa',
			glowColor: 'rgba(139, 92, 246, 0.8)',
			// Calendar icon
			iconPath:
				'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z'
		},
		{
			id: 'type',
			color1: '#f59e0b',
			color2: '#fbbf24',
			glowColor: 'rgba(245, 158, 11, 0.8)',
			// Piano/keyboard icon
			iconPath:
				'M4 2v20h16V2H4zm6 18H6v-6h4v6zm0-8H6V6h4v6zm5 8h-4v-6h4v6zm0-8h-4V6h4v6zm5 8h-4v-6h4v6zm0-8h-4V6h4v6z'
		},
		{
			id: 'decade',
			color1: '#10b981',
			color2: '#34d399',
			glowColor: 'rgba(16, 185, 129, 0.8)',
			// Clock icon
			iconPath:
				'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'
		}
	];

	let canvas: HTMLCanvasElement;
	let rotation = $state(0);
	let isSpinning = $state(false);
	let showSpinText = $state(true);
	let selectedCategory = $state<GuessCategory | null>(null);
	let wheelSize = $state(600);
	let prevRoundIndex = $state(currentRoundIndex);
	let animationFrameId: number | null = null;
	let currentRotation = $state(0);

	// Drag state
	let isDragging = $state(false);
	let dragStartAngle = 0;
	let dragStartRotation = 0;
	let lastDragAngle = 0;
	let lastDragTime = 0;
	let dragVelocity = 0;
	let totalDragDistance = 0;

	// SVG overlay for text
	let svgOverlay: SVGSVGElement;

	// Reset showSpinText when moving to a new round
	$effect(() => {
		if (currentRoundIndex !== prevRoundIndex) {
			showSpinText = true;
			prevRoundIndex = currentRoundIndex;
		}
	});

	// Redraw when rotation changes
	$effect(() => {
		if (canvas) {
			drawWheel();
		}
	});

	onMount(() => {
		updateWheelSize();
		window.addEventListener('resize', handleResize);
		drawWheel();
		return () => {
			window.removeEventListener('resize', handleResize);
			if (animationFrameId) cancelAnimationFrame(animationFrameId);
		};
	});

	function handleResize() {
		updateWheelSize();
		if (canvas) {
			drawWheel();
		}
	}

	function updateWheelSize() {
		const minDimension = Math.min(window.innerWidth, window.innerHeight);
		wheelSize = minDimension < 600 ? minDimension : minDimension * 0.9;
	}

	function drawWheel() {
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const size = wheelSize;

		canvas.width = size * dpr;
		canvas.height = size * dpr;
		canvas.style.width = `${size}px`;
		canvas.style.height = `${size}px`;

		ctx.scale(dpr, dpr);

		const centerX = size / 2;
		const centerY = size / 2;
		const radius = size * 0.42;
		const centerCircleRadius = size * 0.16;
		const gapWidth = size * 0.01; // The desired constant pixel width for the gap
		const halfGap = gapWidth / 2;

		ctx.clearRect(0, 0, size, size);

		const segmentAngle = (Math.PI * 2) / categories.length;

		categories.forEach((category, i) => {
			const baseAngle = i * segmentAngle + (currentRotation * Math.PI) / 180 - Math.PI / 2;
			const endSegmentAngle = baseAngle + segmentAngle;

			// To create a constant-width gap, we calculate the angular offset
			// at both the inner and outer radius. This makes the segment sides straight lines
			// connecting the offset points, forming a constant-width gap.
			const outerAngleOffset = Math.asin(halfGap / radius);
			const innerAngleOffset = Math.asin(halfGap / centerCircleRadius);

			// Define the four corner angles of the segment
			const startAngleOuter = baseAngle + outerAngleOffset;
			const startAngleInner = baseAngle + innerAngleOffset;
			const endAngleOuter = endSegmentAngle - outerAngleOffset;
			const endAngleInner = endSegmentAngle - innerAngleOffset;

			// The logical middle of the segment for icon placement
			const midAngle = baseAngle + segmentAngle / 2;

			ctx.shadowColor = category.glowColor;
			ctx.shadowBlur = 100;

			const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
			gradient.addColorStop(0.3, category.color2);
			gradient.addColorStop(1, category.color1);

			ctx.beginPath();
			// Start at inner-left corner
			ctx.moveTo(
				centerX + centerCircleRadius * Math.cos(startAngleInner),
				centerY + centerCircleRadius * Math.sin(startAngleInner)
			);
			// Line to outer-left corner
			ctx.lineTo(
				centerX + radius * Math.cos(startAngleOuter),
				centerY + radius * Math.sin(startAngleOuter)
			);
			// Arc along outer edge to outer-right corner
			ctx.arc(centerX, centerY, radius, startAngleOuter, endAngleOuter, false);
			// Line to inner-right corner
			ctx.lineTo(
				centerX + centerCircleRadius * Math.cos(endAngleInner),
				centerY + centerCircleRadius * Math.sin(endAngleInner)
			);
			// Arc along inner edge back to the start
			ctx.arc(centerX, centerY, centerCircleRadius, endAngleInner, startAngleInner, true);
			ctx.closePath();
			ctx.fillStyle = gradient;
			ctx.fill();

			ctx.shadowColor = 'transparent';
			ctx.shadowBlur = 0;

			const iconDistance = radius * 0.68;
			const iconX = centerX + Math.cos(midAngle) * iconDistance;
			const iconY = centerY + Math.sin(midAngle) * iconDistance;

			ctx.save();
			ctx.translate(iconX, iconY);
			ctx.rotate(midAngle + Math.PI / 2);

			const iconScale = size / 500;
			drawSVGPath(ctx, category.iconPath, iconScale * 1.5);

			ctx.restore();
		});

		// Cut out the center circle
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		ctx.beginPath();
		ctx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();

		if (showSpinText) {
			ctx.fillStyle = 'white';
			ctx.font = `800 ${size * 0.064}px Rajdhani, sans-serif`;
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.shadowColor = 'rgba(34, 211, 238, 0.8)';
			ctx.shadowBlur = 8;
			ctx.shadowOffsetX = 0;
			ctx.shadowOffsetY = 2;

			const spinText = ($_('game.spin') as string).toUpperCase();
			ctx.fillText(spinText, centerX, centerY);

			ctx.shadowColor = 'transparent';
			ctx.shadowBlur = 0;
		}

		// Draw pointer
		const pointerY = size * 0.01;
		const pointerHeight = size * 0.08;
		const pointerWidth = size * 0.06;

		ctx.save();
		ctx.translate(centerX, pointerY);

		ctx.beginPath();
		ctx.moveTo(0, pointerHeight);
		ctx.lineTo(-pointerWidth / 2, 0);
		ctx.lineTo(pointerWidth / 2, 0);
		ctx.closePath();

		const pointerGradient = ctx.createLinearGradient(0, 0, 0, pointerHeight);
		pointerGradient.addColorStop(0, '#ff4d4d');
		pointerGradient.addColorStop(1, '#ff0000');

		ctx.fillStyle = pointerGradient;
		ctx.strokeStyle = '#ff8080';
		ctx.lineWidth = 2;
		ctx.shadowColor = 'rgba(255, 0, 0, 0.8)';
		ctx.shadowBlur = 15;

		ctx.fill();
		ctx.stroke();

		ctx.restore();
	}

	function drawSVGPath(ctx: CanvasRenderingContext2D, pathData: string, scale: number) {
		// This is a simplified SVG path renderer for basic shapes
		// Parse and draw the SVG path
		const path = new Path2D(pathData);

		ctx.save();
		ctx.scale(scale, scale);
		ctx.translate(-12, -12); // Center the 24x24 icon

		ctx.fillStyle = 'white';
		ctx.globalAlpha = 0.9;
		ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
		ctx.shadowBlur = 4;
		ctx.fill(path);
		ctx.globalAlpha = 1;

		ctx.restore();
	}

	function spinWithVelocity(velocity: number) {
		if (isSpinning) return;

		isSpinning = true;
		showSpinText = false;
		selectedCategory = null;
		onSpinStart();

		// Physics-based spin with initial velocity
		const friction = 0.98; // Smoother friction for longer, more natural spin
		const minVelocity = 0.3; // Lower threshold for smoother final deceleration
		let currentVelocity = velocity;

		const startTime = Date.now();

		function animate() {
			const elapsed = Date.now() - startTime;

			// Apply friction
			currentVelocity *= friction;

			// Update rotation
			currentRotation += currentVelocity;

			drawWheel();

			if (Math.abs(currentVelocity) > minVelocity) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				// Stop where it naturally stops
				rotation = currentRotation;
				isSpinning = false;

				// Calculate which category the pointer is pointing at
				// Segments are drawn starting from -90° (right) + rotation
				// Pointer is at top: 90°
				const segmentSize = 360 / categories.length;
				const normalizedRotation = ((currentRotation % 360) + 360) % 360;

				// Angle from segment 0's starting position to pointer
				const angleFromSegment0 = (180 - normalizedRotation + 360) % 360;
				const categoryIndex = Math.floor(angleFromSegment0 / segmentSize) % categories.length;

				selectedCategory = categories[categoryIndex].id;
				onSpinEnd();
				onCategorySelected(selectedCategory);
			}
		}

		animate();
	}

	function getAngleFromEvent(event: MouseEvent | TouchEvent): number {
		if (!canvas) return 0;

		const rect = canvas.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		let clientX: number, clientY: number;

		if ('touches' in event && event.touches.length > 0) {
			clientX = event.touches[0].clientX;
			clientY = event.touches[0].clientY;
		} else if ('clientX' in event) {
			clientX = event.clientX;
			clientY = event.clientY;
		} else {
			return 0;
		}

		const dx = clientX - centerX;
		const dy = clientY - centerY;

		return (Math.atan2(dy, dx) * 180) / Math.PI;
	}

	function handleDragStart(event: MouseEvent | TouchEvent) {
		if (isSpinning) return;

		isDragging = true;
		totalDragDistance = 0;
		dragStartAngle = getAngleFromEvent(event);
		dragStartRotation = currentRotation;
		lastDragAngle = dragStartAngle;
		lastDragTime = Date.now();
		dragVelocity = 0;

		if (animationFrameId) {
			cancelAnimationFrame(animationFrameId);
			animationFrameId = null;
		}
	}

	function handleDragMove(event: MouseEvent | TouchEvent) {
		if (!isDragging || isSpinning) return;

		const currentAngle = getAngleFromEvent(event);
		const currentTime = Date.now();

		// Calculate angle difference (handle wrap-around)
		let angleDiff = currentAngle - lastDragAngle;
		if (angleDiff > 180) angleDiff -= 360;
		if (angleDiff < -180) angleDiff += 360;

		// Update rotation
		currentRotation = dragStartRotation + (currentAngle - dragStartAngle);
		totalDragDistance += Math.abs(angleDiff);

		// Calculate velocity
		const timeDiff = Math.max(currentTime - lastDragTime, 1);
		dragVelocity = (angleDiff / timeDiff) * 16; // Scale to ~60fps

		lastDragAngle = currentAngle;
		lastDragTime = currentTime;

		drawWheel();
	}

	function handleDragEnd(event: MouseEvent | TouchEvent) {
		if (!isDragging) return;

		isDragging = false;

		// Always use physics-based deceleration
		// Only trigger game logic if it was a forceful spin
		const significantVelocity = 5; // Threshold for "forceful" spin that triggers game logic

		rotation = currentRotation;

		if (Math.abs(dragVelocity) >= significantVelocity) {
			// Forceful spin - use physics AND trigger game callbacks
			spinWithVelocity(dragVelocity);
		} else {
			// Tap or small drag - decelerate with physics but DON'T trigger game logic
			decelerateWithPhysics(dragVelocity);
		}
	}

	function decelerateWithPhysics(initialVelocity: number) {
		// Physics-based deceleration without game callbacks
		const friction = 0.94; // Smoother friction for gentler deceleration
		const minVelocity = 0.05; // Lower threshold for smoother stop
		let currentVelocity = initialVelocity;

		function animate() {
			// Apply friction
			currentVelocity *= friction;

			// Update rotation
			currentRotation += currentVelocity;
			rotation = currentRotation;

			drawWheel();

			if (Math.abs(currentVelocity) > minVelocity) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				// Just stop - no snapping, no callbacks
				rotation = currentRotation;
			}
		}

		animate();
	}

	function handlePointerDown(event: MouseEvent | TouchEvent) {
		handleDragStart(event);
	}

	function handlePointerMove(event: MouseEvent | TouchEvent) {
		handleDragMove(event);
	}

	function handlePointerUp(event: MouseEvent | TouchEvent) {
		handleDragEnd(event);
	}

	function handlePointerCancel(event: MouseEvent | TouchEvent) {
		if (isDragging) {
			isDragging = false;
			// Reset to last stable rotation
			currentRotation = rotation;
			drawWheel();
		}
	}
</script>

<div class="wheel-wrapper" style="width: {wheelSize}px; height: {wheelSize}px;">
	<canvas
		bind:this={canvas}
		class="wheel-canvas"
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		onpointerleave={handlePointerUp}
		aria-label="Spin the wheel"
	></canvas>

	<!-- SVG overlay for curved text -->
	<svg
		bind:this={svgOverlay}
		class="text-overlay select-none"
		viewBox="0 0 {wheelSize} {wheelSize}"
		style="transform: rotate({currentRotation}deg);"
	>
		<defs>
			{#each categories as category, i}
				{@const segmentAngle = 360 / categories.length}
				{@const startAngle = segmentAngle * i - 90}
				{@const endAngle = segmentAngle * (i + 1) - 90}
				{@const radius = wheelSize * 0.42}
				{@const outerTextRadius = radius * 0.96}
				{@const innerTextRadius = radius * 0.41}
				{@const centerX = wheelSize / 2}
				{@const centerY = wheelSize / 2}

				<!-- Outer curved path (counter-clockwise for upside-down text) -->
				<path
					id="outer-curve-{i}"
					d="M {centerX + outerTextRadius * Math.cos((endAngle * Math.PI) / 180)} {centerY +
						outerTextRadius * Math.sin((endAngle * Math.PI) / 180)} 
					   A {outerTextRadius} {outerTextRadius} 0 0 0 {centerX +
						outerTextRadius * Math.cos((startAngle * Math.PI) / 180)} {centerY +
						outerTextRadius * Math.sin((startAngle * Math.PI) / 180)}"
					fill="none"
				/>

				<!-- Inner curved path (clockwise along inner edge) -->
				<path
					id="inner-curve-{i}"
					d="M {centerX + innerTextRadius * Math.cos((startAngle * Math.PI) / 180)} {centerY +
						innerTextRadius * Math.sin((startAngle * Math.PI) / 180)} 
					   A {innerTextRadius} {innerTextRadius} 0 0 1 {centerX +
						innerTextRadius * Math.cos((endAngle * Math.PI) / 180)} {centerY +
						innerTextRadius * Math.sin((endAngle * Math.PI) / 180)}"
					fill="none"
				/>
			{/each}
		</defs>

		<!-- Draw curved text for each segment -->
		{#each categories as category, i}
			{@const categoryText = ($_(`game.categories.${category.id}`) as string).toUpperCase()}

			<!-- Outer text (upside down for readability from outside) -->
			<text class="segment-text-outer" style="font-size: {wheelSize * 0.05}px;">
				<textPath href="#outer-curve-{i}" startOffset="50%" text-anchor="middle">
					{categoryText}
				</textPath>
			</text>

			<!-- Inner text (smaller) -->
			<text class="segment-text-inner" style="font-size: {wheelSize * 0.025}px;">
				<textPath href="#inner-curve-{i}" startOffset="50%" text-anchor="middle">
					{categoryText}
				</textPath>
			</text>
		{/each}
	</svg>
</div>

<style>
	.wheel-wrapper {
		position: relative;
		margin: 0 auto;
	}

	.wheel-canvas {
		cursor: pointer;
		touch-action: none;
		display: block;
	}

	.text-overlay {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		transform-origin: center;
		transition: transform 0s linear;
	}

	.segment-text-outer,
	.segment-text-inner {
		fill: white;
		font-weight: 300;
		letter-spacing: 0.12em;
		pointer-events: none;
	}

	.segment-text-inner {
		font-weight: 600;
	}
</style>
