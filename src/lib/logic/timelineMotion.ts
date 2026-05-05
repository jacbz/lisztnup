import { quintOut } from 'svelte/easing';

export function rotateVector(x: number, y: number, angleDeg: number) {
	const rad = (-angleDeg * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	return {
		x: x * cos - y * sin,
		y: x * sin + y * cos
	};
}

export const timelineCardRestStyle = 'transform: translateY(0) rotate(0) scale(1); opacity: 1;';
export const timelineCardDiscardStyle =
	'transform: translateY(120px) rotate(15deg) scale(0.9); opacity: 0; pointer-events: none;';

export function discardTimelineCard(
	_node: Element,
	{ duration = 600, easing = quintOut }: { duration?: number; easing?: (t: number) => number } = {}
) {
	return {
		duration,
		easing,
		css: (t: number, u: number) => `
			transform: translateY(${120 * u}px) rotate(${15 * u}deg) scale(${0.9 + 0.1 * t});
			opacity: ${t};
			pointer-events: none;
		`
	};
}

export function flyTimelineCardFromCenter(
	node: Element,
	{
		rotation = 0,
		delay = 0,
		duration = 400,
		easing = quintOut
	}: { rotation?: number; delay?: number; duration?: number; easing?: (t: number) => number } = {}
) {
	const rect = node.getBoundingClientRect();
	const centerX = window.innerWidth / 2;
	const centerY = window.innerHeight / 2;
	const targetX = rect.left + rect.width / 2;
	const targetY = rect.top + rect.height / 2;
	const local = rotateVector(centerX - targetX, centerY - targetY, rotation);

	return {
		delay,
		duration,
		easing,
		css: (t: number, u: number) => `
			transform: translate(${u * local.x}px, ${u * local.y}px) scale(${0.2 + 0.8 * t});
			opacity: ${t};
		`
	};
}

export function getStreakHeat(streak: number): number {
	return Math.min(Math.max((streak - 3) / 12, 0), 1);
}

export function getStreakRgb(streak: number) {
	const t = getStreakHeat(streak);
	return {
		r: Math.round(251 - t * 31),
		g: Math.round(146 - t * 108),
		b: Math.round(60 - t * 22)
	};
}

export function getStreakTextStyle(streak: number): string {
	const { r, g, b } = getStreakRgb(streak);
	return `color: rgb(${r}, ${g}, ${b});`;
}

export function getStreakGlow(streak: number, active: boolean): string {
	if (streak < 3) return '';
	const t = getStreakHeat(streak);
	const dim = active ? 1 : 0.5;
	const spread = (40 + t * 40) * dim;
	const opacity = (0.55 + t * 0.35) * dim;
	const { r, g, b } = getStreakRgb(streak);
	return `0 0 ${spread}px rgba(${r},${g},${b},${opacity})`;
}
