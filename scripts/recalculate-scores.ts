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
		const scores = JSON.parse(scoresRaw) as {
			id: number;
			score: number;
			target: number;
			log: string;
			timestamp: string;
			player_name: string | null;
			country: string | null;
			tracklist_id: string;
		}[];

		console.log(`Processing ${scores.length} scores chronologically...`);

		const updates: {
			id: number;
			oldScore: number;
			newScore: number;
			log: string;
			timestamp: string;
			player_name: string | null;
			tracklist_id: string;
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
					tracklist_id: row.tracklist_id
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
		fs.unlinkSync(tempSqlPath);
		fs.unlinkSync(tempJsonPath);
		fs.unlinkSync(updatesSqlPath);
	} catch (error) {
		console.error('Error during recalculation:', error);
		process.exit(1);
	} finally {
		rl.close();
	}
}

main();
