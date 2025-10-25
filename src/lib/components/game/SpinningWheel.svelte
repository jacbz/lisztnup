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

	let rotation = $state(0);
	let isSpinning = $state(false);
	let showSpinText = $state(true); // Show SPIN text - controlled by round changes
	let selectedCategory = $state<GuessCategory | null>(null);
	let wheelSize = $state(600); // Default size
	let prevRoundIndex = $state(currentRoundIndex);

	// Reset showSpinText when moving to a new round (after Next Round is clicked)
	$effect(() => {
		if (currentRoundIndex !== prevRoundIndex) {
			showSpinText = true;
			prevRoundIndex = currentRoundIndex;
		}
	});

	onMount(() => {
		updateWheelSize();
		window.addEventListener('resize', updateWheelSize);
		return () => window.removeEventListener('resize', updateWheelSize);
	});

	function updateWheelSize() {
		// Make wheel fill most of the screen (90% of smaller dimension)
		const minDimension = Math.min(window.innerWidth, window.innerHeight);
		wheelSize = minDimension * 0.9;
	}

	function spin() {
		if (isSpinning) return;

		isSpinning = true;
		showSpinText = false; // Hide SPIN text immediately when spinning starts
		selectedCategory = null;
		onSpinStart();

		// Spin for 3 seconds with random final position
		const spins = 5 + Math.random() * 3; // 5-8 full rotations
		const randomOffset = Math.random() * 360;
		const targetRotation = rotation + spins * 360 + randomOffset;

		rotation = targetRotation;

		setTimeout(() => {
			isSpinning = false;
			// Calculate which category was selected
			const normalizedRotation = ((targetRotation % 360) + 360) % 360;
			const segmentSize = 360 / categories.length;
			const categoryIndex =
				Math.floor((360 - normalizedRotation + segmentSize / 2) / segmentSize) % categories.length;

			selectedCategory = categories[categoryIndex].id;
			onSpinEnd();
			onCategorySelected(selectedCategory);
		}, 3000);
	}

	function handleTouch(event: TouchEvent) {
		if (!isSpinning) {
			event.preventDefault();
			spin();
		}
	}

	function handleClick() {
		if (!isSpinning) {
			spin();
		}
	}
</script>

<div class="wheel-wrapper" style="width: {wheelSize}px; height: {wheelSize}px;">
	<!-- Beautiful redesigned pointer -->
	<div class="pointer-container" style="top: 20px;">
		<svg
			width="60"
			height="60"
			viewBox="0 0 60 60"
			class="pointer-svg"
			style="transform: rotate(180deg); transform-origin: top;"
		>
			<defs>
				<linearGradient id="pointerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
					<stop offset="0%" style="stop-color:#fbbf24;stop-opacity:1" />
					<stop offset="100%" style="stop-color:#f59e0b;stop-opacity:1" />
				</linearGradient>
				<filter id="pointerGlow">
					<feGaussianBlur stdDeviation="3" result="coloredBlur" />
					<feMerge>
						<feMergeNode in="coloredBlur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<path
				d="M 30 10 L 45 35 L 30 30 L 15 35 Z"
				fill="url(#pointerGradient)"
				stroke="#fbbf24"
				stroke-width="2"
				filter="url(#pointerGlow)"
			/>
			<circle cx="30" cy="30" r="8" fill="#fbbf24" stroke="#f59e0b" stroke-width="2" />
		</svg>
	</div>

	<!-- Wheel -->
	<button
		type="button"
		class="wheel-container"
		onclick={handleClick}
		ontouchstart={handleTouch}
		style="transform: rotate({rotation}deg); transition: transform {isSpinning
			? '3s cubic-bezier(0.25, 0.1, 0.25, 1)'
			: '0.3s ease-out'};"
		aria-label="Spin the wheel"
	>
		<svg viewBox="0 0 400 400" class="wheel-svg">
			<defs>
				{#each categories as category, i}
					{@const startAngle = (360 / categories.length) * i - 90}
					{@const endAngle = (360 / categories.length) * (i + 1) - 90}
					{@const midAngle = (startAngle + endAngle) / 2}

					<!-- Radial gradient for each segment -->
					<radialGradient id="gradient-{i}" cx="50%" cy="50%">
						<stop offset="30%" style="stop-color:{category.color2};stop-opacity:1" />
						<stop offset="100%" style="stop-color:{category.color1};stop-opacity:0.9" />
					</radialGradient>

					<!-- Glow filter for segment -->
					<filter id="glow-{i}">
						<feGaussianBlur stdDeviation="4" result="coloredBlur" />
						<feMerge>
							<feMergeNode in="coloredBlur" />
							<feMergeNode in="SourceGraphic" />
						</feMerge>
					</filter>

					<!-- Outer curved text path -->
					<path
						id="outer-curve-{i}"
						d="M {200 + 175 * Math.cos((startAngle * Math.PI) / 180)} {200 +
							175 * Math.sin((startAngle * Math.PI) / 180)} 
						   A 175 175 0 0 1 {200 + 175 * Math.cos((endAngle * Math.PI) / 180)} {200 +
							175 * Math.sin((endAngle * Math.PI) / 180)}"
						fill="none"
					/>

					<!-- Inner curved text path -->
					<path
						id="inner-curve-{i}"
						d="M {200 + 95 * Math.cos((endAngle * Math.PI) / 180)} {200 +
							95 * Math.sin((endAngle * Math.PI) / 180)} 
						   A 95 95 0 0 0 {200 + 95 * Math.cos((startAngle * Math.PI) / 180)} {200 +
							95 * Math.sin((startAngle * Math.PI) / 180)}"
						fill="none"
					/>
				{/each}
			</defs>

			<!-- Draw segments -->
			{#each categories as category, i}
				{@const startAngle = (360 / categories.length) * i - 90}
				{@const endAngle = (360 / categories.length) * (i + 1) - 90}
				{@const midAngle = (startAngle + endAngle) / 2}
				{@const largeArc = 360 / categories.length > 180 ? 1 : 0}

				<!-- Segment path with glow -->
				<path
					d="M 200 200 
					   L {200 + 200 * Math.cos((startAngle * Math.PI) / 180)} {200 +
						200 * Math.sin((startAngle * Math.PI) / 180)} 
					   A 200 200 0 {largeArc} 1 {200 + 200 * Math.cos((endAngle * Math.PI) / 180)} {200 +
						200 * Math.sin((endAngle * Math.PI) / 180)} 
					   Z"
					fill="url(#gradient-{i})"
					stroke="rgba(0,0,0,0.3)"
					stroke-width="2"
					filter="url(#glow-{i})"
					class="segment"
				/>

				<!-- Icon for each segment -->
				<g
					transform="translate({200 + 135 * Math.cos((midAngle * Math.PI) / 180)}, {200 +
						135 * Math.sin((midAngle * Math.PI) / 180)}) rotate({midAngle + 90}) scale(1.5)"
				>
					<path
						d={category.iconPath}
						transform="translate(-12, -12)"
						fill="white"
						opacity="0.9"
						filter="url(#glow-{i})"
					/>
				</g>

				<!-- Outer text -->
				<text class="segment-text-outer">
					<textPath href="#outer-curve-{i}" startOffset="50%" text-anchor="middle">
						{$_(`game.categories.${category.id}`).toUpperCase()}
					</textPath>
				</text>

				<!-- Inner text -->
				<text class="segment-text-inner">
					<textPath href="#inner-curve-{i}" startOffset="50%" text-anchor="middle">
						{$_(`game.categories.${category.id}`).toUpperCase()}
					</textPath>
				</text>
			{/each}

			<!-- Center circle for player control area -->
			<circle cx="200" cy="200" r="78" fill="#0a0f1a" opacity="0.95" />
			<circle
				cx="200"
				cy="200"
				r="80"
				fill="none"
				stroke="url(#centerGradient)"
				stroke-width="4"
				filter="url(#centerGlow)"
			/>

			<!-- "Spin" text when wheel hasn't been spun -->
			{#if showSpinText}
				<text x="200" y="210" text-anchor="middle" class="spin-text" pointer-events="none">
					{$_('game.spin').toUpperCase()}
				</text>
			{/if}

			<!-- Center circle gradient and glow -->
			<defs>
				<linearGradient id="centerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" style="stop-color:#22d3ee;stop-opacity:1" />
					<stop offset="50%" style="stop-color:#a855f7;stop-opacity:1" />
					<stop offset="100%" style="stop-color:#22d3ee;stop-opacity:1" />
				</linearGradient>
				<filter id="centerGlow">
					<feGaussianBlur stdDeviation="4" result="coloredBlur" />
					<feMerge>
						<feMergeNode in="coloredBlur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
		</svg>
	</button>
</div>

<style>
	.wheel-wrapper {
		position: relative;
		margin: 0 auto;
	}

	.pointer-container {
		position: absolute;
		left: 50%;
		transform: translateX(-50%);
		z-index: 30;
		filter: drop-shadow(0 4px 12px rgba(251, 191, 36, 0.8));
	}

	.pointer-svg {
		display: block;
	}

	.wheel-container {
		width: 100%;
		height: 100%;
		cursor: pointer;
		touch-action: none;
		background: transparent;
		border: none;
		padding: 0;
		transform-origin: center;
		filter: drop-shadow(0 0 60px rgba(34, 211, 238, 0.6));
	}

	.wheel-svg {
		width: 100%;
		height: 100%;
	}

	.segment {
		transition: opacity 0.3s ease;
	}

	.segment:hover {
		opacity: 0.95;
	}

	.segment-text-outer,
	.segment-text-inner {
		fill: white;
		font-size: 20px;
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
		font-size: 16px;
		font-weight: 700;
	}

	.spin-text {
		fill: white;
		font-size: 32px;
		font-weight: 800;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		letter-spacing: 0.2em;
		filter: drop-shadow(0 2px 8px rgba(34, 211, 238, 0.8));
	}
</style>
