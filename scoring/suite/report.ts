import type {
	BucketSummary,
	ParameterSetSummary,
	PersonaSummary,
	SuiteReport,
	SuiteWarning,
	TargetSummary,
	TracklistSummary
} from './types';

export function printReport(report: SuiteReport): void {
	const lines: string[] = [];
	lines.push('');
	lines.push('Timeline Scoring Simulation');
	lines.push('===========================');
	lines.push(
		`Profile: ${report.profile} | Seed: ${report.seed} | Games: ${formatInt(report.gamesSimulated)} / ${formatInt(report.gamesRequested)} | Scenarios: ${formatInt(report.scenarioCount)}`
	);
	lines.push(
		`Dataset: ${formatInt(report.dataset.works)} works, ${formatInt(report.dataset.parts)} tracks (${formatInt(report.dataset.yearEligibleParts)} timeline-eligible), sha256 ${report.dataset.sha256.slice(0, 12)}`
	);
	lines.push(
		`Runtime: ${(report.performance.totalMs / 1000).toFixed(1)}s total, ${formatInt(report.performance.gamesPerSecond)} games/s, ${formatInt(report.performance.turnsPerSecond)} turns/s, ${report.performance.heapUsedMb} MB heap`
	);

	lines.push('');
	lines.push('Parameter Sets');
	const productionMean =
		report.parameterSets.find((set) => set.id === 'production')?.score.mean ??
		report.parameterSets[0]?.score.mean ??
		0;
	lines.push(
		table(
			['Set', 'Players', 'Mean', 'Delta', 'Median', 'P95', 'Complete', 'Upsets', 'Risk'],
			report.parameterSets.map((set) => [
				set.label,
				formatInt(set.count),
				formatInt(set.score.mean),
				formatDelta(set.score.mean - productionMean),
				formatInt(set.score.median),
				formatInt(set.score.p95),
				percent(set.completionRate),
				percent(set.multiplayerUpsetRate),
				percent(set.leaderboardRiskRate)
			])
		)
	);

	for (const set of report.parameterSets) {
		addPersonaSection(lines, `${set.label}: Solo Personas`, report.soloPersonasBySet[set.id] ?? []);
		addPersonaSection(
			lines,
			`${set.label}: Multiplayer Personas`,
			report.multiplayerPersonasBySet[set.id] ?? []
		);
	}

	lines.push('');
	lines.push('Production Tracklist Difficulty Model');
	lines.push(formatTracklistTable(report.tracklistsBySet.production ?? []));

	lines.push('');
	lines.push('Production Targets');
	lines.push(formatTargetTable(report.targetsBySet.production ?? []));

	lines.push('');
	lines.push('Trace Coverage');
	lines.push(
		table(
			['Turns', 'Correct', 'Timeout', 'Edge', 'Year p50', 'Year p95', 'Gap p50'],
			[
				[
					formatInt(report.coverage.turns),
					percent(report.coverage.correctRate),
					percent(report.coverage.timeoutRate),
					percent(report.coverage.edgePlacementRate),
					formatInt(report.coverage.drawnYear.median),
					formatInt(report.coverage.drawnYear.p95),
					formatInt(report.coverage.gap.median)
				]
			]
		)
	);

	lines.push('');
	lines.push('Warnings');
	if (report.warnings.length === 0) {
		lines.push('No balance warnings triggered.');
	} else {
		lines.push(formatWarningSummary(report.warnings));
		lines.push('');
		lines.push('Warning Details');
		for (const warning of report.warnings) {
			lines.push('');
			lines.push(
				`${formatSeverity(warning.severity)} ${warning.parameterSetLabel} [${formatScope(warning.scope)}]: ${warning.title}`
			);
			lines.push(`Observed: ${warning.observed}`);
			lines.push(`Expected: ${warning.expected}`);
			lines.push(`Why: ${warning.explanation}`);
			lines.push(`Try: ${warning.recommendation}`);
			lines.push(`Metrics: ${formatMetrics(warning.metrics)}`);
		}
	}

	console.log(lines.join('\n'));
}

function addPersonaSection(
	lines: string[],
	title: string,
	personas: readonly PersonaSummary[]
): void {
	if (!hasRows(personas)) return;
	lines.push('');
	lines.push(title);
	lines.push(formatPersonaTable(personas));
}

function formatWarningSummary(warnings: readonly SuiteWarning[]): string {
	return table(
		['Severity', 'Scope', 'Set', 'Check', 'Finding'],
		warnings.map((warning) => [
			formatSeverity(warning.severity),
			formatScope(warning.scope),
			warning.parameterSetLabel,
			warning.code,
			warning.title
		])
	);
}

function hasRows(personas: readonly PersonaSummary[]): boolean {
	return personas.some((persona) => persona.count > 0);
}

function formatPersonaTable(personas: readonly PersonaSummary[]): string {
	return table(
		['Persona', 'Mean', 'Median', 'P95', 'Acc', 'Complete', 'Streak', 'Win'],
		personas
			.filter((persona) => persona.count > 0)
			.map((persona) => [
				persona.label,
				formatInt(persona.score.mean),
				formatInt(persona.score.median),
				formatInt(persona.score.p95),
				percent(persona.accuracy.mean),
				percent(persona.completionRate),
				formatInt(persona.longestStreak.mean),
				percent(persona.winRate)
			])
	);
}

function formatTracklistTable(tracklists: readonly TracklistSummary[]): string {
	return table(
		[
			'Tracklist',
			'Cat',
			'Model',
			'Avg',
			'Mean',
			'Acc',
			'Complete',
			'Span',
			'W/Dec',
			'Comp',
			'Type'
		],
		tracklists
			.filter((tracklist) => tracklist.count > 0)
			.sort((a, b) => b.difficulty.score - a.difficulty.score)
			.map((tracklist) => [
				tracklist.id,
				tracklist.category,
				formatInt(tracklist.difficulty.score),
				formatDecimal(tracklist.difficulty.meanWorkScore),
				formatInt(tracklist.score.mean),
				percent(tracklist.accuracy.mean),
				percent(tracklist.completionRate),
				formatInt(tracklist.difficulty.yearSpan),
				formatDecimal(tracklist.difficulty.worksPerDecade),
				formatDecimal(tracklist.difficulty.effectiveComposers),
				formatDecimal(tracklist.difficulty.effectiveTypes)
			])
	);
}

function formatTargetTable(targets: readonly TargetSummary[]): string {
	return table(
		['Target', 'Mean', 'Median', 'P95', 'Acc', 'Complete', 'Attempts'],
		targets.map((target) => [
			String(target.target),
			formatInt(target.score.mean),
			formatInt(target.score.median),
			formatInt(target.score.p95),
			percent(target.accuracy.mean),
			percent(target.completionRate),
			formatInt(target.attempts.mean)
		])
	);
}

export function compactSignature(report: SuiteReport): unknown {
	return {
		profile: report.profile,
		seed: report.seed,
		gamesSimulated: report.gamesSimulated,
		parameterSets: report.parameterSets.map((set) => compactBucket(set)),
		coverage: {
			turns: report.coverage.turns,
			correctRate: round(report.coverage.correctRate),
			timeoutRate: round(report.coverage.timeoutRate),
			drawnYearMedian: round(report.coverage.drawnYear.median)
		}
	};
}

function compactBucket(bucket: ParameterSetSummary): unknown {
	return {
		id: bucket.id,
		count: bucket.count,
		scoreMean: round(bucket.score.mean),
		scoreMedian: round(bucket.score.median),
		completionRate: round(bucket.completionRate),
		upsetRate: round(bucket.multiplayerUpsetRate)
	};
}

function table(headers: string[], rows: string[][]): string {
	const widths = headers.map((header, index) =>
		Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
	);
	const formatRow = (row: string[]) =>
		row
			.map((cell, index) => cell.padEnd(widths[index]))
			.join('  ')
			.trimEnd();
	const divider = widths.map((width) => '-'.repeat(width)).join('  ');
	return [formatRow(headers), divider, ...rows.map(formatRow)].join('\n');
}

function formatInt(value: number): string {
	return Math.round(value).toLocaleString('en-US');
}

function percent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

function formatDecimal(value: number): string {
	return value.toFixed(1);
}

function formatDelta(value: number): string {
	const rounded = Math.round(value);
	return rounded > 0 ? `+${formatInt(rounded)}` : formatInt(rounded);
}

function formatSeverity(severity: SuiteWarning['severity']): string {
	return severity.toUpperCase();
}

function formatScope(scope: SuiteWarning['scope']): string {
	return scope === 'all' ? 'All' : scope === 'solo' ? 'Solo' : 'Multiplayer';
}

function formatMetrics(metrics: SuiteWarning['metrics']): string {
	return Object.entries(metrics)
		.map(([key, value]) => `${key}=${formatMetricValue(key, value)}`)
		.join(', ');
}

function formatMetricValue(key: string, value: number | string): string {
	if (typeof value === 'string') return value;
	const lowerKey = key.toLowerCase();
	if (
		lowerKey.includes('rate') ||
		lowerKey.includes('accuracy') ||
		lowerKey.includes('ratio') ||
		(lowerKey.includes('threshold') && value <= 1)
	) {
		return percent(value);
	}
	return formatInt(value);
}

function round(value: number): number {
	return Math.round(value * 10000) / 10000;
}

export function bucketHeadline(bucket: BucketSummary): string {
	return `${formatInt(bucket.score.mean)} mean, ${percent(bucket.completionRate)} complete`;
}
