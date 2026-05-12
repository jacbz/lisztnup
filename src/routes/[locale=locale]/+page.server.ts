import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
	const db = platform?.env?.DB;
	if (!db) return { pageviews24h: null };

	try {
		const row = await db
			.prepare(
				`SELECT COUNT(DISTINCT user_hash) as count FROM pageviews WHERE timestamp > datetime('now', '-24 hours')`
			)
			.first<{ count: number }>();
		return { pageviews24h: row?.count ?? null };
	} catch (e) {
		console.error('Failed to query pageview count:', e);
		return { pageviews24h: null };
	}
};
