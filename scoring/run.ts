import fs from 'node:fs';
import path from 'node:path';
import { loadDataset, prepareTracklistPools } from './suite/dataset';
import { printReport } from './suite/report';
import { runSimulationSuite } from './suite/simulation';
import { resolveTracklists } from './suite/tracklists';
import type { ProfileName, RunOptions } from './suite/types';
import { resolveParameterSets } from './parameterSets';

const PROFILE_DEFAULTS: Record<
	ProfileName,
	{
		games: number;
		tracklistIds: string[];
		targets: number[];
		tableIds: string[];
		parameterSetIds: string[];
	}
> = {
	quick: {
		games: 2000,
		tracklistIds: ['beginner', 'intermediate', 'advanced', 'expert', 'virtuoso'],
		targets: [6],
		tableIds: [],
		parameterSetIds: ['production']
	},
	balanced: {
		games: 100000,
		tracklistIds: ['all'],
		targets: [6, 10, 15],
		tableIds: [],
		parameterSetIds: ['all']
	},
	heavy: {
		games: 300000,
		tracklistIds: ['all'],
		targets: [6, 10, 15],
		tableIds: [],
		parameterSetIds: ['all']
	}
};

async function main(): Promise<void> {
	const startedAt = performance.now();
	const options = parseArgs(process.argv.slice(2));
	const dataset = loadDataset();
	const tracklists = resolveTracklists(options.tracklistIds);
	const parameterSets = resolveParameterSets(options.parameterSetIds);
	const pools = prepareTracklistPools(dataset.catalog, tracklists);
	const showProgress = options.games >= 10_000;

	if (showProgress) {
		console.log(
			`Loaded ${dataset.summary.works.toLocaleString('en-US')} works and prepared ${pools.length.toLocaleString('en-US')} tracklists.`
		);
		console.log(
			`Simulating ${options.games.toLocaleString('en-US')} games across ${parameterSets.length} parameter set(s)...`
		);
	}

	const report = runSimulationSuite({
		profile: options.profile,
		seed: options.seed,
		games: options.games,
		targets: options.targets,
		parameterSets,
		pools,
		dataset: dataset.summary,
		tableIds: options.tableIds.length > 0 ? options.tableIds : undefined,
		startedAt,
		onProgress: showProgress ? printProgress : undefined
	});

	printReport(report);
	if (options.jsonOut) {
		const outputPath = path.resolve(options.jsonOut);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
		console.log(`\nJSON report written to ${outputPath}`);
	}
}

function printProgress(progress: {
	gamesSimulated: number;
	gamesTotal: number;
	percent: number;
	elapsedMs: number;
	gamesPerSecond: number;
	turnsPerSecond: number;
	heapUsedMb: number;
}): void {
	console.log(
		[
			`[score:sim] ${(progress.percent * 100).toFixed(1)}%`,
			`${progress.gamesSimulated.toLocaleString('en-US')}/${progress.gamesTotal.toLocaleString('en-US')} games`,
			`${Math.round(progress.gamesPerSecond).toLocaleString('en-US')} games/s`,
			`${Math.round(progress.turnsPerSecond).toLocaleString('en-US')} turns/s`,
			`${progress.heapUsedMb} MB heap`,
			`${(progress.elapsedMs / 1000).toFixed(0)}s`
		].join(' | ')
	);
}

export function parseArgs(args: string[]): RunOptions {
	let profile: ProfileName = 'balanced';
	const overrides: Partial<RunOptions> = {};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = () => {
			const value = args[++i];
			if (!value) throw new Error(`Missing value for ${arg}`);
			return value;
		};

		if (arg === '--profile') {
			profile = parseProfile(next());
		} else if (arg === '--games') {
			overrides.games = parsePositiveInt(next(), '--games');
		} else if (arg === '--seed') {
			overrides.seed = next();
		} else if (arg === '--sets') {
			overrides.parameterSetIds = parseList(next());
		} else if (arg === '--tracklists') {
			overrides.tracklistIds = parseList(next());
		} else if (arg === '--targets') {
			overrides.targets = parseList(next()).map((value) => parsePositiveInt(value, '--targets'));
		} else if (arg === '--tables') {
			overrides.tableIds = parseList(next());
		} else if (arg === '--json-out') {
			const value = next();
			overrides.jsonOut = value === 'none' ? null : value;
		} else if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		} else if (arg === '--') {
			continue;
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	const defaults = PROFILE_DEFAULTS[profile];
	const seed = overrides.seed ?? `lisztnup-${profile}`;
	return {
		profile,
		games: overrides.games ?? defaults.games,
		seed,
		parameterSetIds: overrides.parameterSetIds ?? defaults.parameterSetIds,
		tracklistIds: overrides.tracklistIds ?? defaults.tracklistIds,
		targets: overrides.targets ?? defaults.targets,
		tableIds: overrides.tableIds ?? defaults.tableIds,
		jsonOut: overrides.jsonOut === undefined ? defaultJsonPath(profile, seed) : overrides.jsonOut
	};
}

function parseProfile(value: string): ProfileName {
	if (value === 'quick' || value === 'balanced' || value === 'heavy') return value;
	throw new Error(`Unknown profile: ${value}`);
}

function parseList(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}

function parsePositiveInt(value: string, flag: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive integer`);
	}
	return parsed;
}

function defaultJsonPath(profile: ProfileName, seed: string): string {
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const cleanSeed = seed.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
	return path.join('scoring', 'results', `${stamp}-${profile}-${cleanSeed}.json`);
}

function printHelp(): void {
	console.log(`Timeline scoring simulator

Usage:
  pnpm score:sim -- [options]

Options:
  --profile quick|balanced|heavy
  --games <n>
  --seed <seed>
  --sets production,<other profiles>|all
  --tracklists all|difficulty|beginner,expert
  --targets 6,10,15
  --tables solo-casual,mixed-party
  --json-out <path|none>
`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
