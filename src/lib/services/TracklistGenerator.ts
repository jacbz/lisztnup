import {
	type Tracklist,
	type CategoryAdjustments,
	type TracklistConfig,
	MAX_WORK_SCORE_ROUNDED,
	type GuessCategory
} from '$lib/types';
import type { Composer, GameCatalog, Part, Track, Work } from '$lib/models';
import { weightedRandom, type RandomSource } from '$lib/utils/random';

interface ScoredWork {
	work: Work;
	score: number;
}

interface CandidateWork {
	work: Work;
	score: number;
	parts: Part[];
}

export interface TracklistSamplePoolWork {
	work: Work;
	score: number;
	parts: readonly Part[];
}

export interface TracklistSamplePool {
	works: readonly TracklistSamplePoolWork[];
	composers: readonly Composer[];
	usePopularityWeighting: boolean;
}

/**
 * Tracklist generator that uses swap-and-pop sampling
 * Filters data once on initialization, then samples tracks on demand
 */
export class TracklistGenerator {
	private readonly data: GameCatalog;
	private readonly tracklist: Tracklist;
	private readonly requireWorkYear: boolean;
	private readonly rng: RandomSource;

	private filteredWorks: CandidateWork[] = [];
	private filteredComposers: Composer[] = [];

	constructor(
		data: GameCatalog,
		tracklist: Tracklist,
		options?: { requireWorkYear?: boolean; rng?: RandomSource }
	) {
		this.data = data;
		this.tracklist = tracklist;
		this.requireWorkYear = options?.requireWorkYear ?? false;
		this.rng = options?.rng ?? Math.random;

		this.initializeData();
	}

	/**
	 * Main initialization pipeline
	 */
	private initializeData(): void {
		const config = this.tracklist.config;
		const enableFilters = config.enableFilters !== false;

		const includeWorkGids = new Set(config.includeWorks ?? []);
		const excludeWorkGids = new Set(config.excludeWorks ?? []);

		const isEligibleWork = (w: Work) =>
			!excludeWorkGids.has(w.gid) &&
			(!this.requireWorkYear || w.begin_year != null || w.end_year != null);

		// 1. Extract Manual Works (Bypass general filters, but respect excludes and year rules)
		const manualWorks = this.data.works
			.filter((w) => includeWorkGids.has(w.gid) && isEligibleWork(w))
			.map((work) => ({ work, score: work.score }));

		let finalWorks: ScoredWork[];

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
		const finalCandidates = this.applyTrackLimits(finalWorks, config.maxTracksFromSingleWork);

		// 6. Finalize state
		const finalComposerSet = new Set(
			finalCandidates.map((candidate) => candidate.work.composerGid)
		);
		this.filteredWorks = finalCandidates;
		this.filteredComposers = this.data.composers.filter((c) => finalComposerSet.has(c.gid));
	}

	/**
	 * Applies standard filters (score, year, name, composer inclusion/exclusion) to candidates
	 */
	private applyFilters(works: readonly Work[], config: TracklistConfig): ScoredWork[] {
		let filtered = works.map((work) => ({
			work,
			score:
				work.score + (config.categoryAdjustments?.[work.type as keyof CategoryAdjustments] ?? 0)
		}));

		// Category Adjustments
		// Enforce positive score after adjustments
		filtered = filtered.filter((candidate) => candidate.score > 0);

		// Work Score Range
		if (config.workScoreRange) {
			const minScore = config.workScoreRange[0];
			const maxScore =
				config.workScoreRange[1] === MAX_WORK_SCORE_ROUNDED ? Infinity : config.workScoreRange[1];
			filtered = filtered.filter(
				(candidate) => candidate.score >= minScore && candidate.score <= maxScore
			);
		}

		// Year Range Filter
		if (config.yearFilter) {
			const [startYear, endYear] = config.yearFilter;
			filtered = filtered.filter(({ work }) => {
				const begin = work.begin_year ?? work.composer.birth_year;
				const end = work.end_year ?? work.composer.death_year ?? new Date().getFullYear();
				return begin >= startYear && end <= endYear;
			});
		}

		// Name Filter
		if (config.nameFilter && config.nameFilter.length > 0) {
			filtered = filtered.filter(({ work }) => {
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
				filtered = filtered.filter(({ work }) => validIds.has(work.composerGid));
			} else if (cf.mode === 'exclude') {
				const invalidIds = new Set(cf.composers);
				filtered = filtered.filter(({ work }) => !invalidIds.has(work.composerGid));
			} else if (cf.mode === 'notabilityRange') {
				const [startRank, endRank] = cf.range;
				const activeComposerIds = new Set(filtered.map(({ work }) => work.composerGid));
				const activeComposers = this.data.composers.filter((c) => activeComposerIds.has(c.gid));

				const sortedComposers = activeComposers.sort((a, b) => b.score - a.score);
				const allowedIds = new Set(
					sortedComposers.slice(Math.max(0, startRank - 1), endRank).map((c) => c.gid)
				);
				filtered = filtered.filter(({ work }) => allowedIds.has(work.composerGid));
			} else if (cf.mode === 'country') {
				const validCountries = new Set(cf.countries);
				const validIds = new Set(
					[...validCountries].flatMap((country) => this.data.getComposerIdsByCountry(country))
				);
				filtered = filtered.filter(({ work }) => validIds.has(work.composerGid));
			} else if (cf.mode === 'countryExclude') {
				const excludedCountries = new Set(cf.countries);
				const invalidIds = new Set(
					[...excludedCountries].flatMap((country) => this.data.getComposerIdsByCountry(country))
				);
				filtered = filtered.filter(({ work }) => !invalidIds.has(work.composerGid));
			} else if (cf.mode === 'gender') {
				const validIds = new Set(this.data.getComposerIdsByGender(cf.gender));
				filtered = filtered.filter(({ work }) => validIds.has(work.composerGid));
			}
		}

		return filtered;
	}

	/**
	 * Greedily selects works ensuring the maximum array size and max-composer-percentage quotas are met
	 */
	private enforceQuotas(
		manualWorks: ScoredWork[],
		candidateWorks: ScoredWork[],
		config: TracklistConfig
	): ScoredWork[] {
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
		for (const { work } of manualWorks) {
			composerCounts.set(work.composerGid, (composerCounts.get(work.composerGid) || 0) + 1);
		}

		// Greedily pick the best remaining candidates
		for (const candidate of candidateWorks) {
			if (finalWorks.length >= targetCount) break;

			const currentCount = composerCounts.get(candidate.work.composerGid) || 0;
			if (currentCount >= limitPerComposer) continue;

			finalWorks.push(candidate);
			composerCounts.set(candidate.work.composerGid, currentCount + 1);
		}

		return finalWorks;
	}

	/**
	 * Enforces limits on parts-per-work.
	 */
	private applyTrackLimits(works: ScoredWork[], maxTracks?: number): CandidateWork[] {
		return works.map(({ work, score }) => {
			const partsCopy = [...work.parts];

			if (maxTracks === undefined || partsCopy.length <= maxTracks) {
				return { work, score, parts: partsCopy };
			}

			if (maxTracks === 1 && partsCopy.every((p) => p.score > 98)) {
				const limitedWork = work.cloneWithParts([partsCopy[0]]);
				return { work: limitedWork, score, parts: [...limitedWork.parts] };
			}

			const sortedParts = partsCopy
				.map((part, index) => ({ part, index }))
				.sort((a, b) => b.part.score - a.part.score)
				.slice(0, maxTracks)
				.sort((a, b) => a.index - b.index) // Restore original order
				.map((item) => item.part);

			const limitedWork = work.cloneWithParts(sortedParts);
			return { work: limitedWork, score, parts: [...limitedWork.parts] };
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
		const candidate = weightedRandom(
			this.filteredWorks,
			(i) => (useWeighting ? i.score : 1),
			this.rng
		);

		// Step 2: Check if work has parts
		if (candidate.parts.length === 0) {
			this.removeEmptyWork(candidate);
			return this.sample();
		}

		// Step 3: Select part with  score weighting and POP it
		const partIndex = weightedRandom(
			candidate.parts.map((_, i) => i),
			(i) => (useWeighting ? candidate.parts[i].score : 1),
			this.rng
		);
		const part = candidate.parts[partIndex];

		// Pop selected part to prevent duplication
		candidate.parts.splice(partIndex, 1);
		if (candidate.parts.length === 0) {
			this.removeEmptyWork(candidate);
		}

		return {
			composer: candidate.work.composer,
			work: candidate.work,
			part
		};
	}

	private removeEmptyWork(work: CandidateWork) {
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

	getSamplePool(): TracklistSamplePool {
		return {
			works: this.filteredWorks.map(({ work, score, parts }) => ({
				work,
				score,
				parts: [...parts]
			})),
			composers: [...this.filteredComposers],
			usePopularityWeighting: this.tracklist.config.enablePopularityWeighting ?? false
		};
	}

	/**
	 * Gets the filtered data for preview purposes
	 */
	getFilteredData(): { composers: Composer[]; works: Work[] } {
		return { composers: this.filteredComposers, works: this.filteredWorks.map(({ work }) => work) };
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
			this.filteredWorks.every(({ work }) => work.type === this.filteredWorks[0].work.type)
		) {
			disabled.push('type');
		}

		let minYear = Infinity;
		let maxYear = -Infinity;

		for (const { work } of this.filteredWorks) {
			const begin = work.begin_year ?? work.composer.birth_year;
			const end = work.end_year ?? work.composer.death_year ?? new Date().getFullYear();

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
