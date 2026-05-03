export interface LeaderboardEntry {
	player_name: string | null;
	score: number;
	cards: number;
	accuracy: number;
	country?: string;
	timestamp?: string;
	is_me?: boolean;
	timeline?: string | null;
}
