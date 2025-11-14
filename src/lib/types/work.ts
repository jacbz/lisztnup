export interface Part {
	name: string;
	deezer: number[]; // Array of Deezer IDs
	score: number; // Weight for the part
}

export interface Work {
	gid: string;
	composer: string; // Composer GID
	name: string;
	type: WorkCategory;
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
	| 'solo'
	| 'other';
