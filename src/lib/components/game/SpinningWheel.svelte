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
		wheelSize = minDimension * 0.9;
	}

	function drawWheel() {
		if (!canvas) return;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const size = wheelSize;

		// Set canvas size for high DPI displays
		canvas.width = size * dpr;
		canvas.height = size * dpr;
		canvas.style.width = `${size}px`;
		canvas.style.height = `${size}px`;

		ctx.scale(dpr, dpr);

		const centerX = size / 2;
		const centerY = size / 2;
		const radius = size * 0.42; // 42% of size for main wheel
		const centerCircleRadius = size * 0.16; // 16% for center (was 78/500 = 15.6%)

		ctx.clearRect(0, 0, size, size);

		// Draw segments
		const segmentAngle = (Math.PI * 2) / categories.length;

		categories.forEach((category, i) => {
			const startAngle = i * segmentAngle + (currentRotation * Math.PI) / 180 - Math.PI / 2;
			const endAngle = startAngle + segmentAngle;
			const midAngle = startAngle + segmentAngle / 2;

			// Create radial gradient for segment
			const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
			gradient.addColorStop(0.3, category.color2);
			gradient.addColorStop(1, category.color1);

			// Draw segment
			ctx.beginPath();
			ctx.moveTo(centerX, centerY);
			ctx.arc(centerX, centerY, radius, startAngle, endAngle);
			ctx.closePath();
			ctx.fillStyle = gradient;
			ctx.fill();

			// Add segment border
			ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
			ctx.lineWidth = 2;
			ctx.stroke();

			// Draw icon
			const iconDistance = radius * 0.68;
			const iconX = centerX + Math.cos(midAngle) * iconDistance;
			const iconY = centerY + Math.sin(midAngle) * iconDistance;

			ctx.save();
			ctx.translate(iconX, iconY);
			ctx.rotate(midAngle + Math.PI / 2);

			// Draw SVG path (scaled and positioned)
			const iconScale = size / 500; // Scale based on wheel size
			drawSVGPath(ctx, category.iconPath, iconScale * 1.5);

			ctx.restore();
		});

		// Draw center circle
		ctx.beginPath();
		ctx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
		ctx.fillStyle = '#0a0f1a';
		ctx.globalAlpha = 0.95;
		ctx.fill();
		ctx.globalAlpha = 1;

		// Center circle border with gradient
		const centerGradient = ctx.createLinearGradient(
			centerX - centerCircleRadius,
			centerY - centerCircleRadius,
			centerX + centerCircleRadius,
			centerY + centerCircleRadius
		);
		centerGradient.addColorStop(0, '#22d3ee');
		centerGradient.addColorStop(0.5, '#a855f7');
		centerGradient.addColorStop(1, '#22d3ee');

		ctx.beginPath();
		ctx.arc(centerX, centerY, centerCircleRadius, 0, Math.PI * 2);
		ctx.strokeStyle = centerGradient;
		ctx.lineWidth = 4;
		ctx.shadowColor = 'rgba(34, 211, 238, 0.6)';
		ctx.shadowBlur = 8;
		ctx.stroke();

		// Reset shadow
		ctx.shadowColor = 'transparent';
		ctx.shadowBlur = 0;

		// Draw SPIN text if needed
		if (showSpinText) {
			ctx.fillStyle = 'white';
			ctx.font = `800 ${size * 0.064}px system-ui, -apple-system, sans-serif`;
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

		// Draw pointer (white sleek arrow pointing down at top of wheel)
		const pointerY = size * 0.04; // 4% from top
		const pointerHeight = size * 0.08;
		const pointerWidth = size * 0.06;

		ctx.save();
		ctx.translate(centerX, pointerY);

		// Draw sleek white pointer
		ctx.beginPath();
		ctx.moveTo(0, pointerHeight); // Bottom point
		ctx.lineTo(-pointerWidth / 2, 0); // Top left
		ctx.lineTo(0, pointerHeight * 0.3); // Middle notch
		ctx.lineTo(pointerWidth / 2, 0); // Top right
		ctx.closePath();

		ctx.fillStyle = 'white';
		ctx.shadowColor = 'rgba(255, 255, 255, 0.6)';
		ctx.shadowBlur = 12;
		ctx.fill();

		// Add subtle border
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
		ctx.lineWidth = 1;
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

	function spin() {
		if (isSpinning) return;

		isSpinning = true;
		showSpinText = false;
		selectedCategory = null;
		onSpinStart();

		const spins = 5 + Math.random() * 3;
		const randomOffset = Math.random() * 360;
		const targetRotation = rotation + spins * 360 + randomOffset;

		const startRotation = rotation;
		const startTime = Date.now();
		const duration = 3000;

		function animate() {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);

			// Ease out cubic
			const eased = 1 - Math.pow(1 - progress, 3);

			currentRotation = startRotation + (targetRotation - startRotation) * eased;
			drawWheel();

			if (progress < 1) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				rotation = targetRotation;
				currentRotation = targetRotation;
				isSpinning = false;

				// Calculate which category the pointer is pointing at
				// Segments are drawn starting from -90° (right) + rotation
				// Segment i starts at: i * segmentAngle - 90° + currentRotation
				// Pointer is at top: 90° (or -270°)
				// We need to find which segment contains the angle: 90° - currentRotation
				const segmentSize = 360 / categories.length;
				const normalizedRotation = ((currentRotation % 360) + 360) % 360;

				// Pointer angle relative to segment 0's starting position
				// Segment 0 starts at -90° when rotation is 0
				// Pointer is at 90°, which is 180° from segment 0's start
				const angleFromSegment0 = (180 - normalizedRotation + 360) % 360;
				const categoryIndex = Math.floor(angleFromSegment0 / segmentSize) % categories.length;

				selectedCategory = categories[categoryIndex].id;
				onSpinEnd();
				onCategorySelected(selectedCategory);
			}
		}

		animate();
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
				// Stop where it naturally stops - NO SNAPPING
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
		class="text-overlay"
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
			<text class="segment-text-outer" style="font-size: {wheelSize * 0.04}px;">
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
		filter: drop-shadow(0 0 60px rgba(34, 211, 238, 0.6));
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
		font-weight: 800;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		letter-spacing: 0.1em;
		pointer-events: none;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.8));
	}

	.segment-text-inner {
		font-weight: 700;
	}
</style>
