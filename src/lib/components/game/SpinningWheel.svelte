<script lang="ts">
	import type { GuessCategory } from '$lib/types';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';
	import { allCategories } from '$lib/data/categories';
	import { shuffle } from '$lib/utils/random';

	interface Props {
		onCategorySelected?: (category: GuessCategory) => void;
		onSpinStart?: () => void;
		onSpinEnd?: () => void;
		currentRoundIndex?: number; // Used to reset state between rounds
		disabledCategories?: readonly GuessCategory[]; // Categories to exclude from the wheel
		hasValidYears?: boolean; // Whether current track has valid year data
	}

	let {
		onCategorySelected = () => {},
		onSpinStart = () => {},
		onSpinEnd = () => {},
		currentRoundIndex = 0,
		disabledCategories = [],
		hasValidYears = true
	}: Props = $props();

	// Filter out disabled categories and shuffle for visual variety
	// Store as state to maintain consistency across re-renders
	let activeCategories = $state(
		shuffle(allCategories.filter((cat) => !disabledCategories.includes(cat.id)))
	);

	// Update activeCategories when disabledCategories changes
	$effect(() => {
		activeCategories = shuffle(allCategories.filter((cat) => !disabledCategories.includes(cat.id)));
	});

	let canvas: HTMLCanvasElement;
	let isSpinning = $state(false);
	let showSpinText = $state(true);
	let wheelSize = $state(600);
	let prevRoundIndex = $state(currentRoundIndex);
	let animationFrameId: number | null = null;
	let currentRotation = $state(0);
	let currentPointerColor = $state('#ff0000');
	let isAnimating = $state(false);
	let lastCanvasSize = 0;

	// Drag state
	let isDragging = $state(false);
	let lastDragAngle = 0;
	let dragVelocity = 0;
	let lastDragTime = 0;
	let dragAnimationFrameId: number | null = null;
	let pendingDragUpdate = false;
	let pendingDragAngle = 0;
	let pendingDragTime = 0;
	// Velocity history for more accurate calculation (last 5 samples)
	let velocityHistory: { angle: number; time: number }[] = [];
	let lastAngleDelta = 0; // Track most recent angle change for quick flicks

	// SVG overlay for text
	let svgOverlay: SVGSVGElement;

	// Reset showSpinText when moving to a new round
	$effect(() => {
		if (currentRoundIndex !== prevRoundIndex) {
			showSpinText = true;
			prevRoundIndex = currentRoundIndex;
		}
	});

	// Redraw when rotation changes (but only if not animating, since animation loop handles drawing)
	$effect(() => {
		if (canvas && !isAnimating) {
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
			if (dragAnimationFrameId) cancelAnimationFrame(dragAnimationFrameId);
		};
	});

	/**
	 * Calculate which category the pointer is pointing at based on rotation
	 * This is the SINGLE SOURCE OF TRUTH for category selection
	 */
	function getCategoryFromRotation(rotation: number): GuessCategory {
		const segmentSize = 360 / activeCategories.length;
		const normalizedRotation = ((rotation % 360) + 360) % 360;
		const angleFromSegment0 = (360 - normalizedRotation + 360) % 360;
		const categoryIndex = Math.floor(angleFromSegment0 / segmentSize) % activeCategories.length;
		return activeCategories[categoryIndex].id;
	}

	/**
	 * Check if a rotation would land on era/decade categories
	 */
	function wouldLandOnYearCategory(rotation: number): boolean {
		const category = getCategoryFromRotation(rotation);
		return category === 'era' || category === 'decade';
	}

	/**
	 * Generate a valid random final rotation that avoids year categories if track has no year data
	 */
	function generateValidFinalRotation(): number {
		let attempts = 0;
		const maxAttempts = 100;

		while (attempts < maxAttempts) {
			// Generate random rotation: current + 3-6 full rotations + random position
			const fullRotations = 3 + Math.floor(Math.random() * 4); // 3-6 full spins
			const randomAngle = Math.random() * 360;
			const finalRotation = currentRotation + fullRotations * 360 + randomAngle;

			// If track has valid years OR doesn't land on year category, we're good
			if (hasValidYears || !wouldLandOnYearCategory(finalRotation)) {
				return finalRotation;
			}

			attempts++;
			console.log(
				`✗ Attempt ${attempts}: rotation ${finalRotation.toFixed(1)}° would land on year category, retrying...`
			);
		}

		// Fallback: just return a random rotation (shouldn't happen with reasonable category counts)
		console.warn('Failed to generate valid rotation after max attempts, using fallback');
		return currentRotation + (3 + Math.random() * 3) * 360 + Math.random() * 360;
	}

	function handleResize() {
		updateWheelSize();
		if (canvas) {
			drawWheel();
		}
	}

	function updateWheelSize() {
		const minDimension = Math.min(window.innerWidth, window.innerHeight);
		// Use more screen space on small screens, add extra space for glow effects
		if (minDimension < 600) {
			wheelSize = minDimension + 50; // Minimal margins on small screens
		} else {
			wheelSize = minDimension * 0.95; // Use more space
		}
	}

	function updatePointerColor() {
		// Use helper function to get category at current rotation
		const category = activeCategories.find(
			(cat) => cat.id === getCategoryFromRotation(currentRotation)
		);
		if (category) {
			currentPointerColor = category.color1;
		}
	}

	function drawWheel() {
		if (!canvas) return;

		const ctx = canvas.getContext('2d', { willReadFrequently: false, alpha: true });
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const size = wheelSize;

		// Add extra padding for glow effects (100px on each side = 200px total)
		const glowPadding = 100;
		const canvasSize = size + glowPadding * 2;

		// Only resize canvas if size changed (expensive operation)
		if (canvasSize !== lastCanvasSize) {
			canvas.width = canvasSize * dpr;
			canvas.height = canvasSize * dpr;
			canvas.style.width = `${canvasSize}px`;
			canvas.style.height = `${canvasSize}px`;
			lastCanvasSize = canvasSize;
		}

		// Reset transform and clear
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, canvasSize, canvasSize);

		// Center everything in the padded canvas
		const centerX = canvasSize / 2;
		const centerY = canvasSize / 2;
		const radius = size * 0.42;
		const centerCircleRadius = size * 0.16;
		const gapWidth = size * 0.01; // The desired constant pixel width for the gap
		const halfGap = gapWidth / 2;

		const segmentAngle = (Math.PI * 2) / activeCategories.length;

		// Reduce shadow blur during animation for better Safari performance
		const shadowBlur = 80;

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
			ctx.shadowBlur = shadowBlur;

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

			const iconDistance = radius * 0.66;
			const iconX = centerX + Math.cos(midAngle) * iconDistance;
			const iconY = centerY + Math.sin(midAngle) * iconDistance;

			if (category.iconPath) {
				ctx.save();
				ctx.translate(iconX, iconY);
				ctx.rotate(midAngle - Math.PI / 2);

				const iconScale = size / 300;
				drawSVGPaths(ctx, category.iconPath, iconScale * 1.5);

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
		const pointerY = glowPadding + size * 0.01;
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
		ctx.shadowBlur = 12;

		ctx.fill();
		ctx.stroke();

		ctx.restore();
	}

	function drawSVGPaths(ctx: CanvasRenderingContext2D, pathDataArray: string[], scale: number) {
		// Parse and draw multiple SVG paths as a single combined path for unified shadow
		const combinedPath = new Path2D();

		pathDataArray.forEach((pathData) => {
			const path = new Path2D(pathData);
			combinedPath.addPath(path);
		});

		ctx.save();
		ctx.scale(scale, scale);
		ctx.translate(-12, -12); // Center the 24x24 icon

		ctx.fillStyle = 'white';
		ctx.globalAlpha = 0.9;
		ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
		ctx.shadowBlur = 4;
		ctx.fill(combinedPath);
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

	/**
	 * Main spin function - generates valid final rotation and animates to it
	 */
	function spin() {
		if (isSpinning) return;

		isSpinning = true;
		isAnimating = true;
		showSpinText = false;
		onSpinStart();

		// Generate a valid final rotation that avoids year categories if needed
		const targetRotation = generateValidFinalRotation();
		const totalDistance = targetRotation - currentRotation;
		const startRotation = currentRotation;

		// Animation parameters
		const spinDuration = 3000 + Math.random() * 1000; // 3-4 seconds for more natural feel
		const startTime = performance.now();

		function animate(timestamp: number) {
			const elapsed = timestamp - startTime;
			const progress = Math.min(elapsed / spinDuration, 1);

			// Easing function: instant acceleration, then gradual deceleration
			// We want it to feel like a forceful spin that gradually slows down naturally
			let eased: number;
			if (progress < 0.1) {
				// First 10%: instant acceleration to full speed (linear)
				eased = progress * 10;
			} else {
				// Remaining 90%: gentler deceleration (quartic ease-out for smoother slowdown)
				const decelerationProgress = (progress - 0.1) / 0.9;
				eased = 0.1 + 0.9 * (1 - Math.pow(1 - decelerationProgress, 4));
			}

			// Update rotation
			currentRotation = startRotation + totalDistance * eased;

			// Update pointer color and draw
			updatePointerColor();
			drawWheel();

			if (progress < 1) {
				animationFrameId = requestAnimationFrame(animate);
			} else {
				// Ensure we land exactly on target
				currentRotation = targetRotation;
				updatePointerColor();
				drawWheel();

				isSpinning = false;
				isAnimating = false;

				// Get the selected category
				const selectedCategory = getCategoryFromRotation(currentRotation);
				onSpinEnd();
				onCategorySelected(selectedCategory);
			}
		}

		animationFrameId = requestAnimationFrame(animate);
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
			spin();
		}
	}

	/**
	 * Get angle from center of wheel for drag tracking
	 */
	function getAngleFromCenter(clientX: number, clientY: number): number {
		if (!canvas) return 0;
		const rect = canvas.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const dx = clientX - centerX;
		const dy = clientY - centerY;
		return (Math.atan2(dy, dx) * 180) / Math.PI;
	}

	/**
	 * Handle drag start
	 */
	function handleDragStart(event: MouseEvent | TouchEvent) {
		// Don't start drag if already spinning or animating
		if (isSpinning || isAnimating) return;

		// If clicking center circle with spin text, let handleSpinTextClick handle it
		if (showSpinText && canvas) {
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

			if (distance <= centerCircleRadius) {
				return; // Let click handler manage this
			}
		}

		isDragging = true;
		showSpinText = false;
		dragVelocity = 0;
		velocityHistory = []; // Reset velocity history on new drag
		lastAngleDelta = 0;

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

		lastDragAngle = getAngleFromCenter(clientX, clientY);
		lastDragTime = performance.now();

		event.preventDefault();
	}

	/**
	 * Handle drag move - uses requestAnimationFrame for smooth 60fps updates
	 */
	function handleDragMove(event: MouseEvent | TouchEvent) {
		if (!isDragging) return;

		event.preventDefault();

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

		const currentAngle = getAngleFromCenter(clientX, clientY);
		const currentTime = performance.now();

		// Store pending update instead of processing immediately
		pendingDragAngle = currentAngle;
		pendingDragTime = currentTime;

		// Schedule update via requestAnimationFrame if not already scheduled
		if (!pendingDragUpdate) {
			pendingDragUpdate = true;
			requestAnimationFrame(processDragUpdate);
		}
	}

	/**
	 * Process drag update - called once per frame via requestAnimationFrame
	 */
	function processDragUpdate() {
		if (!isDragging) {
			pendingDragUpdate = false;
			return;
		}

		const currentAngle = pendingDragAngle;
		const currentTime = pendingDragTime;
		const timeDelta = currentTime - lastDragTime;

		// Handle angle wrap-around (crossing from -180 to 180 or vice versa)
		let angleDelta = currentAngle - lastDragAngle;
		if (angleDelta > 180) angleDelta -= 360;
		if (angleDelta < -180) angleDelta += 360;

		// Update rotation
		currentRotation += angleDelta;

		// Store the most recent angle delta for quick flick detection
		lastAngleDelta = angleDelta;

		// Store in velocity history
		velocityHistory.push({ angle: currentAngle, time: currentTime });

		// Keep only last 5 samples (approximately last 80ms of movement)
		if (velocityHistory.length > 5) {
			velocityHistory.shift();
		}

		// Calculate velocity using sliding window (compare current to oldest sample)
		if (velocityHistory.length >= 2) {
			const oldest = velocityHistory[0];
			const newest = velocityHistory[velocityHistory.length - 1];
			const totalTime = newest.time - oldest.time;

			if (totalTime > 0) {
				let totalAngle = newest.angle - oldest.angle;
				// Handle wrap-around
				if (totalAngle > 180) totalAngle -= 360;
				if (totalAngle < -180) totalAngle += 360;

				// Calculate velocity over the window
				dragVelocity = totalAngle / totalTime;
			}
		} else if (timeDelta > 0 && lastAngleDelta !== 0) {
			// Fallback for very quick flicks: use the most recent delta
			dragVelocity = lastAngleDelta / timeDelta;
		}

		lastDragAngle = currentAngle;
		lastDragTime = currentTime;

		// Update pointer color and redraw
		updatePointerColor();
		drawWheel();

		pendingDragUpdate = false;
	} /**
	 * Handle drag end - check velocity and either spin or decelerate
	 */
	function handleDragEnd(event: MouseEvent | TouchEvent) {
		if (!isDragging) return;

		isDragging = false;
		event.preventDefault();

		// Velocity threshold: 0.3 degrees per millisecond = 108 degrees in 360ms (moderate flick)
		// Lowered from 0.5 to be more sensitive and consistent across browsers
		const VELOCITY_THRESHOLD = 0.3;
		const absVelocity = Math.abs(dragVelocity);

		if (absVelocity >= VELOCITY_THRESHOLD) {
			// Fast drag - trigger validated spin
			spin();
		} else {
			// Slow drag - apply natural deceleration
			applyDeceleration();
		}
	}

	/**
	 * Apply physics-based deceleration after slow drag
	 */
	function applyDeceleration() {
		if (dragAnimationFrameId) {
			cancelAnimationFrame(dragAnimationFrameId);
		}

		isAnimating = true;
		let lastFrameTime = performance.now();

		function decelerateFrame(timestamp: number) {
			const deltaTime = timestamp - lastFrameTime;
			lastFrameTime = timestamp;

			// Apply friction: reduce velocity by 4% per frame at 60fps
			// Normalize to frame rate for consistent behavior
			const frictionPerFrame = 0.96;
			const normalizedFriction = Math.pow(frictionPerFrame, deltaTime / (1000 / 60));
			dragVelocity *= normalizedFriction;

			// Apply velocity to rotation (convert from deg/ms to deg by multiplying by deltaTime)
			currentRotation += dragVelocity * deltaTime;

			// Update display
			updatePointerColor();
			drawWheel();

			// Continue until velocity is negligible
			if (Math.abs(dragVelocity) > 0.01) {
				dragAnimationFrameId = requestAnimationFrame(decelerateFrame);
			} else {
				dragVelocity = 0;
				isAnimating = false;
				dragAnimationFrameId = null;
			}
		}

		dragAnimationFrameId = requestAnimationFrame(decelerateFrame);
	}
</script>

<div class="wheel-wrapper" style="width: {wheelSize + 200}px; height: {wheelSize + 200}px;">
	<canvas
		bind:this={canvas}
		class="wheel-canvas"
		onclick={handleSpinTextClick}
		onmousedown={handleDragStart}
		onmousemove={handleDragMove}
		onmouseup={handleDragEnd}
		onmouseleave={handleDragEnd}
		ontouchstart={handleDragStart}
		ontouchmove={handleDragMove}
		ontouchend={handleDragEnd}
		ontouchcancel={handleDragEnd}
		aria-label="Spin the wheel"
	></canvas>

	<!-- SVG overlay for curved text -->
	<svg
		bind:this={svgOverlay}
		class="text-overlay select-none"
		viewBox="0 0 {wheelSize + 200} {wheelSize + 200}"
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
				{@const centerX = (wheelSize + 200) / 2}
				{@const centerY = (wheelSize + 200) / 2}

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
			<text class="segment-text-outer" style="font-size: {wheelSize * 0.055}px;">
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
		letter-spacing: 0.15em;
		pointer-events: none;
	}

	.segment-text-inner {
		font-weight: 600;
	}
</style>
