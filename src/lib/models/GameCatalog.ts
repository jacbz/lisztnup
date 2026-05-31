export type ComposerGender = 'male' | 'female';

export type WorkCategory =
	| 'vocal'
	| 'chamber'
	| 'orchestral'
	| 'piano'
	| 'concerto'
	| 'opera'
	| 'ballet'
	| 'organ'
	| 'solo';

export const ALL_WORK_CATEGORIES: WorkCategory[] = [
	'orchestral',
	'concerto',
	'piano',
	'chamber',
	'ballet',
	'solo',
	'organ',
	'opera',
	'vocal'
];

export interface RawComposer {
	gid: string;
	name: string;
	birth_year: number;
	death_year: number | null;
	gender: ComposerGender;
	country: string;
	score: number;
}

export interface RawPart {
	gid: string;
	name: string;
	deezer: number[];
	score: number;
}

export interface RawWork {
	gid: string;
	composer_gid?: string;
	composer?: string;
	name: string;
	type: WorkCategory;
	begin_year: number | null;
	end_year: number | null;
	score: number;
	parts: RawPart[];
}

export interface RawLisztnupData {
	composers: RawComposer[];
	works: RawWork[];
}

export interface Track {
	composer: Composer;
	work: Work;
	part: Part;
}

export class Composer {
	readonly gid: string;
	readonly name: string;
	readonly birth_year: number;
	readonly death_year: number | null;
	readonly gender: ComposerGender;
	readonly country: string;
	readonly score: number;

	constructor(raw: RawComposer) {
		this.gid = raw.gid;
		this.name = raw.name;
		this.birth_year = raw.birth_year;
		this.death_year = raw.death_year;
		this.gender = raw.gender;
		this.country = raw.country;
		this.score = raw.score;
	}
}

export class Work {
	readonly gid: string;
	readonly composer: Composer;
	readonly composerGid: string;
	readonly name: string;
	readonly type: WorkCategory;
	readonly begin_year: number | null;
	readonly end_year: number | null;
	readonly score: number;
	readonly parts: readonly Part[];

	constructor(raw: RawWork, composer: Composer) {
		const composerGid = getRawWorkComposerGid(raw);
		if (!composerGid) {
			throw new Error(`Work ${raw.gid} is missing composer_gid`);
		}

		this.gid = raw.gid;
		this.composer = composer;
		this.composerGid = composerGid;
		this.name = raw.name;
		this.type = raw.type;
		this.begin_year = raw.begin_year;
		this.end_year = raw.end_year;
		this.score = raw.score;
		this.parts = raw.parts.map((part) => new Part(part, this));
	}

	cloneWithParts(parts: readonly Part[]): Work {
		return new Work(
			{
				gid: this.gid,
				composer_gid: this.composerGid,
				name: this.name,
				type: this.type,
				begin_year: this.begin_year,
				end_year: this.end_year,
				score: this.score,
				parts: parts.map((part) => part.toRaw())
			},
			this.composer
		);
	}
}

export class Part {
	readonly gid: string;
	readonly work: Work;
	readonly workGid: string;
	readonly name: string;
	readonly deezer: readonly number[];
	readonly score: number;

	constructor(raw: RawPart, work: Work) {
		this.gid = raw.gid;
		this.work = work;
		this.workGid = work.gid;
		this.name = raw.name;
		this.deezer = raw.deezer;
		this.score = raw.score;
	}

	toRaw(): RawPart {
		return {
			gid: this.gid,
			name: this.name,
			deezer: [...this.deezer],
			score: this.score
		};
	}
}

export class GameCatalog {
	readonly composers: readonly Composer[];
	readonly works: readonly Work[];
	readonly parts: readonly Part[];

	private readonly composerByGid: Map<string, Composer>;
	private readonly workByGid: Map<string, Work>;
	private readonly partByGid: Map<string, Part>;
	private readonly workByPartGid: Map<string, Work>;
	private readonly worksByComposerGid: Map<string, readonly Work[]>;
	private readonly workCountByComposerGid: ReadonlyMap<string, number>;
	private readonly composersWithWorks: readonly Composer[];
	private readonly composerIdsByCountry: Map<string, readonly string[]>;
	private readonly composerIdsByGender: Map<ComposerGender, readonly string[]>;
	private readonly countryCounts: readonly { code: string; count: number }[];

	private constructor(composers: Composer[], works: Work[]) {
		this.composers = composers;
		this.works = works;
		this.parts = works.flatMap((work) => [...work.parts]);

		this.composerByGid = new Map(composers.map((composer) => [composer.gid, composer]));
		this.workByGid = new Map(works.map((work) => [work.gid, work]));
		this.partByGid = new Map(this.parts.map((part) => [part.gid, part]));
		this.workByPartGid = new Map(this.parts.map((part) => [part.gid, part.work]));

		const worksByComposer = new Map<string, Work[]>();
		for (const work of works) {
			const composerWorks = worksByComposer.get(work.composerGid) ?? [];
			composerWorks.push(work);
			worksByComposer.set(work.composerGid, composerWorks);
		}
		this.worksByComposerGid = worksByComposer;
		this.workCountByComposerGid = new Map(
			[...worksByComposer.entries()].map(([composerGid, composerWorks]) => [
				composerGid,
				composerWorks.length
			])
		);
		this.composersWithWorks = composers.filter((composer) => worksByComposer.has(composer.gid));

		const countries = new Map<string, string[]>();
		const genders = new Map<ComposerGender, string[]>();
		for (const composer of composers) {
			if (composer.country) {
				const countryIds = countries.get(composer.country) ?? [];
				countryIds.push(composer.gid);
				countries.set(composer.country, countryIds);
			}

			const genderIds = genders.get(composer.gender) ?? [];
			genderIds.push(composer.gid);
			genders.set(composer.gender, genderIds);
		}

		this.composerIdsByCountry = countries;
		this.composerIdsByGender = genders;
		this.countryCounts = [...countries.entries()].map(([code, ids]) => ({
			code,
			count: ids.length
		}));
	}

	static fromRaw(raw: RawLisztnupData): GameCatalog {
		const composers = raw.composers.map((composer) => new Composer(composer));
		const composerByGid = new Map(composers.map((composer) => [composer.gid, composer]));

		const works = raw.works.map((rawWork) => {
			const composerGid = getRawWorkComposerGid(rawWork);
			const composer = composerGid ? composerByGid.get(composerGid) : undefined;
			if (!composer) {
				throw new Error(`Work ${rawWork.gid} references unknown composer ${composerGid}`);
			}
			return new Work(rawWork, composer);
		});

		return new GameCatalog(composers, works);
	}

	getComposer(gid: string): Composer | undefined {
		return this.composerByGid.get(gid);
	}

	getWork(gid: string): Work | undefined {
		return this.workByGid.get(gid);
	}

	getPart(gid: string): Part | undefined {
		return this.partByGid.get(gid);
	}

	getWorkForPart(partGid: string): Work | undefined {
		return this.workByPartGid.get(partGid);
	}

	getComposerForWork(workGid: string): Composer | undefined {
		return this.getWork(workGid)?.composer;
	}

	getWorksByComposer(composerGid: string): readonly Work[] {
		return this.worksByComposerGid.get(composerGid) ?? [];
	}

	getWorkCountByComposerGid(): ReadonlyMap<string, number> {
		return this.workCountByComposerGid;
	}

	getComposersWithWorks(): readonly Composer[] {
		return this.composersWithWorks;
	}

	getComposerIdsByCountry(country: string): readonly string[] {
		return this.composerIdsByCountry.get(country) ?? [];
	}

	getComposerIdsByGender(gender: ComposerGender): readonly string[] {
		return this.composerIdsByGender.get(gender) ?? [];
	}

	getCountriesWithComposerCounts(): readonly { code: string; count: number }[] {
		return this.countryCounts;
	}

	resolveTrack(workGid: string, partGid: string) {
		const work = this.getWork(workGid);
		if (!work) return null;

		const part = work.parts.find((candidate) => candidate.gid === partGid);
		if (!part) return null;

		return { composer: work.composer, work, part };
	}

	resolveTrackForPart(partGid: string) {
		const part = this.getPart(partGid);
		const work = part ? this.getWorkForPart(partGid) : undefined;
		if (!part || !work) return null;

		return { composer: work.composer, work, part };
	}

	resolveTimelineTracks(gids: readonly (readonly [string, string] | string)[]) {
		const tracks = [];
		for (const gid of gids) {
			const track =
				typeof gid === 'string' ? this.resolveTrackForPart(gid) : this.resolveTrack(gid[0], gid[1]);
			if (track) tracks.push(track);
		}
		return tracks;
	}
}

function getRawWorkComposerGid(raw: RawWork): string | undefined {
	return raw.composer_gid ?? raw.composer;
}
