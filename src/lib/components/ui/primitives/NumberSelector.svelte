<script lang="ts">
	interface Props {
		value?: number;
		options?: number[];
		onChange?: (value: number) => void;
	}

	let { value = 10, options = [5, 10, 15, 20], onChange = () => {} }: Props = $props();

	function handleSelect(option: number) {
		onChange(option);
	}
</script>

<div class="flex rounded-xl bg-gray-800 p-1 select-none">
	{#each options as option}
		<button
			type="button"
			onclick={() => handleSelect(option)}
			class="flex-1 rounded-lg px-4 py-1.5 font-semibold transition-all
                 {value === option
				? 'bg-cyan-400 text-gray-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
				: 'text-gray-400 hover:text-gray-300'}"
		>
			{option}
		</button>
	{/each}
</div>
