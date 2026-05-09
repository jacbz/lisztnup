export interface TimelineReplayTurn {
	part: string;
	index: number | null;
	ok: boolean;
	seconds: number | null;
	points: number;
	/** Streak multiplier at the time of turn completion (e.g. 1.0, 1.1, 1.35, etc.) */
	streak: number;
	score: number;
	year?: number; // Optional for backward compatibility with older logs
}

export interface TimelineReplayLog {
	v: 1;
	initial: string | null;
	score: number;
	completionBonus: number;
	turns: TimelineReplayTurn[];
}
