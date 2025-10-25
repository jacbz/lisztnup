export interface Part {
	name: string;
	deezer: number;
	score: number; // Weight for the part
}

export interface Work {
	gid: string;
	composer: string; // Composer GID
	name: string;
	type: string; // e.g., "ballet", "piano", etc.
	begin_year: number;
	end_year: number;
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
	| 'unknown';

export interface WorksByCategory {
	vocal: Work[];
	chamber: Work[];
	orchestral: Work[];
	piano: Work[];
	concerto: Work[];
	opera: Work[];
	ballet: Work[];
	unknown: Work[];
}
