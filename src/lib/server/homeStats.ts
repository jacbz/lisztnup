import type { D1Database } from '@cloudflare/workers-types';
import { getCachedCount } from './metrics';

/**
 * Shared by `/` and `/[locale]`, which render the same home screen and
 * previously carried byte-identical copies of this query.
 */

const PAGEVIEWS_24H_KEY = 'pageviews_24h_unique';
const PAGEVIEWS_24H_TTL_SECONDS = 300;

export interface HomeStats {
	pageviews24h: number | null;
}

export async function loadHomeStats(
	db: D1Database | undefined,
	waitUntil?: (promise: Promise<unknown>) => void
): Promise<HomeStats> {
	if (!db) return { pageviews24h: null };

	const pageviews24h = await getCachedCount(
		db,
		PAGEVIEWS_24H_KEY,
		PAGEVIEWS_24H_TTL_SECONDS,
		async (database) => {
			// INDEXED BY is deliberate. Two covering indexes can serve this query:
			// idx_pageviews_dedupe yields rows pre-ordered by user_hash, letting
			// SQLite skip a temp B-tree for COUNT(DISTINCT) — so the planner picks
			// it, and scans every row in the table. idx_pageviews_recent instead
			// range-seeks just the 24h window. D1 bills rows read, not sort work,
			// which inverts the planner's cost model: the temp B-tree is far
			// cheaper than the ~140x extra rows. The hint also fails loudly if the
			// index is ever dropped, rather than silently costing that much again.
			const row = await database
				.prepare(
					`SELECT COUNT(DISTINCT user_hash) AS count
					 FROM pageviews INDEXED BY idx_pageviews_recent
					 WHERE timestamp > datetime('now', '-24 hours')`
				)
				.first<{ count: number }>();
			return Number(row?.count ?? 0);
		},
		waitUntil
	);

	return { pageviews24h };
}
