import type { Track } from '../../src/lib/models';
import {
	calculateCompletion,
	calculateConsolationScore,
	calculateGap,
	calculateMissStreak,
	calculateTurnScore,
	type TimelineScoringParameters
} from '../../src/lib/logic/timelineScoring';
import {
	clamp,
	createSeededRandom,
	randomInt,
	randomNormal,
	type RandomSource,
	type SeededRandom
} from '../../src/lib/utils/random';
import { getPersona, TABLES } from './personas';
import { Bucket, getBucket, NumberSeries, ratio } from './stats';
import { buildWarnings, countPersonaMeanOrderViolations } from './warnings';
import type {
	GameEvaluation,
	GameTrace,
	Persona,
	PersonaSummary,
	PlayerEvaluation,
	Scenario,
	SuiteReport,
	TableDefinition,
	TracklistDifficultyProfile,
	TraceCoverageSummary,
	TraceTurn,
	TracklistSummary
} from './types';
import type { LoadedDataset, PreparedTracklistPool } from './dataset';

interface SimulationInput {
	profile: SuiteReport['profile'];
	seed: string;
	games: number;
	targets: readonly number[];
	parameterSets: readonly TimelineScoringParameters[];
	pools: readonly PreparedTracklistPool[];
	dataset: LoadedDataset['summary'];
	tableIds?: readonly string[];
	startedAt: number;
	onProgress?: (progress: SimulationProgress) => void;
}

export interface SimulationProgress {
	gamesSimulated: number;
	gamesTotal: number;
	percent: number;
	elapsedMs: number;
	gamesPerSecond: number;
	turnsPerSecond: number;
	heapUsedMb: number;
}

interface Decision {
	seconds: number | null;
	timedOut: boolean;
	insertionIndex: number | null;
	perceivedYear: number | null;
}

class WeightedIndex {
	readonly total: number;
	readonly cumulative: number[];

	constructor(readonly weights: readonly number[]) {
		let total = 0;
		this.cumulative = weights.map((weight) => {
			total += Math.max(0, weight);
			return total;
		});
		this.total = total;
	}

	pick(rng: RandomSource): number {
		if (this.weights.length === 0) return -1;
		if (this.total <= 0) return Math.floor(rng() * this.weights.length);

		const needle = rng() * this.total;
		let low = 0;
		let high = this.cumulative.length - 1;
		while (low < high) {
			const mid = Math.floor((low + high) / 2);
			if (needle <= this.cumulative[mid]) high = mid;
			else low = mid + 1;
		}
		return low;
	}
}

class PoolSampler {
	private readonly workPicker: WeightedIndex;
	private readonly partPickers: WeightedIndex[];
	private readonly usedPartGids = new Set<string>();
	private readonly usedCountByWork = new Map<number, number>();
	private readonly exhaustedWorkIndexes = new Set<number>();

	constructor(
		private readonly prepared: PreparedTracklistPool,
		private readonly rng: RandomSource
	) {
		this.workPicker = new WeightedIndex(prepared.workWeights);
		this.partPickers = prepared.partWeights.map((weights) => new WeightedIndex(weights));
	}

	sample(): Track | null {
		if (this.usedPartGids.size >= this.prepared.totalTracks) return null;

		for (let attempt = 0; attempt < 100; attempt++) {
			const workIndex = this.workPicker.pick(this.rng);
			if (workIndex < 0 || this.exhaustedWorkIndexes.has(workIndex)) continue;
			const track = this.samplePartFromWork(workIndex, false);
			if (track) return track;
		}

		return this.sampleFallback();
	}

	private samplePartFromWork(workIndex: number, filtered: boolean): Track | null {
		const candidate = this.prepared.pool.works[workIndex];
		if (!candidate) return null;

		const partPicker = this.partPickers[workIndex];
		for (let attempt = 0; attempt < 30; attempt++) {
			const partIndex = filtered
				? this.pickAvailablePartIndex(workIndex)
				: partPicker.pick(this.rng);
			const part = candidate.parts[partIndex];
			if (!part || this.usedPartGids.has(part.gid)) continue;
			this.usedPartGids.add(part.gid);
			const usedCount = (this.usedCountByWork.get(workIndex) ?? 0) + 1;
			this.usedCountByWork.set(workIndex, usedCount);
			if (usedCount >= candidate.parts.length) this.exhaustedWorkIndexes.add(workIndex);
			return { composer: candidate.work.composer, work: candidate.work, part };
		}

		return null;
	}

	private sampleFallback(): Track | null {
		const availableWorkIndexes: number[] = [];
		const weights: number[] = [];
		for (let i = 0; i < this.prepared.pool.works.length; i++) {
			if (this.exhaustedWorkIndexes.has(i)) continue;
			availableWorkIndexes.push(i);
			weights.push(this.prepared.workWeights[i]);
		}
		if (availableWorkIndexes.length === 0) return null;

		const localIndex = new WeightedIndex(weights).pick(this.rng);
		const workIndex = availableWorkIndexes[localIndex];
		return this.samplePartFromWork(workIndex, true);
	}

	private pickAvailablePartIndex(workIndex: number): number {
		const candidate = this.prepared.pool.works[workIndex];
		const availableIndexes: number[] = [];
		const weights: number[] = [];
		for (let i = 0; i < candidate.parts.length; i++) {
			if (this.usedPartGids.has(candidate.parts[i].gid)) continue;
			availableIndexes.push(i);
			weights.push(this.prepared.partWeights[workIndex][i]);
		}
		const localIndex = new WeightedIndex(weights).pick(this.rng);
		return availableIndexes[localIndex] ?? 0;
	}
}

export function buildScenarios(
	pools: readonly PreparedTracklistPool[],
	targets: readonly number[],
	tableIds: readonly string[] = TABLES.map((table) => table.id)
): Scenario[] {
	return pools.flatMap((pool) =>
		targets.flatMap((target) =>
			tableIds.map((tableId) => ({
				id: `${pool.definition.id}:target-${target}:${tableId}`,
				tracklistId: pool.definition.id,
				target,
				tableId
			}))
		)
	);
}

export function runSimulationSuite(input: SimulationInput): SuiteReport {
	const simulationStartedAt = performance.now();
	const rootRng = createSeededRandom(input.seed);
	const poolById = new Map(input.pools.map((pool) => [pool.definition.id, pool]));
	const tableById = new Map(TABLES.map((table) => [table.id, table]));
	const scenarios = buildScenarios(input.pools, input.targets, input.tableIds);
	if (scenarios.length === 0) throw new Error('No simulation scenarios were generated');

	const overall = new Map<string, Bucket>();
	const personaBuckets = new Map<string, Bucket>();
	const soloPersonaBuckets = new Map<string, Bucket>();
	const multiplayerPersonaBuckets = new Map<string, Bucket>();
	const tracklistBuckets = new Map<string, Bucket>();
	const targetBuckets = new Map<string, Bucket>();
	const multiplayerGamesBySet = new Map<string, number>();
	const upsetsBySet = new Map<string, number>();
	const coverage = createCoverageAccumulator();
	const progressEveryGames = Math.max(1, Math.floor(input.games / 20));
	let nextProgressAt = progressEveryGames;
	let lastProgressGames = 0;

	let gamesSimulated = 0;
	for (let gameIndex = 0; gameIndex < input.games; gameIndex++) {
		const scenario = scenarios[gameIndex % scenarios.length];
		const pool = poolById.get(scenario.tracklistId);
		const table = tableById.get(scenario.tableId);
		if (!pool || !table) continue;

		const trace = generateTrace(scenario, table, pool, rootRng.fork(gameIndex, scenario.id));
		addCoverage(coverage, trace);
		gamesSimulated++;

		for (const parameterSet of input.parameterSets) {
			const evaluation = evaluateTrace(trace, parameterSet);
			const winnerSet = new Set(evaluation.winnerIndexes);
			const isMultiplayer = evaluation.players.length > 1;
			if (isMultiplayer) {
				multiplayerGamesBySet.set(
					parameterSet.id,
					(multiplayerGamesBySet.get(parameterSet.id) ?? 0) + 1
				);
				if (isUpset(evaluation)) {
					upsetsBySet.set(parameterSet.id, (upsetsBySet.get(parameterSet.id) ?? 0) + 1);
				}
			}

			for (const player of evaluation.players) {
				const won = winnerSet.has(player.playerIndex);
				const bucketInput = { ...player, target: scenario.target, won };
				getBucket(overall, parameterSet.id).add(bucketInput);
				getBucket(personaBuckets, `${parameterSet.id}:${player.personaId}`).add(bucketInput);
				getBucket(
					isMultiplayer ? multiplayerPersonaBuckets : soloPersonaBuckets,
					`${parameterSet.id}:${player.personaId}`
				).add(bucketInput);
				getBucket(tracklistBuckets, `${parameterSet.id}:${scenario.tracklistId}`).add(bucketInput);
				getBucket(targetBuckets, `${parameterSet.id}:${scenario.target}`).add(bucketInput);
			}
		}

		if (input.onProgress && gamesSimulated >= nextProgressAt) {
			input.onProgress(
				buildProgress(gamesSimulated, input.games, simulationStartedAt, coverage.turns)
			);
			lastProgressGames = gamesSimulated;
			nextProgressAt += progressEveryGames;
		}
	}

	if (input.onProgress && gamesSimulated !== lastProgressGames) {
		input.onProgress(
			buildProgress(gamesSimulated, input.games, simulationStartedAt, coverage.turns)
		);
	}

	const simulationMs = performance.now() - simulationStartedAt;
	const coverageSummary = summarizeCoverage(coverage);
	const parameterSets = input.parameterSets.map((parameterSet) => ({
		id: parameterSet.id,
		label: parameterSet.label,
		...getBucket(overall, parameterSet.id).summary(),
		multiplayerUpsetRate: ratio(
			upsetsBySet.get(parameterSet.id) ?? 0,
			multiplayerGamesBySet.get(parameterSet.id) ?? 0
		),
		skillOrderViolations: countPersonaMeanOrderViolations(
			summarizePersonas(parameterSet.id, soloPersonaBuckets)
		)
	}));

	const report: SuiteReport = {
		generatedAt: new Date().toISOString(),
		profile: input.profile,
		seed: input.seed,
		gamesRequested: input.games,
		gamesSimulated,
		scenarioCount: scenarios.length,
		dataset: input.dataset,
		tracklists: input.pools.map((pool) => pool.summary),
		parameterSets,
		personasBySet: Object.fromEntries(
			input.parameterSets.map((parameterSet) => [
				parameterSet.id,
				summarizePersonas(parameterSet.id, personaBuckets)
			])
		),
		soloPersonasBySet: Object.fromEntries(
			input.parameterSets.map((parameterSet) => [
				parameterSet.id,
				summarizePersonas(parameterSet.id, soloPersonaBuckets)
			])
		),
		multiplayerPersonasBySet: Object.fromEntries(
			input.parameterSets.map((parameterSet) => [
				parameterSet.id,
				summarizePersonas(parameterSet.id, multiplayerPersonaBuckets)
			])
		),
		tracklistsBySet: Object.fromEntries(
			input.parameterSets.map((parameterSet) => [
				parameterSet.id,
				summarizeTracklists(parameterSet.id, input.pools, tracklistBuckets)
			])
		),
		targetsBySet: Object.fromEntries(
			input.parameterSets.map((parameterSet) => [
				parameterSet.id,
				input.targets.map((target) => ({
					target,
					...getBucket(targetBuckets, `${parameterSet.id}:${target}`).summary()
				}))
			])
		),
		coverage: coverageSummary,
		warnings: [],
		performance: {
			totalMs: Math.round(performance.now() - input.startedAt),
			simulationMs: Math.round(simulationMs),
			gamesPerSecond: gamesSimulated / Math.max(0.001, simulationMs / 1000),
			turnsPerSecond: coverageSummary.turns / Math.max(0.001, simulationMs / 1000),
			heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
		}
	};
	report.warnings = buildWarnings(report);
	return report;
}

function buildProgress(
	gamesSimulated: number,
	gamesTotal: number,
	startedAt: number,
	turns: number
): SimulationProgress {
	const elapsedMs = performance.now() - startedAt;
	return {
		gamesSimulated,
		gamesTotal,
		percent: gamesTotal > 0 ? gamesSimulated / gamesTotal : 0,
		elapsedMs,
		gamesPerSecond: gamesSimulated / Math.max(0.001, elapsedMs / 1000),
		turnsPerSecond: turns / Math.max(0.001, elapsedMs / 1000),
		heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
	};
}

export function generateTrace(
	scenario: Scenario,
	table: TableDefinition,
	pool: PreparedTracklistPool,
	seededRng: SeededRandom
): GameTrace {
	const rng = seededRng.next;
	const sampler = new PoolSampler(pool, rng);
	const timelines: number[][] = table.personaIds.map(() => []);
	const initialYears: number[] = [];
	const initialPartGids: string[] = [];
	const turns: TraceTurn[] = [];
	let tracksExhausted = false;
	let turnCapReached = false;

	for (let playerIndex = 0; playerIndex < table.personaIds.length; playerIndex++) {
		const track = sampler.sample();
		if (!track) {
			tracksExhausted = true;
			break;
		}
		const year = getTrackYear(track);
		timelines[playerIndex].push(year);
		initialYears.push(year);
		initialPartGids.push(track.part.gid);
	}

	let activePlayerIndex = 0;
	let endgameActive = false;
	const turnCap = Math.max(40, scenario.target * table.personaIds.length * 8);
	while (!tracksExhausted && turns.length < turnCap) {
		const track = sampler.sample();
		if (!track) {
			tracksExhausted = true;
			break;
		}

		const persona = getPersona(table.personaIds[activePlayerIndex]);
		const timeline = timelines[activePlayerIndex];
		const decision = decidePlacement(
			persona,
			track,
			timeline,
			scenario.target,
			pool.difficulty,
			rng
		);
		const turn = buildTraceTurn(activePlayerIndex, persona, track, timeline, decision);
		turns.push(turn);

		if (turn.correct && turn.insertionIndex !== null) {
			timeline.splice(turn.insertionIndex, 0, turn.year);
			if (timeline.length >= scenario.target) endgameActive = true;
		}

		activePlayerIndex = (activePlayerIndex + 1) % table.personaIds.length;
		if (endgameActive && (table.personaIds.length === 1 || activePlayerIndex === 0)) break;
	}

	if (!tracksExhausted && turns.length >= turnCap) turnCapReached = true;

	return {
		scenario,
		table,
		initialYears,
		initialPartGids,
		turns,
		tracksExhausted,
		turnCapReached
	};
}

export function evaluateTrace(
	trace: GameTrace,
	parameterSet: TimelineScoringParameters
): GameEvaluation {
	const players = trace.table.personaIds.map((personaId, playerIndex) => ({
		playerIndex,
		personaId,
		score: 0,
		attempts: 0,
		correctPlacements: 0,
		currentStreak: 0,
		absoluteStreak: 0,
		longestStreak: 0,
		reachedTarget: false,
		completionBonus: 0,
		timelineLength: trace.initialYears[playerIndex] == null ? 0 : 1,
		seconds: [] as number[],
		timeouts: 0
	}));

	for (const turn of trace.turns) {
		const player = players[turn.playerIndex];
		if (!player) continue;
		player.attempts++;
		if (typeof turn.seconds === 'number') player.seconds.push(turn.seconds);
		if (turn.timedOut) player.timeouts++;

		if (turn.correct && !turn.timedOut) {
			player.correctPlacements++;
			player.currentStreak++;
			player.absoluteStreak++;
			player.longestStreak = Math.max(player.longestStreak, player.absoluteStreak);

			const gap = calculateGap(turn.leftYear, turn.rightYear, parameterSet);
			const breakdown = calculateTurnScore(
				{
					gap,
					seconds: turn.seconds ?? parameterSet.speedWindowSeconds,
					streak: player.currentStreak,
					isEdgePlacement: turn.isEdgePlacement
				},
				parameterSet
			);
			player.score += breakdown.score;
			player.timelineLength++;

			if (player.timelineLength >= trace.scenario.target && !player.reachedTarget) {
				const completion = calculateCompletion(
					trace.scenario.target,
					player.attempts,
					parameterSet
				);
				player.completionBonus = completion;
				player.score += completion;
				player.reachedTarget = true;
			}
		} else {
			player.currentStreak = calculateMissStreak(player.currentStreak, parameterSet);
			player.absoluteStreak = 0;
			if (!turn.timedOut) {
				const consolation = calculateConsolationScore(
					turn.year,
					turn.correctLeftYear,
					turn.correctRightYear,
					trace.scenario.target,
					player.attempts,
					parameterSet
				);
				player.score += consolation.consolation;
			}
		}
	}

	const evaluatedPlayers: PlayerEvaluation[] = players.map((player) => ({
		playerIndex: player.playerIndex,
		personaId: player.personaId,
		score: Math.round(player.score),
		attempts: player.attempts,
		correctPlacements: player.correctPlacements,
		accuracy: player.attempts > 0 ? player.correctPlacements / player.attempts : 0,
		reachedTarget: player.reachedTarget,
		completionBonus: Math.round(player.completionBonus),
		longestStreak: player.longestStreak,
		averageSeconds:
			player.seconds.length > 0
				? player.seconds.reduce((sum, seconds) => sum + seconds, 0) / player.seconds.length
				: null,
		timeouts: player.timeouts
	}));

	const highScore = Math.max(...evaluatedPlayers.map((player) => player.score));
	const winnerIndexes =
		highScore > 0
			? evaluatedPlayers
					.filter((player) => player.score === highScore)
					.map((player) => player.playerIndex)
			: [];

	return { parameterSet, trace, players: evaluatedPlayers, winnerIndexes };
}

function decidePlacement(
	persona: Persona,
	track: Track,
	timeline: readonly number[],
	target: number,
	difficulty: TracklistDifficultyProfile,
	rng: RandomSource
): Decision {
	const year = getTrackYear(track);
	if (rng() < persona.timeoutRate) {
		return { seconds: null, timedOut: true, insertionIndex: null, perceivedYear: null };
	}

	if (persona.behavior === 'farmer') {
		const correctIndex = findInsertionIndexForYear(year, timeline);
		const wrongIndexes = [correctIndex - 1, correctIndex + 1].filter(
			(index) => index >= 0 && index <= timeline.length && !isCorrectIndex(year, timeline, index)
		);
		const insertionIndex =
			wrongIndexes.length > 0
				? wrongIndexes[randomInt(rng, 0, wrongIndexes.length - 1)]
				: correctIndex;
		return {
			seconds: clamp(randomNormal(rng, persona.baseSeconds, persona.speedSigma), 12, 28),
			timedOut: false,
			insertionIndex,
			perceivedYear: year
		};
	}

	const familiarity = clamp((track.work.score - 1.4) / (6.55 - 1.4), 0, 1);
	const densityPressure = 1 + Math.min(0.4, timeline.length / Math.max(1, target) / 5);
	const ambiguity = calculatePersonaAmbiguity(persona, difficulty);
	const sigma =
		persona.yearSigma *
		(1 + (1 - familiarity) * persona.obscurityPenalty) *
		densityPressure *
		(1 + ambiguity * 1.45);
	const randomPlacement = rng() < clamp(persona.randomPlacementRate + ambiguity * 0.1, 0, 0.95);
	let perceivedYear = year + randomNormal(rng, 0, sigma);
	let insertionIndex = randomPlacement
		? randomInt(rng, 0, timeline.length)
		: findInsertionIndexForYear(perceivedYear, timeline);

	const slipRate = clamp(persona.slipRate * (1 + ambiguity * 0.75), 0, 0.75);
	if (rng() < slipRate && timeline.length > 0) {
		insertionIndex = clamp(insertionIndex + (rng() < 0.5 ? -1 : 1), 0, timeline.length);
		perceivedYear =
			timeline[Math.max(0, Math.min(timeline.length - 1, insertionIndex))] ?? perceivedYear;
	}

	const confidence =
		sigma > 0 ? clamp(1 - Math.abs(perceivedYear - year) / Math.max(1, sigma * 2), 0, 1) : 1;
	const seconds = clamp(
		randomNormal(
			rng,
			persona.baseSeconds -
				confidence * persona.confidenceSeconds +
				timeline.length * 0.12 +
				ambiguity * 2.5,
			persona.speedSigma
		),
		1,
		35
	);

	return { seconds, timedOut: false, insertionIndex, perceivedYear };
}

function calculatePersonaAmbiguity(
	persona: Persona,
	difficulty: TracklistDifficultyProfile
): number {
	const skillShield = clamp(persona.skill / 8, 0, 0.75);
	return difficulty.ambiguity * (1 - skillShield * 0.55);
}

function buildTraceTurn(
	playerIndex: number,
	persona: Persona,
	track: Track,
	timeline: readonly number[],
	decision: Decision
): TraceTurn {
	const year = getTrackYear(track);
	const insertionIndex = decision.insertionIndex;
	const timedOut = decision.timedOut || insertionIndex == null;
	const correct = !timedOut && isCorrectIndex(year, timeline, insertionIndex);
	const leftYear =
		insertionIndex !== null && insertionIndex > 0 ? timeline[insertionIndex - 1] : null;
	const rightYear =
		insertionIndex !== null && insertionIndex < timeline.length ? timeline[insertionIndex] : null;
	const correctIndex = findInsertionIndexForYear(year, timeline);
	const correctLeftYear = correctIndex > 0 ? timeline[correctIndex - 1] : null;
	const correctRightYear = correctIndex < timeline.length ? timeline[correctIndex] : null;

	return {
		playerIndex,
		personaId: persona.id,
		workGid: track.work.gid,
		partGid: track.part.gid,
		year,
		workScore: track.work.score,
		partScore: track.part.score,
		workType: track.work.type,
		seconds: decision.seconds,
		timedOut,
		correct,
		insertionIndex,
		leftYear,
		rightYear,
		correctLeftYear,
		correctRightYear,
		isEdgePlacement: insertionIndex === 0 || insertionIndex === timeline.length
	};
}

function findInsertionIndexForYear(year: number, timeline: readonly number[]): number {
	let index = 0;
	while (index < timeline.length && timeline[index] <= year) index++;
	return index;
}

function isCorrectIndex(year: number, timeline: readonly number[], index: number): boolean {
	const previous = index > 0 ? timeline[index - 1] : -Infinity;
	const next = index < timeline.length ? timeline[index] : Infinity;
	return year >= previous && year <= next;
}

function getTrackYear(track: Track): number {
	return track.work.end_year ?? track.work.begin_year ?? 0;
}

function isUpset(evaluation: GameEvaluation): boolean {
	if (evaluation.players.length <= 1 || evaluation.winnerIndexes.length === 0) return false;
	const highestSkill = Math.max(
		...evaluation.players.map((player) => getPersona(player.personaId).skill)
	);
	return evaluation.winnerIndexes.some(
		(index) => getPersona(evaluation.players[index].personaId).skill < highestSkill
	);
}

function summarizePersonas(setId: string, buckets: Map<string, Bucket>): PersonaSummary[] {
	return [...new Set(TABLES.flatMap((table) => table.personaIds))]
		.map(getPersona)
		.sort((a, b) => a.skill - b.skill)
		.map((persona) => ({
			id: persona.id,
			label: persona.label,
			skill: persona.skill,
			...getBucket(buckets, `${setId}:${persona.id}`).summary()
		}));
}

function summarizeTracklists(
	setId: string,
	pools: readonly PreparedTracklistPool[],
	buckets: Map<string, Bucket>
): TracklistSummary[] {
	return pools.map((pool) => ({
		id: pool.definition.id,
		label: pool.definition.label,
		category: pool.definition.category,
		difficulty: pool.difficulty,
		...getBucket(buckets, `${setId}:${pool.definition.id}`).summary()
	}));
}

interface CoverageAccumulator {
	turns: number;
	correct: number;
	timeouts: number;
	edgePlacements: number;
	yearError: NumberSeries;
	gap: NumberSeries;
	drawnYear: NumberSeries;
}

function createCoverageAccumulator(): CoverageAccumulator {
	return {
		turns: 0,
		correct: 0,
		timeouts: 0,
		edgePlacements: 0,
		yearError: new NumberSeries(),
		gap: new NumberSeries(),
		drawnYear: new NumberSeries()
	};
}

function addCoverage(coverage: CoverageAccumulator, trace: GameTrace): void {
	for (const turn of trace.turns) {
		coverage.turns++;
		if (turn.correct) coverage.correct++;
		if (turn.timedOut) coverage.timeouts++;
		if (turn.isEdgePlacement) coverage.edgePlacements++;
		coverage.drawnYear.add(turn.year);
		if (turn.insertionIndex !== null) {
			const missedBoundary = Math.min(
				Math.abs(turn.year - (turn.correctLeftYear ?? turn.year)),
				Math.abs(turn.year - (turn.correctRightYear ?? turn.year))
			);
			coverage.yearError.add(turn.correct ? 0 : missedBoundary);
			if (turn.leftYear !== null && turn.rightYear !== null) {
				coverage.gap.add(turn.rightYear - turn.leftYear);
			}
		}
	}
}

function summarizeCoverage(coverage: CoverageAccumulator): TraceCoverageSummary {
	return {
		turns: coverage.turns,
		correctRate: ratio(coverage.correct, coverage.turns),
		timeoutRate: ratio(coverage.timeouts, coverage.turns),
		edgePlacementRate: ratio(coverage.edgePlacements, coverage.turns),
		yearError: coverage.yearError.summary(),
		gap: coverage.gap.summary(),
		drawnYear: coverage.drawnYear.summary()
	};
}
