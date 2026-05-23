<script lang="ts">
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import ChevronUp from 'lucide-svelte/icons/chevron-up';
	import Globe2 from 'lucide-svelte/icons/globe-2';
	import Trophy from 'lucide-svelte/icons/trophy';
	import UserStar from 'lucide-svelte/icons/user-star';
	import { SquareStack } from 'lucide-svelte';
	import { _ } from 'svelte-i18n';
	import { slide } from 'svelte/transition';
	import CountryDropdown from '../primitives/CountryDropdown.svelte';
	import Flag from '../primitives/Flag.svelte';
	import type {
		LeaderboardCountrySummary,
		LeaderboardEntry,
		LeaderboardPeriod,
		LeaderboardRankedScope,
		LeaderboardScope
	} from '$lib/types';
	import { formatDateString } from '$lib/utils';

	const periods: LeaderboardPeriod[] = ['weekly', 'monthly', 'allTime'];
	const rankedScopes: LeaderboardRankedScope[] = ['global', 'national'];

	interface Props {
		entries: LeaderboardEntry[];
		currentLocale: string;
		scope?: LeaderboardScope;
		period?: LeaderboardPeriod;
		countries?: LeaderboardCountrySummary[];
		selectedCountry?: string | null;
		isLoading?: boolean;
		onScopeChange?: (scope: LeaderboardScope) => void;
		onPeriodChange?: (period: LeaderboardPeriod) => void;
		onCountryChange?: (country: string) => void;
		onRecordsClick?: () => void;
		onShowTimeline?: (entry: LeaderboardEntry) => void;
	}

	let {
		entries,
		currentLocale,
		scope = 'global',
		period = 'weekly',
		countries = [],
		selectedCountry = null,
		isLoading = false,
		onScopeChange = () => {},
		onPeriodChange = () => {},
		onCountryChange = () => {},
		onRecordsClick = () => {},
		onShowTimeline = () => {}
	}: Props = $props();

	let showExpanded = $state(false);
	const countryOptions = $derived(
		countries.map((summary) => ({ code: summary.country, count: summary.count }))
	);

	$effect(() => {
		if (entries.length <= 5) {
			showExpanded = false;
		}
	});

	function handlePersonalClick() {
		onScopeChange('personal');
	}

	function handleScopeClick(option: LeaderboardRankedScope) {
		onScopeChange(option);
	}

	function handleCountrySelect(country: string) {
		onCountryChange(country);
	}
</script>

{#snippet tableColgroup()}
	<colgroup>
		<col class="w-6" />
		<col />
		<col class="w-16" />
		<col class="w-15" />
		<col class="w-5" />
	</colgroup>
{/snippet}

{#snippet leaderboardRow(entry: LeaderboardEntry)}
	<tr>
		<td
			class="pr-2 text-center font-bold"
			class:text-cyan-400={entry.is_me}
			class:text-slate-500={!entry.is_me}
		>
			{entry.rank}
		</td>
		<td
			class="max-w-0 truncate"
			class:text-cyan-300={entry.is_me}
			class:text-slate-300={!entry.is_me && entry.player_name}
			class:text-slate-500={!entry.is_me && !entry.player_name}
		>
			<Flag country={entry.country} class="mr-0.5" />
			{entry.player_name ?? $_('leaderboard.anonymous')}
		</td>
		<td
			class="text-right font-bold whitespace-nowrap tabular-nums"
			class:text-cyan-400={entry.is_me}
		>
			{$_('scoring.pts', { values: { points: entry.score.toLocaleString() } })}
		</td>
		<td class="text-right whitespace-nowrap text-slate-500 tabular-nums">
			{formatDateString(entry.timestamp, currentLocale)}
		</td>
		<td class="pl-2">
			<div class="flex">
				{#if entry.log}
					<button
						type="button"
						onclick={() => onShowTimeline(entry)}
						class="cursor-pointer text-slate-500 transition-colors hover:text-cyan-400"
					>
						<SquareStack class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
		</td>
	</tr>
{/snippet}

<div class="mt-1 transition-opacity duration-300" class:opacity-50={isLoading}>
	<div class="mb-2 space-y-1.5">
		<div class="flex items-center justify-between gap-2">
			<span class="text-sm font-semibold text-slate-400">
				{$_(scope === 'personal' ? 'leaderboard.personalTitle' : 'leaderboard.title')}
			</span>
			<div class="flex items-center gap-1 text-[0.66rem] leading-none font-semibold">
				<button
					type="button"
					onclick={handlePersonalClick}
					class="flex w-9 items-center justify-center rounded-full py-1 transition-all {scope ===
					'personal'
						? 'bg-cyan-400 text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.3)]'
						: 'bg-slate-800/80 text-slate-500 hover:bg-slate-700/80 hover:text-slate-200'}"
					aria-pressed={scope === 'personal'}
					aria-label="personal"
					title="personal"
				>
					<UserStar class="h-3 w-3" />
				</button>
				<button
					type="button"
					onclick={onRecordsClick}
					class="flex w-9 items-center justify-center rounded-full bg-slate-800/80 py-1 text-slate-500 transition-all hover:bg-slate-700/80 hover:text-slate-200"
					title={$_('leaderboard.tracklistRecordsTitle')}
					aria-label={$_('leaderboard.tracklistRecordsTitle')}
				>
					<Trophy class="h-3 w-3" />
				</button>
			</div>
		</div>

		{#if scope !== 'personal'}
			<div class="flex items-center gap-3 text-[0.62rem] leading-none font-semibold">
				<div
					class="grid flex-1 grid-cols-3 rounded-full bg-slate-800/70 p-0.5"
					role="group"
					aria-label={$_('leaderboard.periodLabel')}
				>
					{#each periods as option (option)}
						<button
							type="button"
							onclick={() => onPeriodChange(option)}
							class="rounded-full px-1.5 py-1 transition-all {period === option
								? 'bg-cyan-400 text-slate-950'
								: 'text-slate-500 hover:text-slate-200'}"
							aria-pressed={period === option}
						>
							{$_(`leaderboard.period.${option}`)}
						</button>
					{/each}
				</div>

				<div
					class="grid grid-cols-2 rounded-full bg-slate-800/50 p-0.5"
					role="group"
					aria-label={$_('leaderboard.scopeLabel')}
				>
					{#each rankedScopes as option (option)}
						{#if option === 'global'}
							<button
								type="button"
								onclick={() => handleScopeClick(option)}
								class="flex w-9 items-center justify-center rounded-full py-1 transition-all {scope ===
								option
									? 'bg-cyan-400 text-slate-950'
									: 'text-slate-500 hover:text-slate-200'}"
								aria-pressed={scope === option}
								aria-label={option}
								title={option}
							>
								<Globe2 class="h-3 w-3" />
							</button>
						{:else}
							<CountryDropdown
								options={countryOptions}
								value={selectedCountry}
								variant="icon"
								active={scope === 'national'}
								openOn="contextmenu"
								emptyLabel={$_('leaderboard.noScores')}
								ariaLabel="national"
								title="national"
								onTriggerClick={() => handleScopeClick(option)}
								onChange={handleCountrySelect}
							/>
						{/if}
					{/each}
				</div>
			</div>
		{/if}
	</div>
	{#if entries.length === 0 && !isLoading}
		<p class="py-2 text-xs text-slate-500">{$_('leaderboard.noScores')}</p>
	{:else if entries.length > 0}
		<!-- Extract the myEntry logic -->
		{@const myIndex = entries.findIndex((e) => e.is_me)}
		{@const hasMyEntryOutsideTop5 = myIndex > 4}

		<table class="w-full table-fixed border-separate border-spacing-y-1 text-left text-xs">
			{@render tableColgroup()}

			<!-- Top 5 are always visible -->
			<tbody>
				{#each entries.slice(0, 5) as entry, i (i)}
					{@render leaderboardRow(entry)}
				{/each}
			</tbody>

			{#if hasMyEntryOutsideTop5}
				<!-- TOP DRAWER: Animates in rows between rank 5 and myEntry -->
				{#if showExpanded && myIndex > 5}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(5, myIndex) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}

				<!-- Pinned myEntry: Never leaves the DOM, avoiding jump jank completely -->
				<tbody>
					{@render leaderboardRow(entries[myIndex])}
				</tbody>

				<!-- BOTTOM DRAWER: Animates in rows after myEntry -->
				{#if showExpanded && myIndex < entries.length - 1}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(myIndex + 1) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}
			{:else}
				<!-- Fallback: Standard expansion if myEntry is in Top 5 (or doesn't exist) -->
				{#if showExpanded && entries.length > 5}
					<tbody>
						<tr>
							<td colspan="5" class="border-0 p-0">
								<div transition:slide={{ duration: 250 }}>
									<table
										class="-my-1 w-full table-fixed border-separate border-spacing-y-1 text-left text-xs"
									>
										{@render tableColgroup()}
										<tbody>
											{#each entries.slice(5) as entry, i (i)}
												{@render leaderboardRow(entry)}
											{/each}
										</tbody>
									</table>
								</div>
							</td>
						</tr>
					</tbody>
				{/if}
			{/if}
		</table>

		{#if entries.length > 5}
			<button
				type="button"
				onclick={() => (showExpanded = !showExpanded)}
				class="mx-auto mt-1 flex cursor-pointer items-center justify-center rounded-md px-2 py-0.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-400"
			>
				{#if showExpanded}
					<ChevronUp class="h-4 w-4" />
				{:else}
					<ChevronDown class="h-4 w-4" />
				{/if}
			</button>
		{/if}
	{/if}
</div>
