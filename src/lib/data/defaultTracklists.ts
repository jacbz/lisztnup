import type { DefaultTracklist, CustomTracklist, Tracklist } from '$lib/types';
import difficultyVeryEasy from '$lib/assets/icons/difficulty-veryeasy.svg?raw';
import difficultyEasy from '$lib/assets/icons/difficulty-easy.svg?raw';
import difficultyMedium from '$lib/assets/icons/difficulty-medium.svg?raw';
import difficultyHard from '$lib/assets/icons/difficulty-hard.svg?raw';
import difficultyExtreme from '$lib/assets/icons/difficulty-extreme.svg?raw';
import pianoIcon from '$lib/assets/icons/piano.svg?raw';
import fluteIcon from '$lib/assets/icons/flute.svg?raw';
import concertoIcon from '$lib/assets/icons/concerto.svg?raw';
import chamberIcon from '$lib/assets/icons/chamber.svg?raw';
import balletIcon from '$lib/assets/icons/ballet.svg?raw';
import operaIcon from '$lib/assets/icons/opera.svg?raw';
import globeIcon from '$lib/assets/icons/globe.svg?raw';
import starIcon from '$lib/assets/icons/star.svg?raw';
import violinIcon from '$lib/assets/icons/violin.svg?raw';
import celloIcon from '$lib/assets/icons/cello.svg?raw';
import orchestraIcon from '$lib/assets/icons/orchestra.svg?raw';
import composerIcon from '$lib/assets/icons/composer.svg?raw';
import eraIcon from '$lib/assets/icons/era.svg?raw';
import * as Configs from './tracklistConfigs';

/**
 * Default tracklist presets organized by categories
 */

export const DEFAULT_TRACKLISTS: DefaultTracklist[] = [
	// Difficulty-based tracklists
	{
		kind: 'default',
		id: 'beginner',
		icon: difficultyVeryEasy,
		category: 'difficulty',
		config: Configs.BEGINNER_CONFIG
	},
	{
		kind: 'default',
		id: 'intermediate',
		icon: difficultyEasy,
		category: 'difficulty',
		config: Configs.INTERMEDIATE_CONFIG
	},
	{
		kind: 'default',
		id: 'skilled',
		icon: difficultyMedium,
		category: 'difficulty',
		config: Configs.SKILLED_CONFIG
	},
	{
		kind: 'default',
		id: 'advanced',
		icon: difficultyHard,
		category: 'difficulty',
		config: Configs.ADVANCED_CONFIG
	},
	{
		kind: 'default',
		id: 'expert',
		icon: difficultyExtreme,
		category: 'difficulty',
		config: Configs.EXPERT_CONFIG
	},
	{
		kind: 'default',
		id: 'virtuoso',
		icon: starIcon,
		category: 'difficulty',
		config: Configs.VIRTUOSO_CONFIG
	},
	{
		kind: 'default',
		id: 'cadenza',
		icon: starIcon,
		category: 'difficulty',
		config: Configs.CADENZA_CONFIG
	},
	{
		kind: 'default',
		id: 'obscure',
		icon: composerIcon,
		category: 'difficulty',
		config: Configs.OBSCURE_CONFIG
	},
	// Category-based tracklists
	{
		kind: 'default',
		id: 'piano',
		icon: pianoIcon,
		category: 'categories',
		config: Configs.PIANO_CONFIG
	},
	{
		kind: 'default',
		id: 'orchestral',
		icon: orchestraIcon,
		category: 'categories',
		config: Configs.ORCHESTRAL_CONFIG
	},
	{
		kind: 'default',
		id: 'chamber',
		icon: chamberIcon,
		category: 'categories',
		config: Configs.CHAMBER_CONFIG
	},
	{
		kind: 'default',
		id: 'ballet',
		icon: balletIcon,
		category: 'categories',
		config: Configs.BALLET_CONFIG
	},
	{
		kind: 'default',
		id: 'opera',
		icon: operaIcon,
		category: 'categories',
		config: Configs.OPERA_CONFIG
	},
	{
		kind: 'default',
		id: 'concerto',
		icon: concertoIcon,
		category: 'categories',
		config: Configs.CONCERTO_CONFIG
	},
	{
		kind: 'default',
		id: 'pianoconcerto',
		icon: pianoIcon,
		category: 'categories',
		config: Configs.PIANOCONCERTO_CONFIG
	},
	{
		kind: 'default',
		id: 'violinconcerto',
		icon: violinIcon,
		category: 'categories',
		config: Configs.VIOLINCONCERTO_CONFIG
	},
	{
		kind: 'default',
		id: 'celloconcerto',
		icon: celloIcon,
		category: 'categories',
		config: Configs.CELLOCONCERTO_CONFIG
	},
	{
		kind: 'default',
		id: 'woodwindconcerto',
		icon: fluteIcon,
		category: 'categories',
		config: Configs.WOODWINDCONCERTO_CONFIG
	},

	// Composer-based tracklists
	{
		kind: 'default',
		id: 'bach',
		icon: composerIcon,
		category: 'composers',
		config: Configs.BACH_CONFIG
	},
	{
		kind: 'default',
		id: 'beethoven',
		icon: composerIcon,
		category: 'composers',
		config: Configs.BEETHOVEN_CONFIG
	},
	{
		kind: 'default',
		id: 'mozart',
		icon: composerIcon,
		category: 'composers',
		config: Configs.MOZART_CONFIG
	},
	{
		kind: 'default',
		id: 'liszt',
		icon: composerIcon,
		category: 'composers',
		config: Configs.LISZT_CONFIG
	},
	{
		kind: 'default',
		id: 'chopin',
		icon: composerIcon,
		category: 'composers',
		config: Configs.CHOPIN_CONFIG
	},
	{
		kind: 'default',
		id: 'tchaikovsky',
		icon: composerIcon,
		category: 'composers',
		config: Configs.TCHAIKOVSKY_CONFIG
	},
	{
		kind: 'default',
		id: 'vivaldi',
		icon: composerIcon,
		category: 'composers',
		config: Configs.VIVALDI_CONFIG
	},
	{
		kind: 'default',
		id: 'femalecomposers',
		icon: composerIcon,
		category: 'composers',
		config: Configs.FEMALE_COMPOSERS_CONFIG
	},

	// Era-based tracklists
	{
		kind: 'default',
		id: 'renaissance',
		icon: eraIcon,
		category: 'eras',
		config: Configs.RENAISSANCE_CONFIG
	},
	{
		kind: 'default',
		id: 'baroque',
		icon: eraIcon,
		category: 'eras',
		config: Configs.BAROQUE_CONFIG
	},
	{
		kind: 'default',
		id: 'classical',
		icon: eraIcon,
		category: 'eras',
		config: Configs.CLASSICAL_CONFIG
	},
	{
		kind: 'default',
		id: 'romantic',
		icon: eraIcon,
		category: 'eras',
		config: Configs.ROMANTIC_CONFIG
	},
	{
		kind: 'default',
		id: 'modernism',
		icon: eraIcon,
		category: 'eras',
		config: Configs.MODERNISM_CONFIG
	},
	{
		kind: 'default',
		id: 'contemporary',
		icon: eraIcon,
		category: 'eras',
		config: Configs.CONTEMPORARY_CONFIG
	},

	// Country-based tracklists
	{
		kind: 'default',
		id: 'germany',
		icon: globeIcon,
		category: 'countries',
		config: Configs.GERMANY_CONFIG
	},
	{
		kind: 'default',
		id: 'italy',
		icon: globeIcon,
		category: 'countries',
		config: Configs.ITALY_CONFIG
	},
	{
		kind: 'default',
		id: 'france',
		icon: globeIcon,
		category: 'countries',
		config: Configs.FRANCE_CONFIG
	},
	{
		kind: 'default',
		id: 'russia',
		icon: globeIcon,
		category: 'countries',
		config: Configs.RUSSIA_CONFIG
	},
	{
		kind: 'default',
		id: 'uk',
		icon: globeIcon,
		category: 'countries',
		config: Configs.UK_CONFIG
	},
	{
		kind: 'default',
		id: 'usa',
		icon: globeIcon,
		category: 'countries',
		config: Configs.USA_CONFIG
	},
	{
		kind: 'default',
		id: 'spain',
		icon: globeIcon,
		category: 'countries',
		config: Configs.SPAIN_CONFIG
	},
	{
		kind: 'default',
		id: 'scandinavia',
		icon: globeIcon,
		category: 'countries',
		config: Configs.SCANDINAVIA_CONFIG
	}
];

/** Returns the display name for any tracklist, resolving i18n for defaults. */
export function tracklistDisplayName(t: Tracklist, translate: (key: string) => string): string {
	return t.kind === 'default' ? translate(`tracklists.${t.id}.name`) : t.name;
}

/** Returns the description for any tracklist, resolving i18n for defaults. */
export function tracklistDescription(t: Tracklist, translate: (key: string) => string): string {
	return t.kind === 'default' ? translate(`tracklists.${t.id}.description`) : t.description;
}

/**
 * Creates a custom clone of a tracklist.
 * @param tracklist - The tracklist to clone
 * @param customTracklists - Existing custom tracklists (for name collision avoidance)
 * @param translatedName - Resolved display name (required when cloning a default tracklist)
 * @param translatedDescription - Resolved description (required when cloning a default tracklist)
 */
export function cloneTracklist(
	tracklist: Tracklist,
	customTracklists: CustomTracklist[],
	translatedName?: string,
	translatedDescription?: string
): CustomTracklist {
	const baseName =
		translatedName ?? (tracklist.kind === 'custom' ? tracklist.name : tracklist.id);
	const baseDescription =
		translatedDescription ?? (tracklist.kind === 'custom' ? tracklist.description : '');

	// Generate unique name with " (Copy)" suffix
	let name = `${baseName} (Copy)`;
	let counter = 1;

	while (customTracklists.some((t) => t.name === name)) {
		name = `${baseName} (Copy ${counter})`;
		counter++;
	}

	return {
		kind: 'custom',
		id: crypto.randomUUID(),
		icon: tracklist.icon,
		name,
		description: baseDescription,
		category: 'custom',
		config: JSON.parse(JSON.stringify(tracklist.config))
	};
}
