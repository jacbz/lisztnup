import fs from 'fs';
import path from 'path';
import { GameCatalog, type RawLisztnupData } from '../src/lib/models';
import { TracklistGenerator } from '../src/lib/services/TracklistGenerator';
import {
	ADVANCED_CONFIG,
	BEGINNER_CONFIG,
	EXPERT_CONFIG,
	INTERMEDIATE_CONFIG,
	SKILLED_CONFIG
} from '../src/lib/data/tracklistConfigs';
import { formatWorksAsMarkdown } from '../src/lib/utils/formatters';
import type { Tracklist } from '../src/lib/types';

async function syncTracklistMd() {
	console.log('Generating TRACKLIST_INTERMEDIATE.md...');

	try {
		const dataPath = path.join(process.cwd(), 'static/lisztnup.json');
		const rawData = fs.readFileSync(dataPath, 'utf-8');
		const data = GameCatalog.fromRaw(JSON.parse(rawData) as RawLisztnupData);

		const tracklists = [
			{
				key: 'BEGINNER',
				title: 'Beginner Tracklist',
				filename: 'TRACKLIST_BEGINNER.md',
				config: BEGINNER_CONFIG
			},
			{
				key: 'INTERMEDIATE',
				title: 'Intermediate Tracklist',
				filename: 'TRACKLIST_INTERMEDIATE.md',
				config: INTERMEDIATE_CONFIG
			},
			{
				key: 'SKILLED',
				title: 'Skilled Tracklist',
				filename: 'TRACKLIST_SKILLED.md',
				config: SKILLED_CONFIG
			},
			{
				key: 'ADVANCED',
				title: 'Advanced Tracklist',
				filename: 'TRACKLIST_ADVANCED.md',
				config: ADVANCED_CONFIG
			},
			{
				key: 'EXPERT',
				title: 'Expert Tracklist',
				filename: 'TRACKLIST_EXPERT.md',
				config: EXPERT_CONFIG
			}
		];

		let hadError = false;

		for (const tl of tracklists) {
			try {
				const tracklistMeta: Tracklist = {
					kind: 'default',
					id: tl.key.toLowerCase(),
					category: 'difficulty',
					config: tl.config
				};

				const generator = new TracklistGenerator(data, tracklistMeta);
				const { works, composers } = generator.getFilteredData();
				const markdown = formatWorksAsMarkdown(works, composers);

				const outputPath = path.join(process.cwd(), 'out', tl.filename);
				const fileHeader = `# ${tl.title}\n\n*This file is auto-generated on every build. Do not edit manually.*\n\n`;
				fs.writeFileSync(outputPath, fileHeader + markdown, 'utf-8');

				console.log(`Successfully generated ${tl.filename} (${works.length} works).`);
			} catch (innerErr) {
				hadError = true;
				console.error(`Error generating ${tl.filename}:`, innerErr);
			}
		}

		if (hadError) {
			process.exit(1);
		}
	} catch (error) {
		console.error('Error generating tracklist markdown:', error);
		process.exit(1);
	}
}

syncTracklistMd();
