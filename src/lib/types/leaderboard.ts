export interface LeaderboardEntry {
	player_name: string | null;
	score: number;
	attempts: number;
	target: number;
	average_time: number | null;
	longest_streak: number | null;
	country?: string;
	timestamp?: string;
	is_me?: boolean;
	log?: string | null;
}
