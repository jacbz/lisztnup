<script lang="ts">
	import HomePage from '../+page.svelte';

	let { data } = $props();
</script>

<HomePage {data} />
