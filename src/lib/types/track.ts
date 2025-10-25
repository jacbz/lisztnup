import type { Composer } from './composer';
import type { Work, Part } from './work';

export interface Track {
	composer: Composer;
	work: Work;
	part: Part;
}
