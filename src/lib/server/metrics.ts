import type { D1Database } from '@cloudflare/workers-types';

/**
 * Read-through cache for global aggregates that are identical for every visitor
 * and change slowly.
 *
 * The problem this solves: a query like COUNT(DISTINCT user_hash) over a 24h
 * window costs rows proportional to the window's size, and running it inside a
 * `load()` means paying that on every SSR hit — including every bot, which no
 * amount of indexing fixes. Storing the answer makes the read exactly one row.
 *
 * Cloudflare Pages has no Cron Triggers, so the refresh is lazy rather than
 * scheduled: serve whatever is stored, and if it has aged past its TTL kick off
 * a recompute in `waitUntil()` so it never sits in the request's critical path.
 * A stale-but-instant number is the right trade for a vanity counter.
 */

export interface MetricRow {
	value: string;
	updated_at: string;
}

export interface CachedMetricOptions<T> {
	db: D1Database;
	key: string;
	ttlSeconds: number;
	compute: (db: D1Database) => Promise<T>;
	parse: (raw: string) => T | null;
	serialize: (value: T) => string;
	/** Cloudflare execution context; when absent the refresh is skipped, not awaited. */
	waitUntil?: (promise: Promise<unknown>) => void;
}

/**
 * Returns the stored metric, scheduling a background refresh when stale.
 * Never throws — a failed metric must not take down the page that reads it.
 */
export async function getCachedMetric<T>(options: CachedMetricOptions<T>): Promise<T | null> {
	const { db, key, ttlSeconds, compute, parse, serialize, waitUntil } = options;

	let stored: MetricRow | null;
	try {
		stored = await db
			.prepare(`SELECT value, updated_at FROM metrics WHERE key = ?1`)
			.bind(key)
			.first<MetricRow>();
	} catch (e) {
		console.error(`Failed to read metric "${key}":`, e);
		return null;
	}

	const parsed = stored ? parse(stored.value) : null;
	const isStale = !stored || ageInSeconds(stored.updated_at) >= ttlSeconds;

	if (!isStale) return parsed;

	const refresh = async () => {
		try {
			const fresh = await compute(db);
			await db
				.prepare(
					`INSERT INTO metrics (key, value, updated_at)
					 VALUES (?1, ?2, CURRENT_TIMESTAMP)
					 ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP`
				)
				.bind(key, serialize(fresh))
				.run();
		} catch (e) {
			// Leave the stale value in place; the next request retries.
			console.error(`Failed to refresh metric "${key}":`, e);
		}
	};

	if (waitUntil) {
		// Stale-while-revalidate: this request still answers from the old value.
		waitUntil(refresh());
		return parsed;
	}

	// No execution context (dev / preview): compute inline so the value exists.
	try {
		const fresh = await compute(db);
		await refresh();
		return fresh;
	} catch (e) {
		console.error(`Failed to compute metric "${key}":`, e);
		return parsed;
	}
}

function ageInSeconds(updatedAt: string): number {
	const normalized = updatedAt.includes('T') ? updatedAt : `${updatedAt.replace(' ', 'T')}Z`;
	const ms = Date.parse(normalized);
	if (!Number.isFinite(ms)) return Number.POSITIVE_INFINITY;
	return (Date.now() - ms) / 1000;
}

/** Numeric metric convenience wrapper. */
export function getCachedCount(
	db: D1Database,
	key: string,
	ttlSeconds: number,
	compute: (db: D1Database) => Promise<number>,
	waitUntil?: (promise: Promise<unknown>) => void
): Promise<number | null> {
	return getCachedMetric<number>({
		db,
		key,
		ttlSeconds,
		compute,
		parse: (raw) => {
			const parsed = Number(raw);
			return Number.isFinite(parsed) ? parsed : null;
		},
		serialize: (value) => String(value),
		waitUntil
	});
}
