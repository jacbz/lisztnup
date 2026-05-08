import type { TracklistConfig } from '../../src/lib/types';
import type { TimelineScoringParameters } from '../../src/lib/logic/timelineScoring';

export type ProfileName = 'quick' | 'balanced' | 'heavy';

export interface RunOptions {
	profile: ProfileName;
	games: number;
	seed: string;
	parameterSetIds: string[];
	tracklistIds: string[];
	targets: number[];
	tableIds: string[];
	jsonOut: string | null;
}

export interface SuiteTracklist {
	kind: 'default';
	id: string;
	label: string;
	category: 'difficulty' | 'categories' | 'composers' | 'eras' | 'countries';
	config: TracklistConfig;
}

export interface Persona {
	id: string;
	label: string;
	skill: number;
	yearSigma: number;
	obscurityPenalty: number;
	randomPlacementRate: number;
	slipRate: number;
	timeoutRate: number;
	baseSeconds: number;
	speedSigma: number;
	confidenceSeconds: number;
	behavior: 'normal' | 'farmer';
}

export interface TableDefinition {
	id: string;
	label: string;
	personaIds: string[];
}

export interface Scenario {
	id: string;
	tracklistId: string;
	target: number;
	tableId: string;
}

export interface DatasetSummary {
	path: string;
	sha256: string;
	composers: number;
	works: number;
	parts: number;
	yearEligibleWorks: number;
	yearEligibleParts: number;
	loadMs: number;
}

export interface TracklistDifficultyProfile {
	score: number;
	ambiguity: number;
	yearSpan: number;
	medianNearestYearGap: number;
	worksPerDecade: number;
	meanYear: number;
	effectiveComposers: number;
	effectiveTypes: number;
	meanWorkScore: number;
	yearCrowding: number;
	yearNarrowness: number;
	composerHomogeneity: number;
	typeHomogeneity: number;
	obscurity: number;
	historicalRemoteness: number;
}

export interface TracklistPoolSummary {
	id: string;
	label: string;
	category: SuiteTracklist['category'];
	composers: number;
	works: number;
	tracks: number;
	difficulty: TracklistDifficultyProfile;
}

export interface TraceTurn {
	playerIndex: number;
	personaId: string;
	workGid: string;
	partGid: string;
	year: number;
	workScore: number;
	partScore: number;
	workType: string;
	seconds: number | null;
	timedOut: boolean;
	correct: boolean;
	insertionIndex: number | null;
	leftYear: number | null;
	rightYear: number | null;
	correctLeftYear: number | null;
	correctRightYear: number | null;
	isEdgePlacement: boolean;
}

export interface GameTrace {
	scenario: Scenario;
	table: TableDefinition;
	initialYears: number[];
	initialPartGids: string[];
	turns: TraceTurn[];
	tracksExhausted: boolean;
	turnCapReached: boolean;
}

export interface PlayerEvaluation {
	playerIndex: number;
	personaId: string;
	score: number;
	attempts: number;
	correctPlacements: number;
	accuracy: number;
	reachedTarget: boolean;
	completionBonus: number;
	longestStreak: number;
	averageSeconds: number | null;
	timeouts: number;
}

export interface GameEvaluation {
	parameterSet: TimelineScoringParameters;
	trace: GameTrace;
	players: PlayerEvaluation[];
	winnerIndexes: number[];
}

export interface SummaryStats {
	count: number;
	mean: number;
	median: number;
	p05: number;
	p95: number;
	min: number;
	max: number;
}

export interface BucketSummary {
	count: number;
	completionRate: number;
	winRate: number;
	score: SummaryStats;
	attempts: SummaryStats;
	accuracy: SummaryStats;
	longestStreak: SummaryStats;
	completionBonusShare: SummaryStats;
	timeoutRate: number;
	leaderboardRiskRate: number;
}

export interface ParameterSetSummary extends BucketSummary {
	id: string;
	label: string;
	multiplayerUpsetRate: number;
	skillOrderViolations: number;
}

export interface PersonaSummary extends BucketSummary {
	id: string;
	label: string;
	skill: number;
}

export interface TracklistSummary extends BucketSummary {
	id: string;
	label: string;
	category: SuiteTracklist['category'];
	difficulty: TracklistDifficultyProfile;
}

export interface TargetSummary extends BucketSummary {
	target: number;
}

export type SuiteWarningSeverity = 'warn' | 'critical';
export type SuiteWarningScope = 'all' | 'solo' | 'multiplayer';

export type SuiteWarningCode =
	| 'persona-ordering'
	| 'leaderboard-risk'
	| 'random-tail-overlap'
	| 'farmer-mean';

export interface SuiteWarning {
	code: SuiteWarningCode;
	severity: SuiteWarningSeverity;
	scope: SuiteWarningScope;
	parameterSetId: string;
	parameterSetLabel: string;
	title: string;
	observed: string;
	expected: string;
	explanation: string;
	recommendation: string;
	metrics: Record<string, number | string>;
}

export interface TraceCoverageSummary {
	turns: number;
	correctRate: number;
	timeoutRate: number;
	edgePlacementRate: number;
	yearError: SummaryStats;
	gap: SummaryStats;
	drawnYear: SummaryStats;
}

export interface SuiteReport {
	generatedAt: string;
	profile: ProfileName;
	seed: string;
	gamesRequested: number;
	gamesSimulated: number;
	scenarioCount: number;
	dataset: DatasetSummary;
	tracklists: TracklistPoolSummary[];
	parameterSets: ParameterSetSummary[];
	personasBySet: Record<string, PersonaSummary[]>;
	soloPersonasBySet: Record<string, PersonaSummary[]>;
	multiplayerPersonasBySet: Record<string, PersonaSummary[]>;
	tracklistsBySet: Record<string, TracklistSummary[]>;
	targetsBySet: Record<string, TargetSummary[]>;
	coverage: TraceCoverageSummary;
	warnings: SuiteWarning[];
	performance: {
		totalMs: number;
		simulationMs: number;
		gamesPerSecond: number;
		turnsPerSecond: number;
		heapUsedMb: number;
	};
}
