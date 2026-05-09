export interface TimelineReplayTurn {
	part: string;
	index: number | null;
	ok: boolean;
	seconds: number | null;
	points: number;
	streak: number;
	score: number;
	year?: number; // Optional for backward compatibility with older logs
}

export interface TimelineReplayLog {
	v: 1;
	initial: string | null;
	completionBonus: number;
	turns: TimelineReplayTurn[];
}
