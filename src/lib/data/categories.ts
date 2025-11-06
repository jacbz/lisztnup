import type { GuessCategory } from '$lib/types';
import { extractPathFromSVG } from '$lib/utils';
import composerIcon from '$lib/assets/icons/composer.svg?raw';
import workIcon from '$lib/assets/icons/work.svg?raw';
import eraIcon from '$lib/assets/icons/era.svg?raw';
import formIcon from '$lib/assets/icons/form.svg?raw';
import decadeIcon from '$lib/assets/icons/decade.svg?raw';

export interface CategoryDefinition {
	id: GuessCategory;
	color1: string;
	color2: string;
	glowColor: string;
	iconPath: string[];
}

export const categories: CategoryDefinition[] = [
	{
		id: 'composer',
		color1: '#06b6d4',
		color2: '#22d3ee',
		glowColor: 'rgba(6, 182, 212, 0.8)',
		iconPath: extractPathFromSVG(composerIcon)
	},
	{
		id: 'work',
		color1: '#ec4899',
		color2: '#f472b6',
		glowColor: 'rgba(236, 72, 153, 0.8)',
		iconPath: extractPathFromSVG(workIcon)
	},
	{
		id: 'era',
		color1: '#8b5cf6',
		color2: '#a78bfa',
		glowColor: 'rgba(139, 92, 246, 0.8)',
		iconPath: extractPathFromSVG(eraIcon)
	},
	{
		id: 'form',
		color1: '#f59e0b',
		color2: '#fbbf24',
		glowColor: 'rgba(245, 158, 11, 0.8)',
		iconPath: extractPathFromSVG(formIcon)
	},
	{
		id: 'decade',
		color1: '#10b981',
		color2: '#34d399',
		glowColor: 'rgba(16, 185, 129, 0.8)',
		iconPath: extractPathFromSVG(decadeIcon)
	}
];

export function getCategoryDefinition(id: GuessCategory): CategoryDefinition | undefined {
	return categories.find((cat) => cat.id === id);
}
