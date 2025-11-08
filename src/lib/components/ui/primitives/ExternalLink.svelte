<script lang="ts">
	interface Props {
		href: string;
		class?: string;
	}

	let { href, class: className = '' }: Props = $props();
</script>

<a
	{href}
	target="_blank"
	rel="noopener noreferrer"
	class="inline-flex items-center align-middle opacity-70 transition-opacity hover:opacity-100 {className} pb-0.5"
	title="Open in MusicBrainz"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="inline h-[0.8em] w-[0.8em]"
	>
		<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
		<polyline points="15 3 21 3 21 9"></polyline>
		<line x1="10" x2="21" y1="14" y2="3"></line>
	</svg>
</a>
