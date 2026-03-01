<script lang="ts">
	import type { Composer, Work } from '$lib/types';
	import { formatComposerName, formatLifespan, getComposerLastName } from '$lib/utils';
	import { _, locale } from 'svelte-i18n';
	import { fade } from 'svelte/transition';
	import Search from 'lucide-svelte/icons/search';
	import X from 'lucide-svelte/icons/x';

	interface Props {
		composers: Composer[];
		works: Work[];
		onSelectComposer?: (composerGid: string) => void;
	}

	let { composers = [], works = [], onSelectComposer = () => {} }: Props = $props();

	// Filter state
	let searchQuery = $state('');
	let birthYearFrom = $state('');
	let birthYearTo = $state('');
	let deathYearFrom = $state('');
	let deathYearTo = $state('');
	let selectedCountry = $state('');
	let selectedGender = $state<'male' | 'female' | ''>('');
	let showFilters = $state(false);

	// Normalize strings for search: strip diacritics and collapse to lower-case
	function normalizeString(s: string | null | undefined): string {
		if (!s) return '';
		return s
			.normalize('NFKD')
			.replace(/\p{M}/gu, '') // remove diacritic marks
			.toLowerCase();
	}

	// Build composer entries with work counts
	const entries = $derived.by(() => {
		const workCountMap = new Map<string, number>();
		works.forEach((w) => {
			workCountMap.set(w.composer, (workCountMap.get(w.composer) || 0) + 1);
		});

		return composers
			.filter((c) => workCountMap.has(c.gid))
			.map((c) => ({
				gid: c.gid,
				name: getComposerLastName(c.name),
				lastName: getComposerLastName(c.name),
				fullName: formatComposerName(c.name),
				sortName: c.name,
				normalizedName: normalizeString(getComposerLastName(c.name)),
				normalizedSortName: normalizeString(c.name),
				score: c.score,
				workCount: workCountMap.get(c.gid) || 0,
				birthYear: c.birth_year,
				deathYear: c.death_year,
				country: c.country,
				gender: c.gender
			}))
			.sort((a, b) => b.score - a.score);
	});

	// Compute global year bounds for placeholder hints
	const yearBounds = $derived.by(() => {
		if (entries.length === 0) return { minBirth: 0, maxBirth: 0, minDeath: 0, maxDeath: 0 };
		const births = entries.map((e) => e.birthYear);
		const deaths = entries.filter((e) => e.deathYear !== null).map((e) => e.deathYear!);
		return {
			minBirth: Math.min(...births),
			maxBirth: Math.max(...births),
			minDeath: deaths.length > 0 ? Math.min(...deaths) : 0,
			maxDeath: deaths.length > 0 ? Math.max(...deaths) : 0
		};
	});

	// Resolve alpha-2 country codes to localized display names
	const countryDisplayNames = $derived.by(() => {
		const loc = $locale || 'en';
		try {
			return new Intl.DisplayNames([loc], { type: 'region' });
		} catch {
			return new Intl.DisplayNames(['en'], { type: 'region' });
		}
	});

	function countryName(code: string): string {
		try {
			return countryDisplayNames.of(code) ?? code;
		} catch {
			return code;
		}
	}

	// Build country list with counts (sorted by localized name)
	const countryOptions = $derived.by(() => {
		const countMap = new Map<string, number>();
		entries.forEach((e) => {
			if (e.country) {
				countMap.set(e.country, (countMap.get(e.country) || 0) + 1);
			}
		});
		return [...countMap.entries()]
			.map(([code, count]) => ({ code, name: countryName(code), count }))
			.sort((a, b) => a.name.localeCompare(b.name));
	});

	const hasActiveFilters = $derived(
		searchQuery.trim() !== '' ||
			birthYearFrom !== '' ||
			birthYearTo !== '' ||
			deathYearFrom !== '' ||
			deathYearTo !== '' ||
			selectedCountry !== '' ||
			selectedGender !== ''
	);

	// Build a display-name map: for each last name group, the highest-scored composer
	// keeps the short last-name display; subsequent composers with the same last
	// name get their full name shown. Efficient: single linear pass over `entries`.
	function buildDisplayNameMap(entries: Array<any>): Map<string, string> {
		const map = new Map<string, string>();
		const seen = new Set<string>();

		for (let i = 0; i < entries.length; i++) {
			const e = entries[i];
			const last = e.lastName ?? e.name;
			if (!seen.has(last)) {
				map.set(e.gid, last);
				seen.add(last);
			} else {
				map.set(e.gid, e.fullName);
			}
		}

		return map;
	}

	const displayNameMap = $derived.by(() => buildDisplayNameMap(entries));

	function clearFilters() {
		searchQuery = '';
		birthYearFrom = '';
		birthYearTo = '';
		deathYearFrom = '';
		deathYearTo = '';
		selectedCountry = '';
		selectedGender = '';
	}

	// Apply search, country, gender, and year filters
	const filteredEntries = $derived.by(() => {
		let result = entries;

		// Country filter
		if (selectedCountry) {
			result = result.filter((e) => e.country === selectedCountry);
		}

		// Gender filter
		if (selectedGender) {
			result = result.filter((e) => e.gender === selectedGender);
		}

		// Search filter
		const rawQuery = searchQuery.trim();
		const query = normalizeString(rawQuery);
		if (query) {
			result = result.filter(
				(e) => e.normalizedName.includes(query) || e.normalizedSortName.includes(query)
			);
		}

		// Birth year filter
		const bFrom = birthYearFrom !== '' ? parseInt(birthYearFrom) : null;
		const bTo = birthYearTo !== '' ? parseInt(birthYearTo) : null;
		if (bFrom !== null && !isNaN(bFrom)) {
			result = result.filter((e) => e.birthYear >= bFrom);
		}
		if (bTo !== null && !isNaN(bTo)) {
			result = result.filter((e) => e.birthYear <= bTo);
		}

		// Death year filter
		const dFrom = deathYearFrom !== '' ? parseInt(deathYearFrom) : null;
		const dTo = deathYearTo !== '' ? parseInt(deathYearTo) : null;
		if (dFrom !== null && !isNaN(dFrom)) {
			result = result.filter((e) => e.deathYear !== null && e.deathYear >= dFrom);
		}
		if (dTo !== null && !isNaN(dTo)) {
			result = result.filter((e) => e.deathYear !== null && e.deathYear <= dTo);
		}

		return result;
	});

	// Lay out the word cloud: sorted by descending score so the most prominent names appear at top
	const cloudItems = $derived.by(() => {
		if (filteredEntries.length === 0) return [];

		// Use global score range (from all entries, not filtered) so sizes stay consistent
		const minScore = Math.min(...entries.map((e) => e.score));
		const maxScore = Math.max(...entries.map((e) => e.score));
		const range = maxScore - minScore || 1;

		const MIN_SIZE = 0.7;
		const MAX_SIZE = 2.2;

		return filteredEntries.map((e) => {
			const normalized = (e.score - minScore) / range;
			// Use a power curve to make the size distribution more dramatic
			const curved = Math.pow(normalized, 0.6);
			const size = MIN_SIZE + curved * (MAX_SIZE - MIN_SIZE);

			// Font weight: scaled like tracklist editor (200 + score * 7, capped at 900)
			const fontWeight = Math.min(900, 200 + e.score * 7);

			// Opacity: lower-scored composers are slightly more transparent
			const opacity = 0.45 + curved * 0.55;

			return {
				...e,
				// prefer the computed display name (last-name for top of a last-name group,
				// full name for subsequent composers with the same last name)
				name: displayNameMap.get(e.gid) || e.name,
				size,
				fontWeight,
				opacity
			};
		});
	});

	// Compute color from score normalized position
	function getColor(score: number, minScore: number, maxScore: number): string {
		const range = maxScore - minScore || 1;
		const normalized = (score - minScore) / range;

		if (normalized < 0.3) {
			return 'text-cyan-400';
		} else if (normalized < 0.6) {
			return 'text-cyan-300';
		} else if (normalized < 0.85) {
			return 'text-cyan-200';
		}
		return 'text-cyan-100';
	}

	const minScore = $derived(entries.length > 0 ? Math.min(...entries.map((e) => e.score)) : 0);
	const maxScore = $derived(entries.length > 0 ? Math.max(...entries.map((e) => e.score)) : 100);
</script>

<!-- Search & filters bar -->
<div class="px-4 py-3 md:px-8">
	<div class="mx-auto max-w-5xl space-y-2.5">
		<!-- Row 1: Search -->
		<div class="relative">
			<Search
				class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500"
			/>
			<input
				type="search"
				bind:value={searchQuery}
				placeholder={$_('libraryViewer.searchComposers')}
				class="w-full rounded border border-slate-700 bg-slate-800/60 py-2 pr-3 pl-9 text-sm text-slate-200 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400 focus:outline-none"
			/>
		</div>

		<!-- Row 2: Filters -->
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<!-- Country dropdown -->
			<select
				bind:value={selectedCountry}
				class="rounded-full border-none px-2.5 py-1 text-xs font-medium transition-all duration-150 focus:ring-1 focus:ring-cyan-400/50 focus:outline-none {selectedCountry
					? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50'
					: 'bg-slate-700/50 text-slate-400'}"
				class:w-30={selectedCountry === ''}
			>
				<option value="">{$_('libraryViewer.allCountries')}</option>
				{#each countryOptions as opt}
					<option value={opt.code}>{opt.name} ({opt.count})</option>
				{/each}
			</select>

			<!-- Year filter toggle -->
			<button
				type="button"
				onclick={() => (showFilters = !showFilters)}
				class="rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150 {showFilters
					? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50'
					: 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-300'}"
			>
				{$_('libraryViewer.yearFilters')}
			</button>

			<!-- Gender segmented control -->
			<div class="flex items-center overflow-hidden rounded-full bg-slate-700/50">
				<button
					type="button"
					onclick={() => (selectedGender = selectedGender === 'male' ? '' : 'male')}
					class="rounded-l-full px-2.5 py-1 text-xs font-medium transition-all duration-150 {selectedGender ===
					'male'
						? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50 ring-inset'
						: 'text-slate-400 hover:text-slate-300'}"
				>
					{$_('libraryViewer.male')}
				</button>
				<div class="h-3 w-px bg-slate-600/50"></div>
				<button
					type="button"
					onclick={() => (selectedGender = selectedGender === 'female' ? '' : 'female')}
					class="rounded-r-full px-2.5 py-1 text-xs font-medium transition-all duration-150 {selectedGender ===
					'female'
						? 'bg-cyan-400/20 text-cyan-300 ring-1 ring-cyan-400/50 ring-inset'
						: 'text-slate-400 hover:text-slate-300'}"
				>
					{$_('libraryViewer.female')}
				</button>
			</div>

			<!-- Clear filters -->
			{#if hasActiveFilters}
				<button
					type="button"
					onclick={clearFilters}
					class="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-500 transition-colors hover:text-slate-300"
				>
					<X class="h-3 w-3" />
					{$_('libraryViewer.clearFilters')}
				</button>
			{/if}

			<!-- Result count (inline with filters) -->
			{#if hasActiveFilters}
				<span class="ml-auto text-xs text-slate-500">
					{filteredEntries.length} / {entries.length}
				</span>
			{/if}
		</div>

		<!-- Year filter inputs (expandable) -->
		{#if showFilters}
			<div class="grid grid-cols-2 gap-x-6 gap-y-2" in:fade={{ duration: 150 }}>
				<!-- Birth year -->
				<div class="flex items-center gap-2">
					<span class="w-10 shrink-0 text-xs text-slate-500">{$_('libraryViewer.born')}</span>
					<input
						type="number"
						bind:value={birthYearFrom}
						placeholder={String(yearBounds.minBirth)}
						class="w-full min-w-0 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-400 focus:outline-none"
					/>
					<span class="text-xs text-slate-600">–</span>
					<input
						type="number"
						bind:value={birthYearTo}
						placeholder={String(yearBounds.maxBirth)}
						class="w-full min-w-0 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-400 focus:outline-none"
					/>
				</div>

				<!-- Death year -->
				<div class="flex items-center gap-2">
					<span class="w-10 shrink-0 text-xs text-slate-500">{$_('libraryViewer.died')}</span>
					<input
						type="number"
						bind:value={deathYearFrom}
						placeholder={String(yearBounds.minDeath)}
						class="w-full min-w-0 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-400 focus:outline-none"
					/>
					<span class="text-xs text-slate-600">–</span>
					<input
						type="number"
						bind:value={deathYearTo}
						placeholder={String(yearBounds.maxDeath)}
						class="w-full min-w-0 rounded border border-slate-700 bg-slate-800/60 px-2 py-1 text-xs text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-400 focus:outline-none"
					/>
				</div>
			</div>
		{/if}
	</div>
</div>

<!-- Word cloud -->
<div
	class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-6 md:px-8 md:py-8"
	in:fade={{ duration: 200 }}
>
	{#each cloudItems as item, i}
		<button
			type="button"
			onclick={() => onSelectComposer(item.gid)}
			class="inline-block cursor-pointer rounded-md px-1.5 py-0.5 whitespace-nowrap transition-all duration-200 hover:scale-110 hover:bg-cyan-400/10 focus:outline-none active:scale-95 {getColor(
				item.score,
				minScore,
				maxScore
			)}"
			style="font-size: {item.size}rem; font-weight: {item.fontWeight}; opacity: {item.opacity};"
			title="{item.fullName} ({formatLifespan(item.birthYear, item.deathYear)}) — {item.workCount}"
			in:fade={{ duration: 300, delay: Math.min(i * 3, 600) }}
		>
			{item.name}
		</button>
	{/each}

	{#if filteredEntries.length === 0 && hasActiveFilters}
		<p class="py-8 text-slate-500">{$_('trackTable.noData')}</p>
	{/if}
</div>
