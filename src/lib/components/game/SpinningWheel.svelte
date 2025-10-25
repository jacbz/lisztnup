<script lang="ts">
	import type { GuessCategory } from '$lib/types';
	import { onMount } from 'svelte';
	import { _ } from 'svelte-i18n';

	interface Props {
		onCategorySelected?: (category: GuessCategory) => void;
		onSpinStart?: () => void;
		onSpinEnd?: () => void;
	}

	let {
		onCategorySelected = () => {},
		onSpinStart = () => {},
		onSpinEnd = () => {}
	}: Props = $props();

	const categories: {
		id: GuessCategory;
		color1: string;
		color2: string;
		glowColor: string;
		icon: string;
	}[] = [
		{
			id: 'composer',
			color1: '#06b6d4',
			color2: '#22d3ee',
			glowColor: 'rgba(6, 182, 212, 0.8)',
			// Person icon
			icon: 'M200,140 m-15,0 a15,15 0 1,0 30,0 a15,15 0 1,0 -30,0 M185,160 q0,-5 7.5,-5 q7.5,0 7.5,5 q0,0 0,10 q15,0 15,0 q0,0 0,-10 q0,-5 7.5,-5 q7.5,0 7.5,5 l0,15 q0,8 -7.5,8 l-30,0 q-7.5,0 -7.5,-8 z'
		},
		{
			id: 'composition',
			color1: '#ec4899',
			color2: '#f472b6',
			glowColor: 'rgba(236, 72, 153, 0.8)',
			// Music note icon
			icon: 'M210,145 l0,35 q-5,3 -10,3 q-8,0 -8,-8 q0,-8 8,-8 q3,0 5,1 l0,-28 l-15,3 l0,30 q-5,3 -10,3 q-8,0 -8,-8 q0,-8 8,-8 q3,0 5,1 l0,-35 z'
		},
		{
			id: 'year',
			color1: '#8b5cf6',
			color2: '#a78bfa',
			glowColor: 'rgba(139, 92, 246, 0.8)',
			// Calendar icon
			icon: 'M185,145 l30,0 q3,0 3,3 l0,30 q0,3 -3,3 l-30,0 q-3,0 -3,-3 l0,-30 q0,-3 3,-3 z M190,150 l0,5 l20,0 l0,-5 z M190,158 l0,17 l20,0 l0,-17 z M193,152 l0,-5 M197,152 l0,-5 M202,152 l0,-5 M207,152 l0,-5'
		},
		{
			id: 'type',
			color1: '#f59e0b',
			color2: '#fbbf24',
			glowColor: 'rgba(245, 158, 11, 0.8)',
			// Instrument (violin) icon
			icon: 'M195,145 q3,0 5,2 l8,8 q2,2 2,5 q0,3 -2,5 l-8,8 q-2,2 -5,2 q-3,0 -5,-2 l-8,-8 q-2,-2 -2,-5 q0,-3 2,-5 l8,-8 q2,-2 5,-2 z M198,155 l-6,0 l0,3 l6,0 z M198,161 l-6,0 l0,3 l6,0 z'
		},
		{
			id: 'decade',
			color1: '#10b981',
			color2: '#34d399',
			glowColor: 'rgba(16, 185, 129, 0.8)',
			// Clock icon
			icon: 'M200,145 m-18,0 a18,18 0 1,0 36,0 a18,18 0 1,0 -36,0 M200,150 l0,10 l8,0'
		}
	];

	let rotation = $state(0);
	let isSpinning = $state(false);
	let selectedCategory = $state<GuessCategory | null>(null);
	let wheelSize = $state(600); // Default size

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
	<div class="pointer-container">
		<svg width="60" height="60" viewBox="0 0 60 60" class="pointer-svg">
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
						135 * Math.sin((midAngle * Math.PI) / 180)}) rotate({midAngle + 90})"
				>
					<path
						d={category.icon}
						transform="translate(-200, -145)"
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
		top: -30px;
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
</style>
