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

/**
 * Multiplier to Heat [0, 1] mapping.
 * 1.35x (streak 3) is the start of visible heat.
 * 2.0x (streak 6+) is maximum heat.
 */
export function getStreakHeat(multiplier: number): number {
	if (multiplier < 1.35) return 0;
	return Math.min(Math.max((multiplier - 1.35) / 0.65, 0), 1);
}

export function getStreakRgb(multiplier: number) {
	const t = getStreakHeat(multiplier);
	return {
		r: Math.round(251 - t * 31),
		g: Math.round(146 - t * 108),
		b: Math.round(60 - t * 22)
	};
}

export function getStreakTextStyle(multiplier: number): string {
	const { r, g, b } = getStreakRgb(multiplier);
	return `color: rgb(${r}, ${g}, ${b});`;
}

export function getStreakGlow(multiplier: number, active: boolean): string {
	if (multiplier < 1.35) return '';
	const t = getStreakHeat(multiplier);
	const dim = active ? 1 : 0.5;
	const spread = (40 + t * 40) * dim;
	const opacity = (0.55 + t * 0.35) * dim;
	const { r, g, b } = getStreakRgb(multiplier);
	return `0 0 ${spread}px rgba(${r},${g},${b},${opacity})`;
}
