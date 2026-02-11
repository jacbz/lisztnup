<script lang="ts">
	import { _ } from 'svelte-i18n';

	interface Props {
		/**
		 * The function to call when the logo is clicked.
		 */
		onClick?: () => void;
		/**
		 * The size of the logo.
		 * @default 'medium'
		 */
		size?: 'fit' | 'medium' | 'large';
	}

	let { onClick = () => {}, size = 'medium' }: Props = $props();

	const sizeClasses = {
		fit: 'text-[18cqw]',
		medium: 'text-3xl sm:text-4xl',
		large: 'text-4xl sm:text-5xl'
	};
</script>

<button
	type="button"
	onclick={onClick}
	class="h-full w-full font-streamster text-cyan-400 transition-all select-none hover:scale-105 hover:text-cyan-300 active:scale-95 {sizeClasses[
		size
	]} text-nowrap"
	style="filter: drop-shadow(0 0 10px rgba(0, 246, 255, 0.7)); container-type: size;"
>
	{$_('app.title')}
</button>
