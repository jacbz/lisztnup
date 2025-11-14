<script lang="ts">
	interface Props {
		min: number;
		max: number;
		step?: number;
		valueMin: number;
		valueMax: number;
		label?: string;
		onChange?: (min: number, max: number) => void;
	}

	let {
		min,
		max,
		step = 1,
		valueMin = $bindable(),
		valueMax = $bindable(),
		label = '',
		onChange = () => {}
	}: Props = $props();

	// Ensure values are within bounds
	$effect(() => {
		if (valueMin < min) valueMin = min;
		if (valueMax > max) valueMax = max;
		if (valueMin > valueMax) valueMin = valueMax;
	});

	function handleMinChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const newMin = Number(target.value);
		if (newMin <= valueMax) {
			valueMin = newMin;
			onChange(valueMin, valueMax);
		}
	}

	function handleMaxChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const newMax = Number(target.value);
		if (newMax >= valueMin) {
			valueMax = newMax;
			onChange(valueMin, valueMax);
		}
	}

	// Calculate the percentage position of each handle
	const minPercent = $derived(((valueMin - min) / (max - min)) * 100);
	const maxPercent = $derived(((valueMax - min) / (max - min)) * 100);
</script>

<div class="space-y-2">
	{#if label}
		<div class="flex items-center justify-between">
			<span class="text-sm text-slate-400">{label}</span>
		</div>
	{/if}

	<div class="relative pt-8">
		<!-- Value labels above handles -->
		<div class="absolute top-0 w-full">
			<div
				class="absolute left-0 -translate-x-1/2 text-xs font-semibold text-cyan-300"
				style="left: {minPercent}%"
			>
				{valueMin.toFixed(1)}
			</div>
			<div
				class="absolute left-0 -translate-x-1/2 text-xs font-semibold text-purple-300"
				style="left: {maxPercent}%"
			>
				{valueMax.toFixed(1)}
			</div>
		</div>

		<!-- Track container -->
		<div class="relative h-2">
			<!-- Background track -->
			<div class="absolute h-full w-full rounded-full bg-slate-700"></div>

			<!-- Active track (between handles) -->
			<div
				class="absolute h-full rounded-full bg-linear-to-r from-cyan-500 to-purple-600"
				style="left: {minPercent}%; width: {maxPercent - minPercent}%"
			></div>

			<!-- Min handle -->
			<input
				type="range"
				{min}
				{max}
				{step}
				value={valueMin}
				oninput={handleMinChange}
				class="range-slider-thumb"
				style="z-index: {valueMin === valueMax ? 3 : 2}"
			/>

			<!-- Max handle -->
			<input
				type="range"
				{min}
				{max}
				{step}
				value={valueMax}
				oninput={handleMaxChange}
				class="range-slider-thumb"
				style="z-index: 1"
			/>
		</div>
	</div>
</div>

<style>
	.range-slider-thumb {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		appearance: none;
		background: transparent;
		outline: none;
	}

	.range-slider-thumb::-webkit-slider-thumb {
		appearance: none;
		pointer-events: all;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid white;
		background: linear-gradient(135deg, rgb(34, 211, 238), rgb(147, 51, 234));
		cursor: pointer;
		box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
		transition: all 0.15s ease;
	}

	.range-slider-thumb::-webkit-slider-thumb:hover {
		transform: scale(1.2);
		box-shadow: 0 0 15px rgba(34, 211, 238, 0.8);
	}

	.range-slider-thumb::-moz-range-thumb {
		pointer-events: all;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 2px solid white;
		background: linear-gradient(135deg, rgb(34, 211, 238), rgb(147, 51, 234));
		cursor: pointer;
		box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
		transition: all 0.15s ease;
	}

	.range-slider-thumb::-moz-range-thumb:hover {
		transform: scale(1.2);
		box-shadow: 0 0 15px rgba(34, 211, 238, 0.8);
	}
</style>
