import type { PageServerLoad } from './$types';
import { loadHomeStats } from '$lib/server/homeStats';

export const load: PageServerLoad = async ({ platform }) => {
	return loadHomeStats(platform?.env?.DB, platform?.context?.waitUntil.bind(platform.context));
};
