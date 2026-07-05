<script lang="ts">
	// Renders a short label curved around the inside edge of a circular button so
	// it stays legible from every side of the table. The same word is repeated on
	// the top and bottom edges (and, when the circle is roomy enough, on the left
	// and right edges too), each copy rotated to face the outer circle. Copies are
	// joined by `·` separators sitting at the gaps between them.
	//
	// Geometry is computed in a normalized 100×100 viewBox so the SVG scales to fit
	// any button size (px-sized or Tailwind-sized) without extra measurement.

	interface Props {
		text: string;
		/** Distance from the circle edge to the text centerline, in viewBox units. */
		inset?: number;
		/** Font size in viewBox units (1 = 1% of the diameter). */
		fontSize?: number;
		/** Letter spacing in viewBox units. */
		tracking?: number;
		/** Color/utility classes applied to the SVG (text uses `currentColor`). */
		class?: string;
	}

	let { text, inset = 11, fontSize = 11, tracking = 1, class: className = '' }: Props = $props();

	// Unique id prefix so multiple instances don't collide on <textPath href>.
	const uid = $props.id();

	const cx = 50;
	const cy = 50;
	const r = $derived(50 - inset);

	// Approximate rendered width of the (uppercased) label along the arc.
	const textWidth = $derived(text.length * (fontSize * 0.62 + tracking));

	// Use four copies (top/right/bottom/left) only when a copy comfortably fits in
	// a quarter of the ring; otherwise fall back to two copies (top/bottom).
	const useFour = $derived(textWidth < ((Math.PI * r) / 2) * 0.8);

	const labelAngles = $derived(useFour ? [0, 90, 180, 270] : [0, 180]);
	const sepAngles = $derived(useFour ? [45, 135, 225, 315] : [90, 270]);
	// Half-width of each label arc, leaving a gap before the separators.
	const halfArc = $derived(useFour ? 37 : 76);

	// Angle measured clockwise from the top (0 = 12 o'clock, 90 = 3 o'clock).
	function point(angleDeg: number, radius = r) {
		const a = (angleDeg * Math.PI) / 180;
		return { x: cx + radius * Math.sin(a), y: cy - radius * Math.cos(a) };
	}

	// Counter-clockwise arc (sweep = 0) keeps each copy readable from its own edge
	// of the table: upright on the bottom (facing the closest player), upside-down
	// on the top (facing the player across), and likewise for the sides.
	function arcPath(centerDeg: number) {
		const p0 = point(centerDeg - halfArc);
		const p1 = point(centerDeg + halfArc);
		return `M ${p1.x} ${p1.y} A ${r} ${r} 0 0 0 ${p0.x} ${p0.y}`;
	}
</script>

<svg
	class="pointer-events-none absolute inset-0 h-full w-full select-none {className}"
	viewBox="0 0 100 100"
	fill="currentColor"
	aria-hidden="true"
>
	<defs>
		{#each labelAngles as angle (angle)}
			<path id="{uid}-{angle}" d={arcPath(angle)} fill="none" />
		{/each}
	</defs>

	{#each labelAngles as angle (angle)}
		<text
			font-size={fontSize}
			letter-spacing={tracking}
			dominant-baseline="central"
			style="text-transform: uppercase; font-weight: 700;"
		>
			<textPath href="#{uid}-{angle}" startOffset="50%" text-anchor="middle">{text}</textPath>
		</text>
	{/each}

	{#each sepAngles as angle (angle)}
		{@const p = point(angle)}
		<text
			x={p.x}
			y={p.y}
			font-size={fontSize}
			text-anchor="middle"
			dominant-baseline="central"
			opacity="0.6">·</text
		>
	{/each}
</svg>
