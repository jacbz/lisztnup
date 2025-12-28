<script lang="ts">
	import { _ } from 'svelte-i18n';
	import type { GameMode } from '$lib/types';
	import Popup from '../primitives/Popup.svelte';
	import Trophy from 'lucide-svelte/icons/trophy';
	import Crown from 'lucide-svelte/icons/crown';
	import LifeBuoy from 'lucide-svelte/icons/life-buoy';

	interface Props {
		visible?: boolean;
		mode?: GameMode | null;
		onClose?: () => void;
	}

	let { visible = false, mode = null, onClose = () => {} }: Props = $props();

	const modeConfig = $derived.by(() => {
		if (!mode) return null;

		const configs = {
			classic: {
				icon: Trophy,
				color: '#f59e0b',
				steps: [
					{
						image: '/screenshots/classic-1.jpg',
						titleKey: 'modes.classic.step1.title',
						descKey: 'modes.classic.step1.desc'
					},
					{
						image: '/screenshots/classic-2.jpg',
						titleKey: 'modes.classic.step2.title',
						descKey: 'modes.classic.step2.desc'
					},
					{
						image: '/screenshots/classic-3.jpg',
						titleKey: 'modes.classic.step3.title',
						descKey: 'modes.classic.step3.desc'
					}
				]
			},
			buzzer: {
				icon: Crown,
				color: '#ef4444',
				steps: [
					{
						image: '/screenshots/buzzer-1.jpg',
						titleKey: 'modes.buzzer.step1.title',
						descKey: 'modes.buzzer.step1.desc'
					},
					{
						image: '/screenshots/buzzer-2.jpg',
						titleKey: 'modes.buzzer.step2.title',
						descKey: 'modes.buzzer.step2.desc'
					},
					{
						image: '/screenshots/buzzer-3.jpg',
						titleKey: 'modes.buzzer.step3.title',
						descKey: 'modes.buzzer.step3.desc'
					}
				]
			},
			bingo: {
				icon: LifeBuoy,
				color: '#a855f7',
				steps: [
					{
						image: '/screenshots/bingo-1.jpg',
						titleKey: 'modes.bingo.step1.title',
						descKey: 'modes.bingo.step1.desc'
					},
					{
						image: '/screenshots/bingo-2.jpg',
						titleKey: 'modes.bingo.step2.title',
						descKey: 'modes.bingo.step2.desc'
					},
					{
						image: '/screenshots/bingo-3.jpg',
						titleKey: 'modes.bingo.step3.title',
						descKey: 'modes.bingo.step3.desc'
					}
				]
			}
		};

		return configs[mode];
	});
</script>

<Popup
	{visible}
	{onClose}
	width="3xl"
	padding="lg"
	borderColor={modeConfig?.color}
	shadowColor={modeConfig?.color}
>
	{#if mode && modeConfig}
		<!-- Header -->
		<div class="mb-8 flex flex-col items-center gap-4 md:flex-row">
			{#if modeConfig.icon}
				{@const Icon = modeConfig.icon}
				<div style="color: {modeConfig.color};">
					<Icon class="h-12 w-12" strokeWidth={2} />
				</div>
			{/if}
			<div>
				<h2 class="text-3xl font-bold" style="color: {modeConfig.color};">
					{$_(`modes.${mode}.name`)}
				</h2>
				<p class="mt-1 text-lg text-slate-400">
					{$_(`modes.${mode}.description`)}
				</p>
			</div>
			{#if modeConfig.icon}
				{@const Icon = modeConfig.icon}
				<div class="hidden md:block" style="color: {modeConfig.color};">
					<Icon class="h-12 w-12" strokeWidth={2} />
				</div>
			{/if}
		</div>

		<!-- Steps -->
		<div class="space-y-8">
			{#each modeConfig.steps as step, index (index)}
				<div class="flex flex-col gap-4 md:flex-row md:items-start">
					<!-- Number and Title Row (mobile) / Number Column (desktop) -->
					<div class="flex items-center gap-3 md:block">
						<div
							class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-bold"
							style="border-color: {modeConfig.color}; color: {modeConfig.color};"
						>
							{index + 1}
						</div>
						<h3 class="text-xl font-bold text-white md:hidden">
							{$_(step.titleKey)}
						</h3>
					</div>

					<!-- Text Content -->
					<div class="flex-1">
						<h3 class="mb-2 hidden text-xl font-bold text-white md:block">
							{$_(step.titleKey)}
						</h3>
						<p class="text-slate-400">
							{$_(step.descKey)}
						</p>
					</div>

					<!-- Screenshot -->
					<div class="w-full shrink-0 md:w-64">
						<div
							class="overflow-hidden rounded-lg border-2 bg-slate-800"
							style="border-color: {modeConfig.color}40;"
						>
							<img
								src={step.image}
								alt={$_(step.titleKey)}
								class="h-auto w-full"
								onerror={(e) => {
									const target = e.currentTarget;
									if (target instanceof HTMLImageElement && target.parentElement) {
										target.parentElement.style.display = 'none';
									}
								}}
							/>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</Popup>
