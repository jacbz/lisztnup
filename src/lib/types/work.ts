export interface Part {
	name: string;
	deezer: number[]; // Array of Deezer IDs
	score: number; // Weight for the part
}

export interface Work {
	gid: string;
	composer: string; // Composer GID
	name: string;
	type: string; // e.g., "ballet", "piano", etc.
	begin_year: number | null;
	end_year: number | null;
	score: number; // Weight for the work
	parts: Part[];
}

export type WorkCategory =
	| 'vocal'
	| 'chamber'
	| 'orchestral'
	| 'piano'
	| 'concerto'
	| 'opera'
	| 'ballet'
	| 'other';

export interface WorksByCategory {
	vocal: Work[];
	chamber: Work[];
	orchestral: Work[];
	piano: Work[];
	concerto: Work[];
	opera: Work[];
	ballet: Work[];
	other: Work[];
}
