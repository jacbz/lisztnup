<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		onClick?: () => void;
		size?: 'small' | 'medium' | 'large';
	}

	let { onClick = () => {}, size = 'medium' }: Props = $props();

	const sizeClasses = {
		small: 'text-2xl sm:text-3xl',
		medium: 'text-3xl sm:text-4xl',
		large: 'text-4xl sm:text-5xl'
	};
</script>

<button
	type="button"
	onclick={onClick}
	class="font-streamster text-cyan-400 transition-all select-none hover:scale-105 hover:text-cyan-300 active:scale-95 {sizeClasses[
		size
	]}"
	style="filter: drop-shadow(0 0 10px rgba(0, 246, 255, 0.7));"
>
	{$_('app.title')}
</button>
