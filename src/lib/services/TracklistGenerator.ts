import {
	type LisztnupData,
	type Tracklist,
	type Track,
	type Composer,
	type Work,
	type WorkCategory,
	type CategoryAdjustments
} from '$lib/types';
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
	private composerMap: Map<string, Composer> = new Map();
	private worksByComposer: Map<string, Work[]> = new Map();
	private worksByCategory: Map<WorkCategory, Work[]> = new Map();
	private composersByCategory: Map<WorkCategory, Composer[]> = new Map();
	private composerWeightMap: Map<string, number> = new Map();
	private categoryWeights: number[] = [];
	private categories: WorkCategory[] = [];

	constructor(data: LisztnupData, tracklist: Tracklist) {
		this.data = data;
		this.tracklist = tracklist;
		this.data.composers.forEach((composer) => {
			this.composerMap.set(composer.gid, composer);
		});
		this.filterData();
	}

	/**
	 * Filters the data based on tracklist configuration
	 * Called once during initialization
	 */
	private filterData(): void {
		const config = this.tracklist.config;
		let works: Work[] = [];

		Object.keys(this.data.works).forEach((category) => {
			works.push(...this.data.works[category as WorkCategory]);
		});

		// Step 1: Apply category adjustments to work scores
		if (config.categoryAdjustments) {
			works = works.map((work) => ({
				...work,
				score:
					work.score + (config.categoryAdjustments![work.type as keyof CategoryAdjustments] ?? 0)
			}));
		}

		// Step 2: Filter by year range
		if (config.yearFilter) {
			const [startYear, endYear] = config.yearFilter;
			works = works.filter((work) => {
				const composer = this.composerMap.get(work.composer);
				if (!composer) return false;

				// Use composer birth/death years as fallback if work years are null
				const workBeginYear = work.begin_year ?? composer.birth_year;
				const workEndYear = work.end_year ?? composer.death_year ?? new Date().getFullYear();

				return workBeginYear >= startYear && workEndYear <= endYear;
			});
		} // Step 3: Filter by work score range
		if (config.workScoreRange) {
			const [minScore, maxScore] = config.workScoreRange;
			works = works.filter((work) => work.score >= minScore && work.score <= maxScore);
		}

		// Step 4: Filter by work name
		if (config.nameFilter && config.nameFilter.length > 0) {
			works = works.filter((work) => {
				const workName = work.name.toLowerCase();
				// OR logic: match if ANY filter matches
				return config.nameFilter!.some((filter) => {
					// Check if filter is a regex pattern (starts and ends with /)
					if (filter.startsWith('/') && filter.endsWith('/')) {
						try {
							const pattern = filter.slice(1, -1); // Remove leading and trailing /
							const regex = new RegExp(pattern, 'i'); // Case-insensitive
							return regex.test(work.name);
						} catch {
							// Invalid regex, treat as literal string
							return workName.includes(filter.toLowerCase());
						}
					} else {
						// Literal string match (case-insensitive)
						return workName.includes(filter.toLowerCase());
					}
				});
			});
		}

		// Step 5: Filter by composer (include/exclude/topN)
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
			// Note: topN filtering happens in Step 7 after counting works
		}

		// Step 6: Build composer list and group works by composer
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

		// Step 7: Filter by top N composers
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

		// Step 8: Limit works from each composer (limitWorksFromComposer)
		if (config.limitWorksFromComposer !== undefined && config.limitWorksFromComposer > 0) {
			const limitPercentage = config.limitWorksFromComposer;
			const totalWorks = works.length;
			const maxWorksPerComposer = Math.max(1, Math.ceil(totalWorks * limitPercentage));

			// Count works per composer before limiting
			const worksBeforeLimiting = new Map<string, number>();
			works.forEach((work) => {
				const current = worksBeforeLimiting.get(work.composer) || 0;
				worksBeforeLimiting.set(work.composer, current + 1);
			});

			// Group works by composer and sort by popularity (score descending)
			const worksByComposerSorted = new Map<string, Work[]>();
			works.forEach((work) => {
				if (!worksByComposerSorted.has(work.composer)) {
					worksByComposerSorted.set(work.composer, []);
				}
				worksByComposerSorted.get(work.composer)!.push(work);
			});

			// Sort each composer's works by score (highest first) and take top N
			const limitedWorksArray: Work[] = [];
			worksByComposerSorted.forEach((composerWorks) => {
				// Sort by score descending (most popular first)
				const sortedWorks = [...composerWorks].sort((a, b) => b.score - a.score);

				// Take only the top N works
				const worksToKeep = sortedWorks.slice(0, maxWorksPerComposer);
				limitedWorksArray.push(...worksToKeep);
			});

			works = limitedWorksArray;

			// Rebuild worksByComposer map after limiting
			this.worksByComposer.clear();
			works.forEach((work) => {
				if (!this.worksByComposer.has(work.composer)) {
					this.worksByComposer.set(work.composer, []);
				}
				this.worksByComposer.get(work.composer)!.push(work);
			});

			// Count works per composer after limiting
			const worksAfterLimiting = new Map<string, number>();
			works.forEach((work) => {
				const current = worksAfterLimiting.get(work.composer) || 0;
				worksAfterLimiting.set(work.composer, current + 1);
			});
		}

		// Step 9: Filter parts within each work by maxTracksFromSingleWork
		if (config.maxTracksFromSingleWork !== undefined) {
			works = works.map((work) => {
				if (work.parts.length <= config.maxTracksFromSingleWork!) {
					return work;
				}

				if (config.maxTracksFromSingleWork == 1) {
					// If all scores are >97, just take the first part
					if (work.parts.every((part) => part.score > 97)) {
						return {
							...work,
							parts: [work.parts[0]]
						};
					}
				}

				// Sort parts by score (highest first), keeping original indices
				const partsWithIndex = work.parts.map((part, index) => ({ part, index }));
				const sortedPartsWithIndex = partsWithIndex.sort((a, b) => b.part.score - a.part.score);

				// Take top N parts
				const topPartsWithIndex = sortedPartsWithIndex.slice(0, config.maxTracksFromSingleWork!);

				// Restore original order
				const topParts = topPartsWithIndex
					.sort((a, b) => a.index - b.index)
					.map((item) => item.part);

				return {
					...work,
					parts: topParts
				};
			});
		}

		// Store filtered results
		this.filteredWorks = works;
		this.filteredComposers = composers;

		// Precompute composer weights (sublinear weighting)
		composers.map((c) => {
			const workCount = this.worksByComposer.get(c.gid)?.length || 0;
			const weight = Math.pow(workCount + 1, 0.75);
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
			const numWorksInCategory = this.worksByCategory.get(category)?.length || 0;
			return numWorksInCategory;
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
			(i) => this.categoryWeights[i]
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

		// Step 2: Select composer with weighting
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

		// Step 4: Select work with optional score weighting
		const usePopularityWeighting = this.tracklist.config.enablePopularityWeighting ?? true;
		const workIndex = weightedRandom(
			composerWorks.map((_, i) => i),
			(i) => (usePopularityWeighting ? composerWorks[i].score : 1)
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

		// Step 6: Select part with optional score weighting and POP it
		const partIndex = weightedRandom(
			work.parts.map((_, i) => i),
			(i) => (usePopularityWeighting ? work.parts[i].score : 1)
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

	/**
	 * Determines which game categories should be disabled based on filtered data
	 * Returns an array of GuessCategory values that should be disabled
	 */
	getDisabledCategories(): import('$lib/types').GuessCategory[] {
		const disabled: import('$lib/types').GuessCategory[] = [];

		// Disable 'composer' if only one composer
		if (this.filteredComposers.length <= 1) {
			disabled.push('composer');
		}

		// Disable 'type' if only one work category
		if (this.worksByCategory.size <= 1) {
			disabled.push('type');
		}

		// Calculate year range from all works
		let minYear = Infinity;
		let maxYear = -Infinity;

		this.filteredWorks.forEach((work) => {
			const composer = this.composerMap.get(work.composer);
			if (!composer) return;

			// Use work years if available, otherwise fall back to composer years
			const workBeginYear = work.begin_year ?? composer.birth_year;
			const workEndYear = work.end_year ?? composer.death_year ?? new Date().getFullYear();

			if (workBeginYear < minYear) minYear = workBeginYear;
			if (workEndYear > maxYear) maxYear = workEndYear;
		});

		const yearRange = maxYear - minYear;

		// Disable 'decade' if time range less than 30 years
		if (yearRange < 30) {
			disabled.push('decade');
		}

		// Disable 'era' if time range less than 100 years for maxYear after 1800, or 200 years for maxYear before 1800
		if ((maxYear > 1800 && yearRange < 100) || (maxYear <= 1800 && yearRange < 200)) {
			disabled.push('era');
		}

		return disabled;
	}
}
