import type { LisztnupData, GameSettings, Track, Composer, Work, WorkCategory } from '$lib/types';
import { weightedRandom } from '$lib/utils/random';

export class TracklistGenerator {
	private data: LisztnupData;

	constructor(data: LisztnupData) {
		this.data = data;
	}

	/**
	 * Generates a tracklist based on the provided settings
	 */
	generateTracklist(settings: GameSettings): Track[] {
		const tracks: Track[] = [];
		const filteredData = this.filterData(settings);

		for (let i = 0; i < settings.numberOfTracks; i++) {
			const track = this.generateSingleTrack(filteredData, settings);
			if (track) {
				tracks.push(track);
			}
		}

		return tracks;
	}

	/**
	 * Filters the data based on settings
	 */
	private filterData(settings: GameSettings): {
		composers: Composer[];
		works: Work[];
	} {
		let composers = [...this.data.composers];
		let works: Work[] = [];

		// Filter by preset
		if (settings.preset === 'default') {
			// Include all categories
			Object.keys(this.data.works).forEach((category) => {
				works.push(...this.data.works[category as WorkCategory]);
			});
		} else if (settings.preset !== 'custom') {
			// Single category preset
			works = [...this.data.works[settings.preset as WorkCategory]];
		} else {
			// Custom preset with category weights
			Object.entries(settings.categoryWeights).forEach(([category, weight]) => {
				if (weight > 0) {
					works.push(...this.data.works[category as WorkCategory]);
				}
			});
		}

		// Filter by year range
		if (settings.yearFilter) {
			const [startYear, endYear] = settings.yearFilter;
			works = works.filter((work) => work.begin_year >= startYear && work.end_year <= endYear);
		}

		// Filter by composer
		if (settings.composerFilter.length > 0) {
			works = works.filter((work) => settings.composerFilter.includes(work.composer));
			composers = composers.filter((c) => settings.composerFilter.includes(c.gid));
		}

		// Filter to top N composers
		if (settings.topNComposers !== null && settings.topNComposers > 0) {
			// Count works per composer
			const workCounts = new Map<string, number>();
			works.forEach((work) => {
				workCounts.set(work.composer, (workCounts.get(work.composer) || 0) + 1);
			});

			// Sort composers by work count
			const sortedComposers = [...workCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, settings.topNComposers)
				.map(([gid]) => gid);

			works = works.filter((work) => sortedComposers.includes(work.composer));
			composers = composers.filter((c) => sortedComposers.includes(c.gid));
		}

		return { composers, works };
	}

	/**
	 * Generates a single track
	 */
	private generateSingleTrack(
		filteredData: { composers: Composer[]; works: Work[] },
		settings: GameSettings
	): Track | null {
		if (filteredData.composers.length === 0 || filteredData.works.length === 0) {
			return null;
		}

		// Group works by composer
		const worksByComposer = new Map<string, Work[]>();
		filteredData.works.forEach((work) => {
			if (!worksByComposer.has(work.composer)) {
				worksByComposer.set(work.composer, []);
			}
			worksByComposer.get(work.composer)!.push(work);
		});

		// Select composer with logarithmic weighting
		const composersWithWorks = filteredData.composers.filter((c) => worksByComposer.has(c.gid));

		const composer = weightedRandom(composersWithWorks, (c) => {
			const workCount = worksByComposer.get(c.gid)?.length || 0;
			return Math.log(workCount + 1);
		});

		// Select work from composer
		const composerWorks = worksByComposer.get(composer.gid) || [];
		if (composerWorks.length === 0) {
			return null;
		}

		const work = weightedRandom(composerWorks, (w) => {
			const categoryWeight =
				settings.preset === 'custom' ? settings.categoryWeights[w.type as WorkCategory] || 1 : 1;
			return w.score * categoryWeight;
		});

		// Select part from work
		if (work.parts.length === 0) {
			return null;
		}

		const part = weightedRandom(work.parts, (p) => p.score);

		return {
			composer,
			work,
			part
		};
	}

	/**
	 * Gets preset information
	 */
	getPresetInfo(preset: string): { composers: number; works: number; tracks: number } {
		let works: Work[] = [];

		if (preset === 'default') {
			Object.keys(this.data.works).forEach((category) => {
				works.push(...this.data.works[category as WorkCategory]);
			});
		} else if (preset !== 'custom') {
			works = [...this.data.works[preset as WorkCategory]];
		}

		const composerSet = new Set(works.map((w) => w.composer));
		const totalTracks = works.reduce((sum, work) => sum + work.parts.length, 0);

		return {
			composers: composerSet.size,
			works: works.length,
			tracks: totalTracks
		};
	}
}
