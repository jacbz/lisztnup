export interface ReplayIndexEntry {
	confirmed: boolean;
	correct: boolean | null;
	isDiscarding?: boolean;
}

export interface ReplaySlot<T> {
	index: number;
	previous: T | null;
	next: T | null;
}

export function isReplayTimelineEntry(entry: ReplayIndexEntry): boolean {
	return entry.confirmed && entry.correct !== false && !entry.isDiscarding;
}

export function getReplaySlotForUiIndex<T extends ReplayIndexEntry>(
	entries: readonly T[],
	uiIndex: number
): ReplaySlot<T> {
	const boundedUiIndex = Math.max(0, Math.min(uiIndex, entries.length));
	const index = entries.slice(0, boundedUiIndex).filter(isReplayTimelineEntry).length;
	const replayEntries = entries.filter(
		(entry, entryIndex) => entryIndex !== uiIndex && isReplayTimelineEntry(entry)
	);

	return {
		index,
		previous: replayEntries[index - 1] ?? null,
		next: replayEntries[index] ?? null
	};
}
