import assert from 'node:assert/strict';
import {
	calculateCompletion,
	calculateConsolationScore,
	calculateDiff,
	calculateGap,
	calculateMissStreak,
	calculateSpeed,
	calculateTurnScore
} from '../src/lib/logic/timelineScoring';
import { loadDataset, prepareTracklistPools } from './suite/dataset';
import { compactSignature } from './suite/report';
import { runSimulationSuite } from './suite/simulation';
import { resolveTracklists } from './suite/tracklists';
import type {
	BucketSummary,
	DatasetSummary,
	ParameterSetSummary,
	PersonaSummary,
	SuiteReport
} from './suite/types';
import { buildWarnings } from './suite/warnings';
import { resolveParameterSets } from './parameterSets';

function testProductionScoring(): void {
	assert.equal(Math.round(calculateDiff(25)), 750);
	assert.equal(calculateSpeed(1), 1.25);
	assert.equal(calculateGap(1800, 1810), 10);
	assert.equal(calculateGap(null, 1850, undefined, 1800, 1900), 50);
	assert.equal(calculateGap(1850, null, undefined, 1800, 1900), 50);
	assert.equal(calculateCompletion(6, 5), 6000);
	assert.equal(calculateMissStreak(8), 4);
	assert.equal(calculateMissStreak(5), 2);
	assert.equal(calculateMissStreak(2), 0);

	// Consolation: 1888 placed in [1865, 1879] slot
	const consolation1 = calculateConsolationScore(1888, 1865, 1879, 6, 5);
	assert.equal(consolation1.dErr, 9);
	assert.equal(consolation1.consolation, 73); // round(100 * 0.5^(9/20)) * 1.0 = 73

	// Consolation: 1943 placed in [null, 1870] slot (left edge)
	const consolation2 = calculateConsolationScore(1943, null, 1870, 6, 5);
	assert.equal(consolation2.dErr, 73);
	assert.equal(consolation2.consolation, 8); // round(100 * 0.5^(73/20)) * 1.0 = 8

	const score = calculateTurnScore({ gap: 25, seconds: 1, streak: 5 });
	assert.equal(score.base, 1000);
	assert.equal(score.diff, 750);
	assert.equal(score.scoreBeforeStreak, 2188);
	assert.equal(score.score, 3829);
}

import { replayTimelineLog, isCompletedLog } from '../src/lib/logic/timelineReplayUtils';
import { GameCatalog } from '../src/lib/models';
import fs from 'fs';
import path from 'path';

function testLogValidation(): void {
	const validLog = {
		v: 1,
		initial: 'abc',
		initialYear: 1800,
		tracklistMin: 1400,
		tracklistMax: 2020,
		turns: [{ part: 'p1', ok: true }]
	};
	// Target 2 cards: needs 1 turn.
	assert.equal(isCompletedLog(validLog, 2), true);
	// Target 3 cards: 1 turn is not enough.
	assert.equal(isCompletedLog(validLog, 3), false);

	// The case from the user: 5 turns for target 6 cards.
	const userLog = {
		v: 1,
		initial: 'init',
		initialYear: 1800,
		tracklistMin: 1400,
		tracklistMax: 2020,
		turns: new Array(5).fill({ part: 'p', ok: true })
	};
	assert.equal(isCompletedLog(userLog, 6), true);
}

function testReplayConsolation(): void {
	const dataPath = path.join(process.cwd(), 'static/lisztnup.json');
	const rawData = fs.readFileSync(dataPath, 'utf-8');
	const data = GameCatalog.fromRaw(JSON.parse(rawData));

	const trackLookup = (partGid: string) => {
		for (const work of data.works) {
			for (const part of work.parts) {
				if (part.gid === partGid) {
					return { work, part, composer: work.composer };
				}
			}
		}
		return undefined;
	};

	const findTrack = (year: number) => {
		for (const work of data.works) {
			if (work.end_year === year || work.begin_year === year) {
				return work.parts[0].gid;
			}
		}
		return null;
	};

	const g1781 = findTrack(1781);
	const g1907 = findTrack(1907);
	const g1978 = findTrack(1978);

	if (!g1781 || !g1907 || !g1978) {
		console.warn('Skipping replay consolation test: tracks not found in dataset.');
		return;
	}

	const log = {
		v: 1,
		initial: g1781,
		turns: [
			{
				part: g1907,
				index: 1,
				ok: true,
				seconds: 10,
				points: 1000,
				score: 1000,
				year: 1907
			},
			{
				part: g1978,
				index: 1, // Misplaced between 1781 and 1907
				ok: false,
				seconds: 10,
				points: 1, // Non-zero
				score: 1000,
				year: 1978
			}
		]
	} as any;

	const result = replayTimelineLog(log, 6, trackLookup, undefined, 1400, 2020);
	const points = result.newTurns[1].points;
	// Expected: dErr = min(|1978-1781|, |1978-1907|) = 71
	// round(100 * 0.5^(71/20)) = 9
	assert.equal(points, 9, `Consolation score should be 9, got ${points}`);
}

function runTinyReport(seed: string) {
	const startedAt = performance.now();
	const dataset = loadDataset();
	const pools = prepareTracklistPools(dataset.catalog, resolveTracklists(['beginner', 'expert']));
	return runSimulationSuite({
		profile: 'quick',
		seed,
		games: 80,
		targets: [6],
		parameterSets: resolveParameterSets(['production']),
		pools,
		dataset: dataset.summary,
		tableIds: ['solo-random', 'solo-casual', 'solo-expert', 'mixed-party'],
		startedAt
	});
}

function testDeterminism(): void {
	const first = compactSignature(runTinyReport('determinism'));
	const second = compactSignature(runTinyReport('determinism'));
	assert.deepEqual(first, second);
}

function testSkillSignal(): void {
	const report = runTinyReport('skill');
	const personas = report.personasBySet.production;
	const random = personas.find((persona) => persona.id === 'random');
	const expert = personas.find((persona) => persona.id === 'expert');
	assert.ok(random);
	assert.ok(expert);
	assert.equal(expert.score.mean > random.score.mean, true);
}

function testSoloMultiplayerSegregation(): void {
	const report = runTinyReport('segregated');
	const solo = report.soloPersonasBySet.production;
	const multiplayer = report.multiplayerPersonasBySet.production;
	const soloRandom = solo.find((persona) => persona.id === 'random');
	const multiplayerRandom = multiplayer.find((persona) => persona.id === 'random');
	const soloExpert = solo.find((persona) => persona.id === 'expert');
	const multiplayerExpert = multiplayer.find((persona) => persona.id === 'expert');
	assert.ok(soloRandom);
	assert.ok(multiplayerRandom);
	assert.ok(soloExpert);
	assert.ok(multiplayerExpert);
	assert.equal(soloRandom.count > 0, true);
	assert.equal(multiplayerRandom.count, 0);
	assert.equal(soloExpert.count > 0, true);
	assert.equal(multiplayerExpert.count > 0, true);
}

function testStructuredWarnings(): void {
	const parameterSet: ParameterSetSummary = {
		id: 'test',
		label: 'Test',
		...bucketSummary(12000),
		leaderboardRiskRate: 0.002,
		multiplayerUpsetRate: 0,
		skillOrderViolations: 1
	};
	const report: SuiteReport = {
		generatedAt: '2026-05-07T00:00:00.000Z',
		profile: 'quick',
		seed: 'warnings',
		gamesRequested: 1,
		gamesSimulated: 1,
		scenarioCount: 1,
		dataset: emptyDataset(),
		tracklists: [],
		parameterSets: [parameterSet],
		personasBySet: {
			test: [
				personaSummary('random', 'Random Guesser', 0, 12000, 11000, 25000, 0.25, 0.34),
				personaSummary('farmer', 'Adversarial Farmer', 0.5, 11000, 9000, 16000, 0.01, 0.01),
				personaSummary('new-listener', 'New Listener', 1, 11000, 9500, 22000, 0.27, 0.32),
				personaSummary('casual', 'Casual Fan', 2, 13000, 10000, 23000, 0.32, 0.28),
				personaSummary('careful-casual', 'Careful Casual', 3, 15000, 14000, 26000, 0.34, 0.6),
				personaSummary('enthusiast', 'Enthusiast', 5, 18000, 17000, 31000, 0.45, 0.65),
				personaSummary('expert', 'Expert', 6, 23000, 22000, 40000, 0.6, 0.9)
			]
		},
		soloPersonasBySet: {
			test: [
				personaSummary('random', 'Random Guesser', 0, 12000, 11000, 25000, 0.25, 0.34),
				personaSummary('farmer', 'Adversarial Farmer', 0.5, 11000, 9000, 16000, 0.01, 0.01),
				personaSummary('new-listener', 'New Listener', 1, 11000, 9500, 22000, 0.27, 0.32),
				personaSummary('casual', 'Casual Fan', 2, 13000, 10000, 23000, 0.32, 0.28),
				personaSummary('careful-casual', 'Careful Casual', 3, 15000, 14000, 26000, 0.34, 0.6),
				personaSummary('enthusiast', 'Enthusiast', 5, 18000, 17000, 31000, 0.45, 0.65),
				personaSummary('expert', 'Expert', 6, 23000, 22000, 40000, 0.6, 0.9)
			]
		},
		multiplayerPersonasBySet: { test: [] },
		tracklistsBySet: {},
		targetsBySet: {},
		coverage: {
			turns: 0,
			correctRate: 0,
			timeoutRate: 0,
			edgePlacementRate: 0,
			yearError: stats(0),
			gap: stats(0),
			drawnYear: stats(0)
		},
		warnings: [],
		performance: {
			totalMs: 0,
			simulationMs: 0,
			gamesPerSecond: 0,
			turnsPerSecond: 0,
			heapUsedMb: 0
		}
	};

	const warnings = buildWarnings(report);
	assert.deepEqual(
		warnings.map((warning) => warning.code),
		['persona-ordering', 'leaderboard-risk', 'random-tail-overlap', 'farmer-mean']
	);
	assert.deepEqual(
		warnings.map((warning) => warning.scope),
		['solo', 'all', 'solo', 'solo']
	);
	assert.equal(
		warnings.every(
			(warning) =>
				warning.title &&
				warning.observed &&
				warning.expected &&
				warning.explanation &&
				warning.recommendation
		),
		true
	);
	assert.equal(warnings[0].metrics.lowerSkillPersona, 'random');
}

function testAutomaticTracklistDifficulty(): void {
	const dataset = loadDataset();
	const pools = prepareTracklistPools(
		dataset.catalog,
		resolveTracklists(['bach', 'beginner', 'intermediate', 'renaissance', 'romantic'])
	);
	const bach = pools.find((pool) => pool.definition.id === 'bach');
	const beginner = pools.find((pool) => pool.definition.id === 'beginner');
	const intermediate = pools.find((pool) => pool.definition.id === 'intermediate');
	const renaissance = pools.find((pool) => pool.definition.id === 'renaissance');
	const romantic = pools.find((pool) => pool.definition.id === 'romantic');
	assert.ok(bach);
	assert.ok(beginner);
	assert.ok(intermediate);
	assert.ok(renaissance);
	assert.ok(romantic);
	assert.equal(bach.difficulty.effectiveComposers, 1);
	assert.equal(bach.difficulty.score > beginner.difficulty.score, true);
	assert.equal(bach.difficulty.score > romantic.difficulty.score, true);
	assert.equal(bach.difficulty.worksPerDecade > beginner.difficulty.worksPerDecade, true);
	assert.equal(beginner.difficulty.score < intermediate.difficulty.score, true);
	assert.equal(renaissance.difficulty.score > beginner.difficulty.score, true);
	assert.equal(
		renaissance.difficulty.historicalRemoteness > romantic.difficulty.historicalRemoteness,
		true
	);
}

function personaSummary(
	id: string,
	label: string,
	skill: number,
	mean: number,
	median: number,
	p95: number,
	accuracy: number,
	completionRate: number
): PersonaSummary {
	return {
		id,
		label,
		skill,
		...bucketSummary(mean, median, p95, accuracy, completionRate)
	};
}

function bucketSummary(
	mean: number,
	median = mean,
	p95 = mean,
	accuracy = 0,
	completionRate = 0
): BucketSummary {
	return {
		count: 100,
		completionRate,
		winRate: 0,
		score: stats(mean, median, p95),
		attempts: stats(0),
		accuracy: stats(accuracy),
		longestStreak: stats(0),
		completionBonusShare: stats(0),
		timeoutRate: 0,
		leaderboardRiskRate: 0
	};
}

function stats(mean: number, median = mean, p95 = mean) {
	return { count: 100, mean, median, p05: mean, p95, min: mean, max: p95 };
}

function emptyDataset(): DatasetSummary {
	return {
		path: '',
		sha256: '',
		composers: 0,
		works: 0,
		parts: 0,
		yearEligibleWorks: 0,
		yearEligibleParts: 0,
		loadMs: 0
	};
}

testProductionScoring();
testLogValidation();
testReplayConsolation();
testDeterminism();
testSkillSignal();
testSoloMultiplayerSegregation();
testStructuredWarnings();
testAutomaticTracklistDifficulty();

console.log('Scoring suite tests passed.');
