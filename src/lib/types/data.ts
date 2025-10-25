import type { Composer } from './composer';
import type { WorksByCategory } from './work';

export interface LisztnupData {
	composers: Composer[];
	works: WorksByCategory;
}
