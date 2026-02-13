import {
	type LisztnupData,
	type Tracklist,
	type Track,
	type Composer,
	type Work,
	type CategoryAdjustments
} from '$lib/types';
import { weightedRandom } from '$lib/utils/random';
import { buildShortUuidMap, resolveShortUuids } from '$lib/utils/uuid';

/**
 * Tracklist generator that uses swap-and-pop sampling
 * Filters data once on initialization, then samples tracks on demand
 */
export class TracklistGenerator {
	private data: LisztnupData;
	private tracklist: Tracklist;
	private requireWorkYear: boolean;

	// Filtered and weighted data pools
	private filteredWorks: Work[] = [];
	private filteredComposers: Composer[] = [];
	private composerMap: Map<string, Composer> = new Map();

	// Short UUID map for fast lookups
	private shortUuidMap: Map<string, string>;

	constructor(data: LisztnupData, tracklist: Tracklist, options?: { requireWorkYear?: boolean }) {
		this.data = data;
		this.tracklist = tracklist;
		this.requireWorkYear = options?.requireWorkYear ?? false;
		this.data.composers.forEach((composer) => {
			this.composerMap.set(composer.gid, composer);
		});
		// Build short UUID map once for efficient lookups
		this.shortUuidMap = buildShortUuidMap(data.works.map((w) => w.gid));
		this.filterData();
	}

	/**
	 * Filters the data based on tracklist configuration
	 * Called once during initialization
	 */
	private filterData(): void {
		const config = this.tracklist.config;
		const enableFilters = config.enableFilters !== false; // Default to true

		// Resolve manually curated works from short UUIDs
		const includeWorkGids = config.includeWorks
			? new Set(resolveShortUuids(config.includeWorks, this.shortUuidMap))
			: new Set<string>();
		const excludeWorkGids = config.excludeWorks
			? new Set(resolveShortUuids(config.excludeWorks, this.shortUuidMap))
			: new Set<string>();

		let works: Work[];

		if (!enableFilters) {
			// When filters are disabled, only use manually included works
			works =
				includeWorkGids.size > 0 ? this.data.works.filter((w) => includeWorkGids.has(w.gid)) : [];
		} else {
			works = [...this.data.works];

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
			}

			// Step 3: Filter by work score range
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
			const worksByComposer: Map<string, Work[]> = new Map();
			works.forEach((work) => {
				composerSet.add(work.composer);
				if (!worksByComposer.has(work.composer)) {
					worksByComposer.set(work.composer, []);
				}
				worksByComposer.get(work.composer)!.push(work);
			});

			// Filter composers to those with works
			let composers = this.data.composers.filter((c) => composerSet.has(c.gid));

			// Step 7: Filter by notability range (rank-based filtering)
			if (config.composerFilter?.mode === 'notabilityRange') {
				const [startRank, endRank] = config.composerFilter.range;

				// Sort composers by score (descending) to determine rank
				const sortedComposers = [...composers].sort((a, b) => b.score - a.score);

				// Take composers in the specified rank range (1-indexed, inclusive)
				// startRank=1, endRank=50 means take composers ranked 1-50 (most notable)
				// startRank=51, endRank=100 means take composers ranked 51-100 (less notable)
				const startIndex = Math.max(0, startRank - 1); // Convert to 0-indexed
				const endIndex = Math.min(sortedComposers.length, endRank); // Inclusive end
				composers = sortedComposers.slice(startIndex, endIndex);

				const composerIds = new Set(composers.map((c) => c.gid));
				works = works.filter((work) => composerIds.has(work.composer));

				// Rebuild worksByComposer map
				worksByComposer.clear();
				works.forEach((work) => {
					if (!worksByComposer.has(work.composer)) {
						worksByComposer.set(work.composer, []);
					}
					worksByComposer.get(work.composer)!.push(work);
				});
			}

			// Step 8: Limit works from each composer (limitWorksFromComposer)
			if (config.limitWorksFromComposer !== undefined && config.limitWorksFromComposer > 0) {
				const limitPercentage = config.limitWorksFromComposer;
				const totalWorks = works.length;
				const maxWorksPerComposer = Math.max(1, Math.ceil(totalWorks * limitPercentage));

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
			}

			// Step 10: Merge manually included works (add any not already in filtered set)
			if (includeWorkGids.size > 0) {
				const existingGids = new Set(works.map((w) => w.gid));
				const additionalWorks = this.data.works.filter(
					(w) => includeWorkGids.has(w.gid) && !existingGids.has(w.gid)
				);
				works = [...works, ...additionalWorks];
			}
		}

		// Step 11: Remove manually excluded works (always applied regardless of enableFilters)
		if (excludeWorkGids.size > 0) {
			works = works.filter((w) => !excludeWorkGids.has(w.gid));
		}

		// Step 12: Filter parts within each work by maxTracksFromSingleWork
		// Applied after all inclusion/exclusion to ensure ALL works respect the limit
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

				return { ...work, parts: topParts };
			});
		}

		// In game modes that require work years, filter out works without any year data
		if (this.requireWorkYear) {
			works = works.filter((work) => work.begin_year != null || work.end_year != null);
		}

		// Rebuild composer set from final works list
		const finalComposerSet = new Set<string>();
		works.forEach((work) => finalComposerSet.add(work.composer));

		// Store filtered results
		this.filteredWorks = works;
		this.filteredComposers = this.data.composers.filter((c) => finalComposerSet.has(c.gid));
	}

	/**
	 * Samples a single track from the filtered data
	 * Returns null if no valid tracks are available
	 * Pops the selected part to prevent duplicate selection
	 */
	sample(): Track | null {
		if (this.filteredWorks.length === 0) {
			return null;
		}

		// Step 1: Select work with optional score weighting
		const usePopularityWeighting = this.tracklist.config.enablePopularityWeighting ?? true;
		const work = weightedRandom(this.filteredWorks, (i) => (usePopularityWeighting ? i.score : 1));

		// Step 2: Check if work has parts
		if (work.parts.length === 0) {
			// Work exhausted, remove it
			const workIndex = this.filteredWorks.indexOf(work);
			if (workIndex !== -1) {
				this.filteredWorks.splice(workIndex, 1);
			}

			return this.sample();
		}

		// Step 3: Select part with  score weighting and POP it
		const partIndex = weightedRandom(
			work.parts.map((_, i) => i),
			(i) => (usePopularityWeighting ? work.parts[i].score : 1)
		);
		const part = work.parts[partIndex];
		work.parts.splice(partIndex, 1);

		// If work is now empty, remove it
		if (work.parts.length === 0) {
			const workIndex = this.filteredWorks.indexOf(work);
			if (workIndex !== -1) {
				this.filteredWorks.splice(workIndex, 1);
			}
		}

		return {
			composer: this.composerMap.get(work.composer)!,
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
	 * Gets the short UUID map for resolving manual curation entries
	 */
	getShortUuidMap(): Map<string, string> {
		return this.shortUuidMap;
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
		if (this.filteredWorks.every((work) => work.type === this.filteredWorks[0].type)) {
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
