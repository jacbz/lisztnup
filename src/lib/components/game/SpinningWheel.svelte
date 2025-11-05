<script lang="ts">
	import type { GuessCategory } from '$lib/types';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { categories } from '$lib/data/categories';

	interface Props {
		onCategorySelected?: (category: GuessCategory) => void;
		onSpinStart?: () => void;
		onSpinEnd?: () => void;
		currentRoundIndex?: number; // Used to reset state between rounds
		disabledCategories?: GuessCategory[]; // Categories to exclude from the wheel
	}

	let {
		onCategorySelected = () => {},
		onSpinStart = () => {},
		onSpinEnd = () => {},
		currentRoundIndex = 0,
		disabledCategories = []
	}: Props = $props();

	// Filter out disabled categories
	const activeCategories = $derived(
		categories.filter((cat) => !disabledCategories.includes(cat.id))
	);

	let canvas: HTMLCanvasElement;
	let rotation = $state(0);
	let isSpinning = $state(false);
	let showSpinText = $state(true);
	let selectedCategory = $state<GuessCategory | null>(null);
	let wheelSize = $state(600);
	let prevRoundIndex = $state(currentRoundIndex);
	let animationFrameId: number | null = null;
	let currentRotation = $state(0);
	let currentPointerColor = $state('#ff0000'); // Track pointer color

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
			updatePointerColor();
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

	function updatePointerColor() {
		// Calculate which category the pointer is pointing at
		const segmentSize = 360 / activeCategories.length;
		const normalizedRotation = ((currentRotation % 360) + 360) % 360;
		const angleFromSegment0 = (360 - normalizedRotation + 360) % 360;
		const categoryIndex = Math.floor(angleFromSegment0 / segmentSize) % activeCategories.length;
		
		// Get the color from the category
		const category = activeCategories[categoryIndex];
		currentPointerColor = category.color1;
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

		const segmentAngle = (Math.PI * 2) / activeCategories.length;

		activeCategories.forEach((category, i) => {
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

			if (category.iconPath) {
				ctx.save();
				ctx.translate(iconX, iconY);
				ctx.rotate(midAngle + Math.PI / 2);

				const iconScale = size / 500;
				drawSVGPath(ctx, category.iconPath, iconScale * 1.5);

				ctx.restore();
			}
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
		// Create lighter and darker shades of the current color
		const lighterColor = lightenColor(currentPointerColor, 0.3);
		pointerGradient.addColorStop(0, lighterColor);
		pointerGradient.addColorStop(1, currentPointerColor);

		ctx.fillStyle = pointerGradient;
		ctx.strokeStyle = lighterColor;
		ctx.lineWidth = 2;
		ctx.shadowColor = currentPointerColor;
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

	function lightenColor(color: string, amount: number): string {
		// Convert hex to RGB
		const hex = color.replace('#', '');
		const r = parseInt(hex.substring(0, 2), 16);
		const g = parseInt(hex.substring(2, 4), 16);
		const b = parseInt(hex.substring(4, 6), 16);

		// Lighten by blending with white
		const newR = Math.min(255, Math.round(r + (255 - r) * amount));
		const newG = Math.min(255, Math.round(g + (255 - g) * amount));
		const newB = Math.min(255, Math.round(b + (255 - b) * amount));

		// Convert back to hex
		return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
	}

	function spinWithVelocity(velocity: number) {
		if (isSpinning) return;

		isSpinning = true;
		showSpinText = false;
		selectedCategory = null;
		onSpinStart();

		// Add randomness factor (±10% variation)
		const randomFactor = 0.9 + Math.random() * 0.2;
		const adjustedVelocity = velocity * randomFactor;

		// Physics-based spin with initial velocity
		const friction = 0.98; // Smoother friction for longer, more natural spin
		const minVelocity = 0.05; // Much lower threshold for gradual stop
		let currentVelocity = adjustedVelocity;

		function animate() {
			// Apply friction with gradual ease-out at the end
			// When velocity is very low, apply even stronger friction for smooth stop
			let appliedFriction = friction;
			if (Math.abs(currentVelocity) < 1) {
				// Gradually increase friction as we slow down
				appliedFriction = friction - (1 - Math.abs(currentVelocity)) * 0.03;
			}
			currentVelocity *= appliedFriction;

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
				// Pointer is at top: 270° in that coordinate system
				const segmentSize = 360 / activeCategories.length;
				const normalizedRotation = ((currentRotation % 360) + 360) % 360;

				// Angle from segment 0's starting position to pointer (top = 270° offset from -90° start)
				const angleFromSegment0 = (360 - normalizedRotation + 360) % 360;
				const categoryIndex = Math.floor(angleFromSegment0 / segmentSize) % activeCategories.length;

				selectedCategory = activeCategories[categoryIndex].id;
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

		// Calculate velocity with mobile boost
		const timeDiff = Math.max(currentTime - lastDragTime, 1);
		const baseVelocity = (angleDiff / timeDiff) * 16; // Scale to ~60fps
		dragVelocity = baseVelocity * 2;

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

	function handleSpinTextClick(event: MouseEvent | TouchEvent) {
		if (isSpinning || !showSpinText) return;

		// Prevent the drag handler from interfering
		event.stopPropagation();

		// Check if click is near the center (where spin text is)
		if (!canvas) return;

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
			return;
		}

		const dx = clientX - centerX;
		const dy = clientY - centerY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const centerCircleRadius = wheelSize * 0.16;

		// Only trigger if clicked within the center circle
		if (distance <= centerCircleRadius) {
			// Trigger a random spin with velocity
			const randomVelocity = 30 + Math.random() * 10;
			spinWithVelocity(randomVelocity);
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
		onclick={handleSpinTextClick}
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
			{#each activeCategories as category, i}
				{@const segmentAngle = 360 / activeCategories.length}
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
		{#each activeCategories as category, i}
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
