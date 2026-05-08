import * as Configs from '../../src/lib/data/tracklistConfigs';
import type { SuiteTracklist } from './types';

function tracklist(
	id: string,
	category: SuiteTracklist['category'],
	config: SuiteTracklist['config']
): SuiteTracklist {
	return {
		kind: 'default',
		id,
		label: id
			.split(/(?=[A-Z])|-/)
			.join(' ')
			.replace(/\b\w/g, (char) => char.toUpperCase()),
		category,
		config
	};
}

export const DIFFICULTY_TRACKLIST_IDS = [
	'beginner',
	'intermediate',
	'skilled',
	'advanced',
	'expert',
	'virtuoso',
	'cadenza',
	'obscure'
] as const;

export const ALL_SUITE_TRACKLISTS: readonly SuiteTracklist[] = [
	tracklist('beginner', 'difficulty', Configs.BEGINNER_CONFIG),
	tracklist('intermediate', 'difficulty', Configs.INTERMEDIATE_CONFIG),
	tracklist('skilled', 'difficulty', Configs.SKILLED_CONFIG),
	tracklist('advanced', 'difficulty', Configs.ADVANCED_CONFIG),
	tracklist('expert', 'difficulty', Configs.EXPERT_CONFIG),
	tracklist('virtuoso', 'difficulty', Configs.VIRTUOSO_CONFIG),
	tracklist('cadenza', 'difficulty', Configs.CADENZA_CONFIG),
	tracklist('obscure', 'difficulty', Configs.OBSCURE_CONFIG),
	tracklist('piano', 'categories', Configs.PIANO_CONFIG),
	tracklist('orchestral', 'categories', Configs.ORCHESTRAL_CONFIG),
	tracklist('chamber', 'categories', Configs.CHAMBER_CONFIG),
	tracklist('ballet', 'categories', Configs.BALLET_CONFIG),
	tracklist('opera', 'categories', Configs.OPERA_CONFIG),
	tracklist('concerto', 'categories', Configs.CONCERTO_CONFIG),
	tracklist('pianoconcerto', 'categories', Configs.PIANOCONCERTO_CONFIG),
	tracklist('violinconcerto', 'categories', Configs.VIOLINCONCERTO_CONFIG),
	tracklist('celloconcerto', 'categories', Configs.CELLOCONCERTO_CONFIG),
	tracklist('woodwindconcerto', 'categories', Configs.WOODWINDCONCERTO_CONFIG),
	tracklist('bach', 'composers', Configs.BACH_CONFIG),
	tracklist('beethoven', 'composers', Configs.BEETHOVEN_CONFIG),
	tracklist('mozart', 'composers', Configs.MOZART_CONFIG),
	tracklist('liszt', 'composers', Configs.LISZT_CONFIG),
	tracklist('chopin', 'composers', Configs.CHOPIN_CONFIG),
	tracklist('tchaikovsky', 'composers', Configs.TCHAIKOVSKY_CONFIG),
	tracklist('vivaldi', 'composers', Configs.VIVALDI_CONFIG),
	tracklist('femalecomposers', 'composers', Configs.FEMALE_COMPOSERS_CONFIG),
	tracklist('renaissance', 'eras', Configs.RENAISSANCE_CONFIG),
	tracklist('baroque', 'eras', Configs.BAROQUE_CONFIG),
	tracklist('classical', 'eras', Configs.CLASSICAL_CONFIG),
	tracklist('romantic', 'eras', Configs.ROMANTIC_CONFIG),
	tracklist('modernism', 'eras', Configs.MODERNISM_CONFIG),
	tracklist('contemporary', 'eras', Configs.CONTEMPORARY_CONFIG),
	tracklist('germany', 'countries', Configs.GERMANY_CONFIG),
	tracklist('italy', 'countries', Configs.ITALY_CONFIG),
	tracklist('france', 'countries', Configs.FRANCE_CONFIG),
	tracklist('russia', 'countries', Configs.RUSSIA_CONFIG),
	tracklist('uk', 'countries', Configs.UK_CONFIG),
	tracklist('usa', 'countries', Configs.USA_CONFIG),
	tracklist('spain', 'countries', Configs.SPAIN_CONFIG),
	tracklist('scandinavia', 'countries', Configs.SCANDINAVIA_CONFIG)
] as const;

export function resolveTracklists(selection: string[]): SuiteTracklist[] {
	const selected =
		selection.length === 0 || selection.includes('all')
			? ALL_SUITE_TRACKLISTS
			: selection.includes('difficulty')
				? ALL_SUITE_TRACKLISTS.filter((candidate) =>
						DIFFICULTY_TRACKLIST_IDS.includes(
							candidate.id as (typeof DIFFICULTY_TRACKLIST_IDS)[number]
						)
					)
				: ALL_SUITE_TRACKLISTS.filter((candidate) => selection.includes(candidate.id));

	const missing = selection.filter(
		(id) =>
			id !== 'all' &&
			id !== 'difficulty' &&
			!ALL_SUITE_TRACKLISTS.some((candidate) => candidate.id === id)
	);
	if (missing.length > 0) {
		throw new Error(`Unknown tracklist id(s): ${missing.join(', ')}`);
	}
	if (selected.length === 0) throw new Error('No tracklists selected');

	return [...selected];
}
