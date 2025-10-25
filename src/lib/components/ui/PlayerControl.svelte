<script lang="ts">
	import Play from 'lucide-svelte/icons/play';
	import Pause from 'lucide-svelte/icons/pause';

	interface Props {
		isPlaying?: boolean;
		onClick?: () => void;
	}

	let { isPlaying = false, onClick = () => {} }: Props = $props();
</script>

<button
	type="button"
	onclick={onClick}
	class="absolute top-1/2 left-1/2 z-10 flex h-24
         w-24 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full
         border-4 border-cyan-400 bg-linear-to-br
         from-cyan-500
         to-purple-600
         shadow-[0_0_30px_rgba(34,211,238,0.6)]
         transition-all duration-200
         hover:shadow-[0_0_50px_rgba(34,211,238,0.8)] active:scale-95"
	aria-label={isPlaying ? 'Pause' : 'Play'}
>
	{#if isPlaying}
		<Pause class="h-12 w-12 text-white" fill="white" />
	{:else}
		<Play class="ml-1 h-12 w-12 text-white" fill="white" />
	{/if}
</button>
