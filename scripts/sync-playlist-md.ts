import fs from 'fs';
import path from 'path';
import { TracklistGenerator } from '../src/lib/services/TracklistGenerator';
import { BEGINNER_CONFIG } from '../src/lib/data/tracklistConfigs';
import { formatWorksAsMarkdown, getComposerLastName } from '../src/lib/utils/formatters';
import type { LisztnupData } from '../src/lib/types';

async function syncPlaylistMd() {
	console.log('Generating PLAYLIST_BEGINNER.md...');

	try {
		// 1. Load data
		const dataPath = path.join(process.cwd(), 'static/lisztnup.json');
		const rawData = fs.readFileSync(dataPath, 'utf-8');
		const data: LisztnupData = JSON.parse(rawData);

		// 2. Initialize Generator
		const tracklist = {
			name: 'Beginner',
			description: '',
			isDefault: true,
			category: 'difficulty',
			config: BEGINNER_CONFIG
		};
		const generator = new TracklistGenerator(data, tracklist);

		// 3. Get Filtered Data
		const { works, composers } = generator.getFilteredData();
		works.sort((a, b) => {
			return a.name.localeCompare(b.name);
		});
		works.sort((a, b) => {
			const composerA = composers.find((c) => c.gid === a.composer)!;
			const composerB = composers.find((c) => c.gid === b.composer)!;
			const lastNameA = getComposerLastName(composerA ? composerA.name : '');
			const lastNameB = getComposerLastName(composerB ? composerB.name : '');
			return lastNameA.localeCompare(lastNameB);
		});

		// 4. Format Markdown
		const markdown = formatWorksAsMarkdown(works, composers);

		// 5. Write to File
		const outputPath = path.join(process.cwd(), 'data/PLAYLIST_BEGINNER.md');
		const fileHeader =
			'# Beginner Playlist\n\n*This file is auto-generated on every build. Do not edit manually.*\n\n';
		fs.writeFileSync(outputPath, fileHeader + markdown, 'utf-8');

		console.log(`Successfully generated PLAYLIST_BEGINNER.md (${works.length} works).`);
	} catch (error) {
		console.error('Error generating playlist markdown:', error);
		process.exit(1);
	}
}

syncPlaylistMd();
