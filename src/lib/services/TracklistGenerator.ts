import {
	type LisztnupData,
	type Tracklist,
	type Track,
	type Composer,
	type Work,
	type CategoryAdjustments,
	type TracklistConfig,
	MAX_WORK_SCORE_ROUNDED,
	type GuessCategory
} from '$lib/types';
import { weightedRandom } from '$lib/utils/random';
import { buildShortUuidMap, resolveShortUuids } from '$lib/utils/uuid';

/**
 * Tracklist generator that uses swap-and-pop sampling
 * Filters data once on initialization, then samples tracks on demand
 */
export class TracklistGenerator {
	private readonly data: LisztnupData;
	private readonly tracklist: Tracklist;
	private readonly requireWorkYear: boolean;

	private filteredWorks: Work[] = [];
	private filteredComposers: Composer[] = [];
	private readonly composerMap: Map<string, Composer> = new Map();
	private readonly shortUuidMap: Map<string, string>;

	constructor(data: LisztnupData, tracklist: Tracklist, options?: { requireWorkYear?: boolean }) {
		this.data = data;
		this.tracklist = tracklist;
		this.requireWorkYear = options?.requireWorkYear ?? false;

		for (const composer of this.data.composers) {
			this.composerMap.set(composer.gid, composer);
		}

		this.shortUuidMap = buildShortUuidMap(data.works.map((w) => w.gid));
		this.initializeData();
	}

	/**
	 * Main initialization pipeline
	 */
	private initializeData(): void {
		const config = this.tracklist.config;
		const enableFilters = config.enableFilters !== false;

		const includeWorkGids = new Set(
			config.includeWorks ? resolveShortUuids(config.includeWorks, this.shortUuidMap) : []
		);
		const excludeWorkGids = new Set(
			config.excludeWorks ? resolveShortUuids(config.excludeWorks, this.shortUuidMap) : []
		);

		const isEligibleWork = (w: Work) =>
			!excludeWorkGids.has(w.gid) &&
			(!this.requireWorkYear || w.begin_year != null || w.end_year != null);

		// 1. Extract Manual Works (Bypass general filters, but respect excludes and year rules)
		const manualWorks = this.data.works.filter(
			(w) => includeWorkGids.has(w.gid) && isEligibleWork(w)
		);

		let finalWorks: Work[] = [];

		if (!enableFilters) {
			finalWorks = manualWorks;
		} else {
			// 2. Build Candidate Pool
			const candidateWorks = this.data.works.filter(
				(w) => !includeWorkGids.has(w.gid) && isEligibleWork(w)
			);

			// 3. Apply standard criteria filters
			const filteredCandidates = this.applyFilters(candidateWorks, config);

			// 4. Unified Selection (Apply Quotas & Top N limits together)
			finalWorks = this.enforceQuotas(manualWorks, filteredCandidates, config);
		}

		// 5. Apply track limits and guarantee data immutability for the `sample()` phase
		finalWorks = this.applyTrackLimits(finalWorks, config.maxTracksFromSingleWork);

		// 6. Finalize state
		const finalComposerSet = new Set(finalWorks.map((w) => w.composer));
		this.filteredWorks = finalWorks;
		this.filteredComposers = this.data.composers.filter((c) => finalComposerSet.has(c.gid));
	}

	/**
	 * Applies standard filters (score, year, name, composer inclusion/exclusion) to candidates
	 */
	private applyFilters(works: Work[], config: TracklistConfig): Work[] {
		let filtered = works;

		// Category Adjustments
		if (config.categoryAdjustments) {
			filtered = filtered.map((work) => ({
				...work,
				score:
					work.score + (config.categoryAdjustments?.[work.type as keyof CategoryAdjustments] ?? 0)
			}));
		}

		// Enforce positive score
		filtered = filtered.filter((w) => w.score > 0);

		// Work Score Range
		if (config.workScoreRange) {
			const minScore = config.workScoreRange[0];
			const maxScore =
				config.workScoreRange[1] === MAX_WORK_SCORE_ROUNDED ? Infinity : config.workScoreRange[1];
			filtered = filtered.filter((w) => w.score >= minScore && w.score <= maxScore);
		}

		// Year Range Filter
		if (config.yearFilter) {
			const [startYear, endYear] = config.yearFilter;
			filtered = filtered.filter((work) => {
				const composer = this.composerMap.get(work.composer);
				if (!composer) return false;
				const begin = work.begin_year ?? composer.birth_year;
				const end = work.end_year ?? composer.death_year ?? new Date().getFullYear();
				return begin >= startYear && end <= endYear;
			});
		}

		// Name Filter
		if (config.nameFilter && config.nameFilter.length > 0) {
			filtered = filtered.filter((work) => {
				const workName = work.name.toLowerCase();
				return config.nameFilter!.some((filter) => {
					if (filter.startsWith('/') && filter.endsWith('/')) {
						try {
							return new RegExp(filter.slice(1, -1), 'i').test(work.name);
						} catch {
							return workName.includes(filter.toLowerCase());
						}
					}
					return workName.includes(filter.toLowerCase());
				});
			});
		}

		// Composer Filtering
		const cf = config.composerFilter;
		if (cf) {
			if (cf.mode === 'include') {
				const validIds = new Set(cf.composers);
				filtered = filtered.filter((w) => validIds.has(w.composer));
			} else if (cf.mode === 'exclude') {
				const invalidIds = new Set(cf.composers);
				filtered = filtered.filter((w) => !invalidIds.has(w.composer));
			} else if (cf.mode === 'notabilityRange') {
				const [startRank, endRank] = cf.range;
				const activeComposerIds = new Set(filtered.map((w) => w.composer));
				const activeComposers = this.data.composers.filter((c) => activeComposerIds.has(c.gid));

				const sortedComposers = activeComposers.sort((a, b) => b.score - a.score);
				const allowedIds = new Set(
					sortedComposers.slice(Math.max(0, startRank - 1), endRank).map((c) => c.gid)
				);
				filtered = filtered.filter((w) => allowedIds.has(w.composer));
			} else if (cf.mode === 'country') {
				const validCountries = new Set(cf.countries);
				const validIds = new Set(
					this.data.composers.filter((c) => validCountries.has(c.country)).map((c) => c.gid)
				);
				filtered = filtered.filter((w) => validIds.has(w.composer));
			} else if (cf.mode === 'countryExclude') {
				const excludedCountries = new Set(cf.countries);
				const invalidIds = new Set(
					this.data.composers.filter((c) => excludedCountries.has(c.country)).map((c) => c.gid)
				);
				filtered = filtered.filter((w) => !invalidIds.has(w.composer));
			} else if (cf.mode === 'gender') {
				const validIds = new Set(
					this.data.composers.filter((c) => c.gender === cf.gender).map((c) => c.gid)
				);
				filtered = filtered.filter((w) => validIds.has(w.composer));
			}
		}

		return filtered;
	}

	/**
	 * Greedily selects works ensuring the maximum array size and max-composer-percentage quotas are met
	 */
	private enforceQuotas(
		manualWorks: Work[],
		candidateWorks: Work[],
		config: TracklistConfig
	): Work[] {
		const hasTopN = config.topWorksCount !== undefined && config.topWorksCount > 0;
		const hasLimit =
			config.limitWorksFromComposer !== undefined && config.limitWorksFromComposer > 0;

		if (!hasTopN && !hasLimit) {
			return [...manualWorks, ...candidateWorks];
		}

		// Sort candidates by adjusted score descending
		candidateWorks.sort((a, b) => b.score - a.score);

		const totalAvailable = manualWorks.length + candidateWorks.length;
		// Ensure target size never forces manual works to be dropped
		const targetCount = hasTopN
			? Math.max(manualWorks.length, config.topWorksCount as number)
			: totalAvailable;
		const expectedFinalSize = Math.min(totalAvailable, targetCount);

		const limitPerComposer = hasLimit
			? Math.max(1, Math.ceil(expectedFinalSize * (config.limitWorksFromComposer as number)))
			: Infinity;

		const finalWorks = [...manualWorks];
		const composerCounts = new Map<string, number>();

		// Seed quotas with manual works
		for (const work of manualWorks) {
			composerCounts.set(work.composer, (composerCounts.get(work.composer) || 0) + 1);
		}

		// Greedily pick the best remaining candidates
		for (const work of candidateWorks) {
			if (finalWorks.length >= targetCount) break;

			const currentCount = composerCounts.get(work.composer) || 0;
			if (currentCount >= limitPerComposer) continue;

			finalWorks.push(work);
			composerCounts.set(work.composer, currentCount + 1);
		}

		return finalWorks;
	}

	/**
	 * Enforces limits on parts-per-work.
	 */
	private applyTrackLimits(works: Work[], maxTracks?: number): Work[] {
		return works.map((work) => {
			const partsCopy = [...work.parts];

			if (maxTracks === undefined || partsCopy.length <= maxTracks) {
				return { ...work, parts: partsCopy };
			}

			if (maxTracks === 1 && partsCopy.every((p) => p.score > 98)) {
				return { ...work, parts: [partsCopy[0]] };
			}

			const sortedParts = partsCopy
				.map((part, index) => ({ part, index }))
				.sort((a, b) => b.part.score - a.part.score)
				.slice(0, maxTracks)
				.sort((a, b) => a.index - b.index) // Restore original order
				.map((item) => item.part);

			return { ...work, parts: sortedParts };
		});
	}

	/**
	 * Samples a single track from the filtered data
	 * Returns null if no valid tracks are available
	 * Pops the selected part to prevent duplicate selection
	 */
	sample(): Track | null {
		if (this.filteredWorks.length === 0) return null;

		// Step 1: Select work with optional score weighting
		const useWeighting = this.tracklist.config.enablePopularityWeighting ?? false;
		const work = weightedRandom(this.filteredWorks, (i) => (useWeighting ? i.score : 1));

		// Step 2: Check if work has parts
		if (work.parts.length === 0) {
			this.removeEmptyWork(work);
			return this.sample();
		}

		// Step 3: Select part with  score weighting and POP it
		const partIndex = weightedRandom(
			work.parts.map((_, i) => i),
			(i) => (useWeighting ? work.parts[i].score : 1)
		);
		const part = work.parts[partIndex];

		// Pop selected part to prevent duplication
		work.parts.splice(partIndex, 1);
		if (work.parts.length === 0) {
			this.removeEmptyWork(work);
		}

		return {
			composer: this.composerMap.get(work.composer)!,
			work,
			part
		};
	}

	private removeEmptyWork(work: Work) {
		const index = this.filteredWorks.indexOf(work);
		if (index !== -1) {
			this.filteredWorks.splice(index, 1);
		}
	}

	/**
	 * Gets information about the filtered dataset
	 */
	getInfo(): { composers: number; works: number; tracks: number; allFemaleComposers: boolean } {
		const totalTracks = this.filteredWorks.reduce((sum, work) => sum + work.parts.length, 0);
		const allFemaleComposers =
			this.filteredComposers.length > 0 &&
			this.filteredComposers.every((c) => c.gender === 'female');

		return {
			composers: this.filteredComposers.length,
			works: this.filteredWorks.length,
			tracks: totalTracks,
			allFemaleComposers
		};
	}

	/**
	 * Gets the filtered data for preview purposes
	 */
	getFilteredData(): { composers: Composer[]; works: Work[] } {
		return { composers: this.filteredComposers, works: this.filteredWorks };
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
	getDisabledCategories(): GuessCategory[] {
		const disabled: GuessCategory[] = [];

		// Disable 'composer' if only one composer
		if (this.filteredComposers.length <= 1) disabled.push('composer');

		// Disable 'type' if only one work category
		if (
			this.filteredWorks.length > 0 &&
			this.filteredWorks.every((w) => w.type === this.filteredWorks[0].type)
		) {
			disabled.push('type');
		}

		let minYear = Infinity;
		let maxYear = -Infinity;

		for (const work of this.filteredWorks) {
			const composer = this.composerMap.get(work.composer);
			if (!composer) continue;

			const begin = work.begin_year ?? composer.birth_year;
			const end = work.end_year ?? composer.death_year ?? new Date().getFullYear();

			if (begin < minYear) minYear = begin;
			if (end > maxYear) maxYear = end;
		}

		const yearRange = maxYear - minYear;
		// Disable 'decade' if time range less than 30 years
		if (yearRange < 30) disabled.push('decade');
		// Disable 'era' if time range less than 100 years for maxYear after 1800, or 200 years for maxYear before 1800
		if ((maxYear > 1800 && yearRange < 100) || (maxYear <= 1800 && yearRange < 200)) {
			disabled.push('era');
		}

		return disabled;
	}
}
