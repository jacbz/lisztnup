export interface Composer {
	gid: string;
	name: string; // Sort name, e.g., "Bach, Johann Sebastian"
	birth_year: number;
	death_year: number | null;
	gender: 'male' | 'female';
	country: string;
	score: number; // Significance/popularity score from 0 to 100
}
