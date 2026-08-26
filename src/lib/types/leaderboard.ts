export type LeaderboardPeriod = 'weekly' | 'monthly' | 'allTime';
export type LeaderboardRankedScope = 'global' | 'national';
export type LeaderboardScope = LeaderboardRankedScope | 'personal';

export interface LeaderboardCountrySummary {
	country: string;
	count: number;
	bestScore: number;
}

export interface LeaderboardEntry {
	rank: number;
	player_name: string | null;
	score: number;
	attempts: number;
	target: number;
	tracklist_id?: string;
	average_time: number | null;
	longest_streak: number | null;
	country?: string;
	timestamp?: string;
	is_me?: boolean;
	/** Row id in `timeline_scores`; the handle for fetching this entry's replay. */
	score_id?: number;
	/** Whether a replay exists, without shipping it. Fetch via getReplayLog(). */
	has_log?: boolean;
}
