import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { GameCatalog, type RawLisztnupData } from '../src/lib/models';
import { replayTimelineLog } from '../src/lib/logic/timelineReplayUtils';
import type { TimelineReplayLog } from '../src/lib/types/timelineReplay';

async function main() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	console.log('Exporting timeline_scores from D1 (this might take a moment)...');
	const tempSqlPath = 'temp-scores.sql';
	const tempJsonPath = 'temp-scores.json';
	const updatesSqlPath = 'updates.sql';

	try {
		// 1. Export from D1
		execSync(
			`npx wrangler d1 export lisztnup-analytics --remote --output=${tempSqlPath} --table timeline_scores`,
			{ stdio: 'inherit' }
		);

		console.log('Loading lisztnup dataset...');
		const dataPath = path.join(process.cwd(), 'static/lisztnup.json');
		const rawData = fs.readFileSync(dataPath, 'utf-8');
		const data = GameCatalog.fromRaw(JSON.parse(rawData) as RawLisztnupData);

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
			`sqlite3 :memory: ".read ${tempSqlPath}" ".mode json" "SELECT id, score, target, log, timestamp FROM timeline_scores WHERE log IS NOT NULL ORDER BY timestamp ASC" > ${tempJsonPath}`
		);

		const scoresRaw = fs.readFileSync(tempJsonPath, 'utf-8');
		const scores = JSON.parse(scoresRaw) as {
			id: number;
			score: number;
			target: number;
			log: string;
			timestamp: string;
		}[];

		console.log(`Processing ${scores.length} scores chronologically...`);

		const updates: { id: number; oldScore: number; newScore: number; log: string; timestamp: string }[] = [];
		let totalOldScore = 0;
		let totalNewScore = 0;
		let firstSample: { oldLog: TimelineReplayLog; newLog: TimelineReplayLog } | null = null;

		for (const row of scores) {
			const oldScore = row.score;
			let oldLog: TimelineReplayLog;
			try {
				oldLog = JSON.parse(row.log);
			} catch {
				console.warn(`[WARN] Skipping ID ${row.id}: invalid JSON log.`);
				continue;
			}

			const warnings: string[] = [];
			const result = replayTimelineLog(oldLog, row.target, trackLookup, (msg) =>
				warnings.push(msg)
			);

			const newScore = result.score;
			const newLog = result.log;
			const newLogStr = JSON.stringify(newLog);

			const isScoreChanged = oldScore !== newScore;
			const isLogChanged = row.log !== newLogStr;

			// Final score check
			if (isScoreChanged) {
				const diffValue = newScore - oldScore;
				warnings.push(`Final score mismatch! Log: ${oldScore}, Logic: ${newScore} (${diffValue > 0 ? '+' : ''}${diffValue})`);
			}

			if (warnings.length > 0) {
				const dateStr = new Date(row.timestamp).toLocaleString();
				console.log(`\n--- Warnings for ID ${row.id} (${dateStr}) ---`);
				for (const w of warnings) {
					console.log(`  ID ${row.id}: ${w}`);
				}
			}

			if (isScoreChanged || isLogChanged) {
				if (!firstSample) {
					firstSample = { oldLog, newLog };
				}
				updates.push({
					id: row.id,
					oldScore,
					newScore,
					log: newLogStr,
					timestamp: row.timestamp
				});
				totalOldScore += oldScore;
				totalNewScore += newScore;
			}
		}

		if (updates.length > 0) {
			if (firstSample) {
				console.log('\n=============================================');
				console.log('=== SAMPLE LOG CHANGE (FIRST ENCOUNTERED) ===');
				console.log('=============================================');
				console.log('OLD LOG:');
				console.log(JSON.stringify(firstSample.oldLog, null, 2));
				console.log('\nNEW LOG:');
				console.log(JSON.stringify(firstSample.newLog, null, 2));
				console.log('=============================================\n');
			}

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

			console.log('\n--- Top 20 Score Increases ---');
			const sortedByInc = [...updates].sort((a, b) => (b.newScore - b.oldScore) - (a.newScore - a.oldScore));
			console.table(
				sortedByInc.slice(0, 20).map((u) => ({
					Date: new Date(u.timestamp).toLocaleDateString(),
					ID: u.id,
					'Old Score': u.oldScore,
					'New Score': u.newScore,
					Diff: `+${u.newScore - u.oldScore}`
				}))
			);

			console.log('\n--- Top 20 Score Decreases ---');
			const sortedByDec = [...updates].sort((a, b) => (a.newScore - a.oldScore) - (b.newScore - b.oldScore));
			console.table(
				sortedByDec.slice(0, 20).map((u) => ({
					Date: new Date(u.timestamp).toLocaleDateString(),
					ID: u.id,
					'Old Score': u.oldScore,
					'New Score': u.newScore,
					Diff: u.newScore - u.oldScore
				}))
			);

			const sql = updates
				.map(
					(u) =>
						`UPDATE timeline_scores SET score = ${u.newScore}, log = '${u.log.replace(/'/g, "''")}' WHERE id = ${u.id};`
				)
				.join('\n');

			fs.writeFileSync(updatesSqlPath, sql);
			console.log(`\nWritten ${updates.length} updates to ${updatesSqlPath}`);

			const answer = await rl.question('\nApply these updates to D1? (y/N) ');
			if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
				console.log('Applying updates...');
				execSync(`wrangler d1 execute lisztnup-analytics --remote --file=${updatesSqlPath}`, {
					stdio: 'inherit'
				});
				console.log('Done!');
				fs.unlinkSync(updatesSqlPath);
			} else {
				console.log('Update cancelled. The updates.sql file has been preserved.');
			}
		} else {
			console.log('No scores required updates.');
		}

		console.log('Cleaning up temporary files...');
		fs.unlinkSync(tempSqlPath);
		fs.unlinkSync(tempJsonPath);
	} catch (error) {
		console.error('Error during recalculation:', error);
		process.exit(1);
	} finally {
		rl.close();
	}
}

main();
