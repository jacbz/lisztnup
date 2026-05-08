import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GameCatalog, type RawLisztnupData } from '../../src/lib/models';
import {
	TracklistGenerator,
	type TracklistSamplePool
} from '../../src/lib/services/TracklistGenerator';
import { calculateTracklistDifficulty } from './difficulty';
import type {
	DatasetSummary,
	SuiteTracklist,
	TracklistDifficultyProfile,
	TracklistPoolSummary
} from './types';

export interface LoadedDataset {
	catalog: GameCatalog;
	summary: DatasetSummary;
}

export interface PreparedTracklistPool {
	definition: SuiteTracklist;
	pool: TracklistSamplePool;
	difficulty: TracklistDifficultyProfile;
	summary: TracklistPoolSummary;
	totalTracks: number;
	workWeights: readonly number[];
	partWeights: readonly (readonly number[])[];
}

export function loadDataset(repoRoot = process.cwd()): LoadedDataset {
	const started = performance.now();
	const dataPath = path.join(repoRoot, 'static', 'lisztnup.json');
	const rawText = fs.readFileSync(dataPath, 'utf-8');
	const raw = JSON.parse(rawText) as RawLisztnupData;
	const catalog = GameCatalog.fromRaw(raw);
	const yearEligibleWorks = raw.works.filter(
		(work) => work.begin_year != null || work.end_year != null
	);
	const yearEligibleParts = yearEligibleWorks.reduce((sum, work) => sum + work.parts.length, 0);

	return {
		catalog,
		summary: {
			path: dataPath,
			sha256: createHash('sha256').update(rawText).digest('hex'),
			composers: raw.composers.length,
			works: raw.works.length,
			parts: raw.works.reduce((sum, work) => sum + work.parts.length, 0),
			yearEligibleWorks: yearEligibleWorks.length,
			yearEligibleParts,
			loadMs: Math.round(performance.now() - started)
		}
	};
}

export function prepareTracklistPools(
	catalog: GameCatalog,
	tracklists: readonly SuiteTracklist[]
): PreparedTracklistPool[] {
	return tracklists.map((definition) => {
		const generator = new TracklistGenerator(catalog, definition, { requireWorkYear: true });
		const pool = generator.getSamplePool();
		const info = generator.getInfo();
		const useWeights = pool.usePopularityWeighting;
		const workWeights = pool.works.map((candidate) => (useWeights ? candidate.score : 1));
		const partWeights = pool.works.map((candidate) =>
			candidate.parts.map((part) => (useWeights ? part.score : 1))
		);
		const difficulty = calculateTracklistDifficulty(pool);

		return {
			definition,
			pool,
			difficulty,
			totalTracks: info.tracks,
			workWeights,
			partWeights,
			summary: {
				id: definition.id,
				label: definition.label,
				category: definition.category,
				composers: info.composers,
				works: info.works,
				tracks: info.tracks,
				difficulty
			}
		};
	});
}
