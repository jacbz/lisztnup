export type LeaderboardPeriod = 'weekly' | 'monthly' | 'allTime';
export type LeaderboardRankedScope = 'global' | 'national';
export type LeaderboardScope = LeaderboardRankedScope | 'personal';

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
	log?: string | null;
}
