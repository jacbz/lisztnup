import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { GameCatalog, type RawLisztnupData } from '../src/lib/models';
import { replayTimelineLog } from '../src/lib/logic/timelineReplayUtils';
import type { TimelineReplayLog } from '../src/lib/types/timelineReplay';
import type { Tracklist, TracklistConfig } from '../src/lib/types';
import { TracklistGenerator } from '../src/lib/services/TracklistGenerator';
import * as Configs from '../src/lib/data/tracklistConfigs';

interface TimelineScoreRow {
	id: number;
	score: number;
	target: number;
	log: string;
	timestamp: string;
	player_name: string | null;
	country: string | null;
	tracklist_id: string;
}

function hasReplayMetadata(log: unknown): log is TimelineReplayLog {
	if (!log || typeof log !== 'object') return false;
	const candidate = log as Partial<TimelineReplayLog>;
	return (
		candidate.v === 1 &&
		typeof candidate.initial === 'string' &&
		candidate.initial.length > 0 &&
		typeof candidate.initialYear === 'number' &&
		Number.isFinite(candidate.initialYear) &&
		typeof candidate.tracklistMin === 'number' &&
		Number.isFinite(candidate.tracklistMin) &&
		typeof candidate.tracklistMax === 'number' &&
		Number.isFinite(candidate.tracklistMax) &&
		Array.isArray(candidate.turns) &&
		candidate.turns.length > 0
	);
}

function formatUnknownError(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return String(error);
}

function formatTimestamp(timestamp: string): string {
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? timestamp : date.toISOString();
}

function getTurnIndexFromError(error: unknown): number | undefined {
	const message = error instanceof Error ? error.message : String(error);
	const match = message.match(/\[Turn (\d+):/);
	if (!match) return undefined;
	const turnNum = Number(match[1]);
	return Number.isInteger(turnNum) && turnNum > 0 ? turnNum - 1 : undefined;
}

function formatReplayTurn(log: TimelineReplayLog, turnIndex: number): string {
	const turn = log.turns[turnIndex];
	if (!turn) return `turn ${turnIndex + 1}: <missing>`;
	return [
		`turn ${turnIndex + 1}`,
		`part=${turn.part}`,
		`index=${turn.index ?? 'null'}`,
		`ok=${turn.ok}`,
		`year=${turn.year ?? '<missing>'}`,
		`points=${turn.points}`,
		`seconds=${turn.seconds ?? 'null'}`
	].join(' ');
}

function buildReplayErrorContext(
	row: TimelineScoreRow,
	log: TimelineReplayLog,
	error: unknown
): string {
	const turnIndex = getTurnIndexFromError(error);
	const date = formatTimestamp(row.timestamp);
	const player = row.player_name ?? 'Anonymous';
	const country = row.country ?? '??';
	const lines = [
		`score id=${row.id}`,
		`timestamp=${date}`,
		`player=${player} country=${country}`,
		`tracklist=${row.tracklist_id} target=${row.target} storedScore=${row.score}`,
		`initial=${log.initial} initialYear=${log.initialYear}`,
		`tracklistBounds=${log.tracklistMin}..${log.tracklistMax}`,
		`turnCount=${log.turns.length}`
	];

	if (turnIndex !== undefined) {
		const start = Math.max(0, turnIndex - 2);
		const end = Math.min(log.turns.length, turnIndex + 3);
		lines.push(
			`suspectTurn=${formatReplayTurn(log, turnIndex)}`,
			`nearbyTurns=${Array.from({ length: end - start }, (_, offset) => formatReplayTurn(log, start + offset)).join(' | ')}`
		);
	}

	return lines.join('\n');
}

async function main() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	const isLocal = process.argv.includes('--local');

	console.log(`Exporting timeline_scores from ${isLocal ? 'local' : 'remote'} D1...`);
	const tempSqlPath = 'temp-scores.sql';
	const tempJsonPath = 'temp-scores.json';
	const updatesSqlPath = 'updates.sql';

	try {
		// 1. Export from D1
		execSync(
			`npx wrangler d1 export lisztnup-analytics ${isLocal ? '--local' : '--remote'} --output=${tempSqlPath} --table timeline_scores --skip-confirmation`,
			{ stdio: 'inherit' }
		);

		console.log('Loading lisztnup dataset...');
		const dataPath = path.join(process.cwd(), 'static/lisztnup.json');
		const rawData = fs.readFileSync(dataPath, 'utf-8');
		const data = GameCatalog.fromRaw(JSON.parse(rawData) as RawLisztnupData);

		console.log('Pre-calculating tracklist bounds...');
		const tracklistBounds = new Map<string, { min: number; max: number }>();

		// Recreate the tracklist definitions without importing the UI-heavy DEFAULT_TRACKLISTS
		// (which would try to load SVG files via Vite/esbuild, failing in a raw Node environment).
		const tracklists: { id: string; config: TracklistConfig }[] = [
			{ id: 'beginner', config: Configs.BEGINNER_CONFIG },
			{ id: 'intermediate', config: Configs.INTERMEDIATE_CONFIG },
			{ id: 'skilled', config: Configs.SKILLED_CONFIG },
			{ id: 'advanced', config: Configs.ADVANCED_CONFIG },
			{ id: 'expert', config: Configs.EXPERT_CONFIG },
			{ id: 'virtuoso', config: Configs.VIRTUOSO_CONFIG },
			{ id: 'cadenza', config: Configs.CADENZA_CONFIG },
			{ id: 'obscure', config: Configs.OBSCURE_CONFIG },
			{ id: 'piano', config: Configs.PIANO_CONFIG },
			{ id: 'orchestral', config: Configs.ORCHESTRAL_CONFIG },
			{ id: 'chamber', config: Configs.CHAMBER_CONFIG },
			{ id: 'ballet', config: Configs.BALLET_CONFIG },
			{ id: 'opera', config: Configs.OPERA_CONFIG },
			{ id: 'concerto', config: Configs.CONCERTO_CONFIG },
			{ id: 'pianoconcerto', config: Configs.PIANOCONCERTO_CONFIG },
			{ id: 'violinconcerto', config: Configs.VIOLINCONCERTO_CONFIG },
			{ id: 'celloconcerto', config: Configs.CELLOCONCERTO_CONFIG },
			{ id: 'woodwindconcerto', config: Configs.WOODWINDCONCERTO_CONFIG },
			{ id: 'bach', config: Configs.BACH_CONFIG },
			{ id: 'beethoven', config: Configs.BEETHOVEN_CONFIG },
			{ id: 'mozart', config: Configs.MOZART_CONFIG },
			{ id: 'liszt', config: Configs.LISZT_CONFIG },
			{ id: 'chopin', config: Configs.CHOPIN_CONFIG },
			{ id: 'tchaikovsky', config: Configs.TCHAIKOVSKY_CONFIG },
			{ id: 'vivaldi', config: Configs.VIVALDI_CONFIG },
			{ id: 'femalecomposers', config: Configs.FEMALE_COMPOSERS_CONFIG },
			{ id: 'renaissance', config: Configs.RENAISSANCE_CONFIG },
			{ id: 'baroque', config: Configs.BAROQUE_CONFIG },
			{ id: 'classical', config: Configs.CLASSICAL_CONFIG },
			{ id: 'romantic', config: Configs.ROMANTIC_CONFIG },
			{ id: 'modernism', config: Configs.MODERNISM_CONFIG },
			{ id: 'contemporary', config: Configs.CONTEMPORARY_CONFIG },
			{ id: 'germany', config: Configs.GERMANY_CONFIG },
			{ id: 'italy', config: Configs.ITALY_CONFIG },
			{ id: 'france', config: Configs.FRANCE_CONFIG },
			{ id: 'russia', config: Configs.RUSSIA_CONFIG },
			{ id: 'uk', config: Configs.UK_CONFIG },
			{ id: 'usa', config: Configs.USA_CONFIG },
			{ id: 'spain', config: Configs.SPAIN_CONFIG },
			{ id: 'scandinavia', config: Configs.SCANDINAVIA_CONFIG }
		];

		for (const tl of tracklists) {
			const generator = new TracklistGenerator(data, tl as Tracklist);
			const bounds = generator.getScoringYearBounds();
			tracklistBounds.set(tl.id, bounds);
		}

		const trackLookup = (partGid: string) => {
			for (const work of data.works) {
				for (const part of work.parts) {
					if (part.gid === partGid) {
						return { work, part };
					}
				}
			}
			return undefined;
		};

		console.log('Converting exported SQL to JSON...');
		execSync(
			`sqlite3 :memory: ".read ${tempSqlPath}" ".mode json" "SELECT id, score, target, log, timestamp, player_name, country, tracklist_id FROM timeline_scores WHERE log IS NOT NULL ORDER BY timestamp ASC" > ${tempJsonPath}`
		);

		const scoresRaw = fs.readFileSync(tempJsonPath, 'utf-8');
		const scores = JSON.parse(scoresRaw) as TimelineScoreRow[];

		console.log(`Processing ${scores.length} scores chronologically...`);

		const updates: {
			id: number;
			oldScore: number;
			newScore: number;
			log: string;
			timestamp: string;
			player_name: string | null;
			tracklist_id: string;
			target: number;
		}[] = [];
		let totalOldScore = 0;
		let totalNewScore = 0;

		for (const row of scores) {
			const oldScore = row.score;
			let oldLog: TimelineReplayLog;
			try {
				oldLog = JSON.parse(row.log);
			} catch {
				console.warn(`[WARN] Skipping ID ${row.id}: invalid JSON log.`);
				continue;
			}
			if (!hasReplayMetadata(oldLog)) {
				console.warn(`[WARN] Skipping ID ${row.id}: incomplete replay metadata.`);
				continue;
			}

			const warnings: string[] = [];
			const bounds = tracklistBounds.get(row.tracklist_id);
			const replayMin = oldLog.tracklistMin;
			const replayMax = oldLog.tracklistMax;

			if (bounds && oldLog.tracklistMin !== bounds.min) {
				warnings.push(
					`[Meta] tracklistMin mismatch: log ${oldLog.tracklistMin}, dataset ${bounds.min}`
				);
			}
			if (bounds && oldLog.tracklistMax !== bounds.max) {
				warnings.push(
					`[Meta] tracklistMax mismatch: log ${oldLog.tracklistMax}, dataset ${bounds.max}`
				);
			}
			if (typeof oldLog.initial === 'string') {
				const initialTrack = trackLookup(oldLog.initial);
				const currentInitialYear = initialTrack
					? (initialTrack.work.end_year ?? initialTrack.work.begin_year)
					: null;
				if (
					typeof currentInitialYear === 'number' &&
					Number.isFinite(currentInitialYear) &&
					oldLog.initialYear !== currentInitialYear
				) {
					warnings.push(
						`[Meta] initialYear mismatch: log ${oldLog.initialYear}, dataset ${currentInitialYear}`
					);
				}
			}

			const result = (() => {
				try {
					return replayTimelineLog(
						oldLog,
						row.target,
						trackLookup,
						(msg) => warnings.push(msg),
						replayMin,
						replayMax
					);
				} catch (error) {
					const replayError = new Error(
						`Failed to replay timeline score.\n${buildReplayErrorContext(row, oldLog, error)}\nCause: ${formatUnknownError(error)}`
					);
					(replayError as Error & { cause?: unknown }).cause = error;
					throw replayError;
				}
			})();

			const newScore = result.score;
			const newLog = result.log;
			const newLogStr = JSON.stringify(newLog);

			const isScoreChanged = oldScore !== newScore;
			const isLogChanged = row.log !== newLogStr;

			// Final score check
			if (isScoreChanged) {
				const diffValue = newScore - oldScore;
				warnings.push(
					`Final score mismatch! Log: ${oldScore}, Logic: ${newScore} (${diffValue > 0 ? '+' : ''}${diffValue})`
				);
			}

			if (warnings.length > 0) {
				const date = new Date(row.timestamp).toLocaleString();
				const playerName = row.player_name || 'Anonymous';
				const country = row.country || '??';
				console.log(
					`\n--- ID ${row.id} (${date}) | ${playerName} (${country}) | ${row.tracklist_id} ---`
				);
				for (const w of warnings) {
					console.log(`  ${w}`);
				}
			}

			if (isScoreChanged || isLogChanged) {
				updates.push({
					id: row.id,
					oldScore,
					newScore,
					timestamp: row.timestamp,
					log: newLogStr,
					player_name: row.player_name,
					tracklist_id: row.tracklist_id,
					target: row.target
				});
			}
			totalOldScore += oldScore;
			totalNewScore += newScore;
		}

		if (updates.length > 0) {
			console.log('\n--- Recalculation Statistics ---');
			const diffs = updates.map((u) => u.newScore - u.oldScore);
			const avgDiff = diffs.reduce((a, b) => a + b, 0) / updates.length;
			const maxInc = Math.max(...diffs);
			const maxDec = Math.min(...diffs);

			console.log(`Total scores processed: ${scores.length}`);
			console.log(`Scores needing update:  ${updates.length}`);
			console.log(`Average change:        ${avgDiff.toFixed(2)} pts`);
			console.log(`Highest increase:      +${maxInc} pts`);
			console.log(`Highest decrease:      ${maxDec} pts`);
			console.log(`Total points shift:    ${totalNewScore - totalOldScore} pts`);

			const increases = updates.filter((u) => u.newScore > u.oldScore);
			if (increases.length > 0) {
				console.log('\n--- Top 20 Score Increases ---');
				const sortedByInc = [...increases].sort(
					(a, b) => b.newScore - b.oldScore - (a.newScore - a.oldScore)
				);
				console.table(
					sortedByInc.slice(0, 20).map((u) => ({
						Date: new Date(u.timestamp).toLocaleDateString(),
						ID: u.id,
						Tracklist: u.tracklist_id,
						Target: u.target,
						Player: u.player_name || 'Anonymous',
						'Old Score': u.oldScore,
						'New Score': u.newScore,
						Diff: `+${u.newScore - u.oldScore}`
					}))
				);
			}

			const decreases = updates.filter((u) => u.newScore < u.oldScore);
			if (decreases.length > 0) {
				console.log('\n--- Top 20 Score Decreases ---');
				const sortedByDec = [...decreases].sort(
					(a, b) => a.newScore - a.oldScore - (b.newScore - b.oldScore)
				);
				console.table(
					sortedByDec.slice(0, 20).map((u) => ({
						Date: new Date(u.timestamp).toLocaleDateString(),
						ID: u.id,
						Tracklist: u.tracklist_id,
						Target: u.target,
						Player: u.player_name || 'Anonymous',
						'Old Score': u.oldScore,
						'New Score': u.newScore,
						Diff: u.newScore - u.oldScore
					}))
				);
			}

			const sql = updates
				.map(
					(u) =>
						`UPDATE timeline_scores SET score = ${u.newScore}, log = '${u.log.replace(/'/g, "''")}' WHERE id = ${u.id};`
				)
				.join('\n');

			fs.writeFileSync(updatesSqlPath, sql);
			console.log(`\nWritten ${updates.length} updates to ${updatesSqlPath}`);

			const answer = await rl.question(
				`\nApply these updates to ${isLocal ? 'local' : 'remote'} D1? (y/N) `
			);
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('Applying updates...');
				execSync(
					`wrangler d1 execute lisztnup-analytics ${isLocal ? '--local' : '--remote'} --file=${updatesSqlPath} --yes`,
					{
						stdio: 'inherit'
					}
				);
				console.log('Done!');
			} else {
				console.log('Update cancelled.');
			}
		} else {
			console.log('No scores required updates.');
		}

		console.log('Cleaning up temporary files...');
		if (fs.existsSync(tempSqlPath)) fs.unlinkSync(tempSqlPath);
		if (fs.existsSync(tempJsonPath)) fs.unlinkSync(tempJsonPath);
		if (fs.existsSync(updatesSqlPath)) fs.unlinkSync(updatesSqlPath);
	} catch (error) {
		console.error('Error during recalculation:', error);
		process.exit(1);
	} finally {
		rl.close();
	}
}

main();
