<script lang="ts">
	interface Props {
		/**
		 * The currently selected value.
		 * @default 10
		 */
		value?: number;
		/**
		 * The available options.
		 * @default [10, 20, 30]
		 */
		options?: number[];
		/**
		 * The function to call when the value changes.
		 */
		onChange?: (value: number) => void;
	}

	let { value = 10, options = [10, 20, 30], onChange = () => {} }: Props = $props();

	function handleSelect(option: number) {
		onChange(option);
	}
</script>

<div class="flex rounded-xl bg-slate-800 p-1 select-none">
	{#each options as option (option)}
		<button
			type="button"
			onclick={() => handleSelect(option)}
			class="flex-1 rounded-lg px-4 py-1.5 font-semibold transition-all
                 {value === option
				? 'bg-cyan-400 text-slate-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
				: 'text-slate-400 hover:text-slate-300'}"
		>
			{option}
		</button>
	{/each}
</div>
