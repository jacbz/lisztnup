<script lang="ts">
	interface Props {
		/**
		 * The current value of the slider.
		 * @default 0
		 */
		value?: number;
		/**
		 * The minimum value of the slider.
		 * @default 0
		 */
		min?: number;
		/**
		 * The maximum value of the slider.
		 * @default 100
		 */
		max?: number;
		/**
		 * The step value of the slider.
		 * @default 1
		 */
		step?: number;
		/**
		 * The label of the slider.
		 * @default ''
		 */
		label?: string;
		/**
		 * Whether to show the value of the slider.
		 * @default true
		 */
		showValue?: boolean;
		/**
		 * The suffix to add to the value.
		 * @default ''
		 */
		valueSuffix?: string;
		/**
		 * A function to format the value.
		 */
		valueFormatter?: (value: number) => string;
		/**
		 * The function to call when the value changes.
		 */
		onChange?: (value: number) => void;
	}

	let {
		value = 0,
		min = 0,
		max = 100,
		step = 1,
		label = '',
		showValue = true,
		valueSuffix = '',
		valueFormatter,
		onChange = () => {}
	}: Props = $props();

	const percentage = $derived(((value - min) / (max - min)) * 100);

	function handleInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const newValue = parseFloat(target.value);
		onChange(newValue);
	}
</script>

<div class="slider-container">
	{#if label || showValue}
		<div class="mb-3 flex items-center justify-between">
			{#if label}
				<span class="font-semibold text-cyan-400">{label}</span>
			{/if}
			{#if showValue}
				<span class="text-base font-semibold text-white {!label ? 'mx-auto' : ''}"
					>{valueFormatter ? valueFormatter(value) : `${value}${valueSuffix}`}</span
				>
			{/if}
		</div>
	{/if}
	<input
		type="range"
		{min}
		{max}
		{step}
		{value}
		oninput={handleInput}
		class="slider"
		style="--value-percent: {percentage}%"
	/>
</div>

<style>
	.slider-container {
		width: 100%;
	}

	.slider {
		width: 100%;
		height: 8px;
		border-radius: 4px;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
		cursor: pointer;
		background: linear-gradient(
			to right,
			#22d3ee 0%,
			#a855f7 var(--value-percent, 0%),
			rgba(55, 65, 81, 0.5) var(--value-percent, 0%),
			rgba(55, 65, 81, 0.5) 100%
		);
		transition: background 0.1s ease;
	}

	.slider::-webkit-slider-runnable-track {
		width: 100%;
		height: 8px;
		border-radius: 4px;
		background: transparent;
	}

	.slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: linear-gradient(135deg, #22d3ee 0%, #a855f7 100%);
		border: 2px solid #22d3ee;
		cursor: pointer;
		box-shadow: 0 0 12px rgba(34, 211, 238, 0.8);
		transition: all 0.2s ease;
		margin-top: -6px;
	}

	.slider::-webkit-slider-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 0 20px rgba(34, 211, 238, 1);
	}

	.slider::-webkit-slider-thumb:active {
		transform: scale(0.95);
		box-shadow: 0 0 16px rgba(34, 211, 238, 0.9);
	}

	.slider::-moz-range-track {
		width: 100%;
		height: 8px;
		border-radius: 4px;
		background: rgba(55, 65, 81, 0.5);
	}

	.slider::-moz-range-progress {
		height: 8px;
		border-radius: 4px;
		background: linear-gradient(to right, #22d3ee 0%, #a855f7 100%);
	}

	.slider::-moz-range-thumb {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: linear-gradient(135deg, #22d3ee 0%, #a855f7 100%);
		border: 2px solid #22d3ee;
		cursor: pointer;
		box-shadow: 0 0 12px rgba(34, 211, 238, 0.8);
		transition: all 0.2s ease;
	}

	.slider::-moz-range-thumb:hover {
		transform: scale(1.1);
		box-shadow: 0 0 20px rgba(34, 211, 238, 1);
	}

	.slider::-moz-range-thumb:active {
		transform: scale(0.95);
		box-shadow: 0 0 16px rgba(34, 211, 238, 0.9);
	}
</style>
