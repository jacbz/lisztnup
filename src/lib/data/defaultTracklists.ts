import type { Tracklist } from '$lib/types';
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

export const DEFAULT_TRACKLISTS: Tracklist[] = [
	// Difficulty-based tracklists
	{
		name: 'tracklists.beginner.name',
		description: 'tracklists.beginner.description',
		isDefault: true,
		icon: difficultyVeryEasy,
		category: 'difficulty',
		config: Configs.BEGINNER_CONFIG
	},
	{
		name: 'tracklists.intermediate.name',
		description: 'tracklists.intermediate.description',
		isDefault: true,
		icon: difficultyEasy,
		category: 'difficulty',
		config: Configs.INTERMEDIATE_CONFIG
	},
	{
		name: 'tracklists.skilled.name',
		description: 'tracklists.skilled.description',
		isDefault: true,
		icon: difficultyMedium,
		category: 'difficulty',
		config: Configs.SKILLED_CONFIG
	},
	{
		name: 'tracklists.advanced.name',
		description: 'tracklists.advanced.description',
		isDefault: true,
		icon: difficultyHard,
		category: 'difficulty',
		config: Configs.ADVANCED_CONFIG
	},
	{
		name: 'tracklists.expert.name',
		description: 'tracklists.expert.description',
		isDefault: true,
		icon: difficultyExtreme,
		category: 'difficulty',
		config: Configs.EXPERT_CONFIG
	},
	{
		name: 'tracklists.virtuoso.name',
		description: 'tracklists.virtuoso.description',
		isDefault: true,
		icon: starIcon,
		category: 'difficulty',
		config: Configs.VIRTUOSO_CONFIG
	},
	{
		name: 'tracklists.cadenza.name',
		description: 'tracklists.cadenza.description',
		isDefault: true,
		icon: starIcon,
		category: 'difficulty',
		config: Configs.CADENZA_CONFIG
	},
	{
		name: 'tracklists.obscure.name',
		description: 'tracklists.obscure.description',
		isDefault: true,
		icon: composerIcon,
		category: 'difficulty',
		config: Configs.OBSCURE_CONFIG
	},
	// Category-based tracklists
	{
		name: 'tracklists.piano.name',
		description: 'tracklists.piano.description',
		isDefault: true,
		icon: pianoIcon,
		category: 'categories',
		config: Configs.PIANO_CONFIG
	},
	{
		name: 'tracklists.orchestral.name',
		description: 'tracklists.orchestral.description',
		isDefault: true,
		icon: orchestraIcon,
		category: 'categories',
		config: Configs.ORCHESTRAL_CONFIG
	},
	{
		name: 'tracklists.chamber.name',
		description: 'tracklists.chamber.description',
		isDefault: true,
		icon: chamberIcon,
		category: 'categories',
		config: Configs.CHAMBER_CONFIG
	},
	{
		name: 'tracklists.ballet.name',
		description: 'tracklists.ballet.description',
		isDefault: true,
		icon: balletIcon,
		category: 'categories',
		config: Configs.BALLET_CONFIG
	},
	{
		name: 'tracklists.opera.name',
		description: 'tracklists.opera.description',
		isDefault: true,
		icon: operaIcon,
		category: 'categories',
		config: Configs.OPERA_CONFIG
	},
	{
		name: 'tracklists.concerto.name',
		description: 'tracklists.concerto.description',
		isDefault: true,
		icon: concertoIcon,
		category: 'categories',
		config: Configs.CONCERTO_CONFIG
	},
	{
		name: 'tracklists.pianoconcerto.name',
		description: 'tracklists.pianoconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: pianoIcon,
		config: Configs.PIANOCONCERTO_CONFIG
	},
	{
		name: 'tracklists.violinconcerto.name',
		description: 'tracklists.violinconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: violinIcon,
		config: Configs.VIOLINCONCERTO_CONFIG
	},
	{
		name: 'tracklists.celloconcerto.name',
		description: 'tracklists.celloconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: celloIcon,
		config: Configs.CELLOCONCERTO_CONFIG
	},
	{
		name: 'tracklists.woodwindconcerto.name',
		description: 'tracklists.woodwindconcerto.description',
		isDefault: true,
		category: 'categories',
		icon: fluteIcon,
		config: Configs.WOODWINDCONCERTO_CONFIG
	},

	// Composer-based tracklists
	{
		name: 'tracklists.bach.name',
		description: 'tracklists.bach.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.BACH_CONFIG
	},
	{
		name: 'tracklists.beethoven.name',
		description: 'tracklists.beethoven.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.BEETHOVEN_CONFIG
	},
	{
		name: 'tracklists.mozart.name',
		description: 'tracklists.mozart.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.MOZART_CONFIG
	},
	{
		name: 'tracklists.liszt.name',
		description: 'tracklists.liszt.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.LISZT_CONFIG
	},
	{
		name: 'tracklists.chopin.name',
		description: 'tracklists.chopin.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.CHOPIN_CONFIG
	},
	{
		name: 'tracklists.tchaikovsky.name',
		description: 'tracklists.tchaikovsky.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.TCHAIKOVSKY_CONFIG
	},
	{
		name: 'tracklists.vivaldi.name',
		description: 'tracklists.vivaldi.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.VIVALDI_CONFIG
	},
	{
		name: 'tracklists.femalecomposers.name',
		description: 'tracklists.femalecomposers.description',
		isDefault: true,
		icon: composerIcon,
		category: 'composers',
		config: Configs.FEMALE_COMPOSERS_CONFIG
	},

	// Era-based tracklists
	{
		name: 'tracklists.renaissance.name',
		description: 'tracklists.renaissance.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.RENAISSANCE_CONFIG
	},
	{
		name: 'tracklists.baroque.name',
		description: 'tracklists.baroque.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.BAROQUE_CONFIG
	},
	{
		name: 'tracklists.classical.name',
		description: 'tracklists.classical.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.CLASSICAL_CONFIG
	},
	{
		name: 'tracklists.romantic.name',
		description: 'tracklists.romantic.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.ROMANTIC_CONFIG
	},
	{
		name: 'tracklists.modernism.name',
		description: 'tracklists.modernism.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.MODERNISM_CONFIG
	},
	{
		name: 'tracklists.contemporary.name',
		description: 'tracklists.contemporary.description',
		isDefault: true,
		category: 'eras',
		icon: eraIcon,
		config: Configs.CONTEMPORARY_CONFIG
	},

	// Country-based tracklists
	{
		name: 'tracklists.germany.name',
		description: 'tracklists.germany.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.GERMANY_CONFIG
	},
	{
		name: 'tracklists.italy.name',
		description: 'tracklists.italy.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.ITALY_CONFIG
	},
	{
		name: 'tracklists.france.name',
		description: 'tracklists.france.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.FRANCE_CONFIG
	},
	{
		name: 'tracklists.russia.name',
		description: 'tracklists.russia.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.RUSSIA_CONFIG
	},
	{
		name: 'tracklists.uk.name',
		description: 'tracklists.uk.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.UK_CONFIG
	},
	{
		name: 'tracklists.usa.name',
		description: 'tracklists.usa.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.USA_CONFIG
	},
	{
		name: 'tracklists.spain.name',
		description: 'tracklists.spain.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.SPAIN_CONFIG
	},
	{
		name: 'tracklists.scandinavia.name',
		description: 'tracklists.scandinavia.description',
		isDefault: true,
		category: 'countries',
		icon: globeIcon,
		config: Configs.SCANDINAVIA_CONFIG
	}
];

/**
 * Creates a clone of a tracklist with a new name
 * @param tracklist - The tracklist to clone
 * @param customTracklists - List of existing custom tracklists to avoid name collisions
 * @param translatedName - The translated name (for default tracklists)
 * @param translatedDescription - The translated description (for default tracklists)
 */
export function cloneTracklist(
	tracklist: Tracklist,
	customTracklists: Tracklist[],
	translatedName?: string,
	translatedDescription?: string
): Tracklist {
	// Use translated name if provided (for default tracklists), otherwise use original name
	const baseName = translatedName || tracklist.name;
	const baseDescription = translatedDescription || tracklist.description;

	// Generate unique name with " (Copy)" suffix
	let name = `${baseName} (Copy)`;
	let counter = 1;

	while (customTracklists.some((t) => t.name === name)) {
		name = `${baseName} (Copy ${counter})`;
		counter++;
	}

	// Create clone with new name
	return {
		...tracklist,
		name,
		description: baseDescription,
		isDefault: false,
		category: 'custom', // Custom clones always go in custom category
		config: JSON.parse(JSON.stringify(tracklist.config)) // Deep clone config
	};
}
