import type { LisztnupData, Tracklist, Track, Composer, Work, WorkCategory } from '$lib/types';
import { weightedRandom } from '$lib/utils/random';

/**
 * Tracklist generator that uses O(1) swap-and-pop sampling
 * Filters data once on initialization, then samples tracks on demand
 */
export class TracklistGenerator {
	private data: LisztnupData;
	private tracklist: Tracklist;

	// Filtered and weighted data pools
	private filteredWorks: Work[] = [];
	private filteredComposers: Composer[] = [];
	private worksByComposer: Map<string, Work[]> = new Map();
	private worksByCategory: Map<WorkCategory, Work[]> = new Map();
	private composersByCategory: Map<WorkCategory, Composer[]> = new Map();
	private composerWeights: number[] = [];
	private composerWeightMap: Map<string, number> = new Map();
	private categoryWeights: number[] = [];
	private categories: WorkCategory[] = [];

	constructor(data: LisztnupData, tracklist: Tracklist) {
		this.data = data;
		this.tracklist = tracklist;
		this.filterData();
	}

	/**
	 * Filters the data based on tracklist configuration
	 * Called once during initialization
	 */
	private filterData(): void {
		const config = this.tracklist.config;
		let works: Work[] = [];

		// Step 1: Filter by category weights
		if (config.categoryWeights) {
			// Only include categories with weight > 0
			// Weights are now 0-100, so anything above 0 is included
			Object.entries(config.categoryWeights).forEach(([category, weight]) => {
				if (weight > 0) {
					works.push(...this.data.works[category as WorkCategory]);
				}
			});
		} else {
			// Include all categories
			Object.keys(this.data.works).forEach((category) => {
				works.push(...this.data.works[category as WorkCategory]);
			});
		}

		// Step 2: Filter by year range
		if (config.yearFilter) {
			const [startYear, endYear] = config.yearFilter;
			works = works.filter((work) => work.begin_year >= startYear && work.end_year <= endYear);
		}

		// Step 3: Filter by minimum work score
		if (config.minWorkScore !== null) {
			works = works.filter((work) => work.score >= config.minWorkScore!);
		}

		// Step 4: Filter by composer (include/exclude/topN)
		if (config.composerFilter) {
			if (config.composerFilter.mode === 'include') {
				// Only include specified composers
				works = works.filter(
					(work) =>
						config.composerFilter!.mode === 'include' &&
						config.composerFilter!.composers.includes(work.composer)
				);
			} else if (config.composerFilter.mode === 'exclude') {
				// Exclude specified composers
				works = works.filter(
					(work) =>
						config.composerFilter!.mode === 'exclude' &&
						!config.composerFilter!.composers.includes(work.composer)
				);
			}
			// Note: topN filtering happens in Step 6 after counting works
		}

		// Step 5: Build composer list and group works by composer
		const composerSet = new Set<string>();
		works.forEach((work) => {
			composerSet.add(work.composer);
			if (!this.worksByComposer.has(work.composer)) {
				this.worksByComposer.set(work.composer, []);
			}
			this.worksByComposer.get(work.composer)!.push(work);
		});

		// Filter composers to those with works
		let composers = this.data.composers.filter((c) => composerSet.has(c.gid));

		// Step 6: Filter by top N composers
		if (config.composerFilter?.mode === 'topN') {
			const topNCount = config.composerFilter.count;

			// Count works per composer
			const workCounts = new Map<string, number>();
			works.forEach((work) => {
				workCounts.set(work.composer, (workCounts.get(work.composer) || 0) + 1);
			});

			// Sort composers by work count and take top N
			const topComposers = [...workCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, topNCount)
				.map(([gid]) => gid);

			composers = composers.filter((c) => topComposers.includes(c.gid));
			works = works.filter((work) => topComposers.includes(work.composer));

			// Rebuild worksByComposer map
			this.worksByComposer.clear();
			works.forEach((work) => {
				if (!this.worksByComposer.has(work.composer)) {
					this.worksByComposer.set(work.composer, []);
				}
				this.worksByComposer.get(work.composer)!.push(work);
			});
		}

		// Step 7: Filter parts within each work by maxTracksFromSingleWork
		if (config.maxTracksFromSingleWork !== null) {
			works = works.map((work) => {
				if (work.parts.length <= config.maxTracksFromSingleWork!) {
					return work;
				}

				// Sort parts by score (highest first)
				const sortedParts = [...work.parts].sort((a, b) => b.score - a.score);

				// Take top N parts
				const topParts = sortedParts.slice(0, config.maxTracksFromSingleWork!);

				return {
					...work,
					parts: topParts
				};
			});
		}

		// Store filtered results
		this.filteredWorks = works;
		this.filteredComposers = composers;

		// Precompute composer weights (slightly logarithmic based on work count)
		this.composerWeights = composers.map((c) => {
			const workCount = this.worksByComposer.get(c.gid)?.length || 0;
			const weight = Math.log(workCount + 1) / Math.log(1.1); // log base 1.1 for more spread
			this.composerWeightMap.set(c.gid, weight);
			return weight;
		});

		// Group works by category
		this.worksByCategory.clear();
		this.composersByCategory.clear();

		works.forEach((work) => {
			const category = work.type as WorkCategory;

			if (!this.worksByCategory.has(category)) {
				this.worksByCategory.set(category, []);
				this.composersByCategory.set(category, []);
			}

			this.worksByCategory.get(category)!.push(work);
		});

		// Build composer list per category
		this.composersByCategory.forEach((composerList, category) => {
			const composerSet = new Set<string>();
			this.worksByCategory.get(category)!.forEach((work) => {
				composerSet.add(work.composer);
			});

			const categoryComposers = composers.filter((c) => composerSet.has(c.gid));
			this.composersByCategory.set(category, categoryComposers);
		});

		// Build category list and weights
		this.categories = Array.from(this.worksByCategory.keys());
		this.categoryWeights = this.categories.map((category) => {
			const weight = config.categoryWeights?.[category] ?? 50;
			// Normalize to 0-1 range (50 = neutral)
			return weight / 50;
		});
	}

	/**
	 * Samples a single track from the filtered data
	 * Returns null if no valid tracks are available
	 * Pops the selected part to prevent duplicate selection
	 */
	sample(): Track | null {
		if (this.categories.length === 0 || this.filteredWorks.length === 0) {
			return null;
		}

		// Step 1: Select category with weight
		const categoryIndex = weightedRandom(
			this.categories.map((_, i) => i),
			(i) => this.categoryWeights[i] * this.worksByCategory.get(this.categories[i])!.length
		);
		const category = this.categories[categoryIndex];

		// Get works and composers for this category
		const categoryWorksArray = this.worksByCategory.get(category);
		const categoryComposers = this.composersByCategory.get(category);

		if (
			!categoryWorksArray ||
			categoryWorksArray.length === 0 ||
			!categoryComposers ||
			categoryComposers.length === 0
		) {
			// Category exhausted, remove it and try again
			this.categories.splice(categoryIndex, 1);
			this.categoryWeights.splice(categoryIndex, 1);
			return this.sample();
		}

		// Step 2: Select composer with logarithmic weighting
		const composerIndex = weightedRandom(
			categoryComposers.map((_, i) => i),
			(i) => this.composerWeightMap.get(categoryComposers[i].gid) || 1
		);
		const composer = categoryComposers[composerIndex];

		// Step 3: Get works for this composer in this category
		const composerWorks = categoryWorksArray.filter((work) => work.composer === composer.gid);

		if (composerWorks.length === 0) {
			// Composer exhausted in this category, remove and try again
			categoryComposers.splice(composerIndex, 1);
			return this.sample();
		}

		// Step 4: Select work with score weighting
		const workIndex = weightedRandom(
			composerWorks.map((_, i) => i),
			(i) => composerWorks[i].score
		);
		const work = composerWorks[workIndex];

		// Step 5: Check if work has parts
		if (work.parts.length === 0) {
			// Work exhausted, remove it
			const workIndexInCategory = categoryWorksArray.indexOf(work);
			if (workIndexInCategory !== -1) {
				categoryWorksArray.splice(workIndexInCategory, 1);
			}

			const workIndexInComposer = this.worksByComposer.get(composer.gid)?.indexOf(work);
			if (workIndexInComposer !== undefined && workIndexInComposer !== -1) {
				this.worksByComposer.get(composer.gid)?.splice(workIndexInComposer, 1);
			}

			return this.sample();
		}

		// Step 6: Select part with score weighting and POP it
		const partIndex = weightedRandom(
			work.parts.map((_, i) => i),
			(i) => work.parts[i].score
		);
		const part = work.parts[partIndex];
		work.parts.splice(partIndex, 1);

		// If work is now empty, remove it
		if (work.parts.length === 0) {
			const workIndexInCategory = categoryWorksArray.indexOf(work);
			if (workIndexInCategory !== -1) {
				categoryWorksArray.splice(workIndexInCategory, 1);
			}

			const workIndexInComposer = this.worksByComposer.get(composer.gid)?.indexOf(work);
			if (workIndexInComposer !== undefined && workIndexInComposer !== -1) {
				this.worksByComposer.get(composer.gid)?.splice(workIndexInComposer, 1);
			}
		}

		return {
			composer,
			work,
			part
		};
	}

	/**
	 * Gets information about the filtered dataset
	 */
	getInfo(): { composers: number; works: number; tracks: number } {
		const totalTracks = this.filteredWorks.reduce((sum, work) => sum + work.parts.length, 0);

		return {
			composers: this.filteredComposers.length,
			works: this.filteredWorks.length,
			tracks: totalTracks
		};
	}

	/**
	 * Gets the filtered data for preview purposes
	 */
	getFilteredData(): { composers: Composer[]; works: Work[] } {
		return {
			composers: this.filteredComposers,
			works: this.filteredWorks
		};
	}
}
