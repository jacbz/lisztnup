import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/server/logging';

interface TrackStatsRow {
	played: number;
	correct: number | null;
}

/**
 * Reads the `track_stats` rollup, maintained by the events endpoint alongside
 * every placement insert. This is a primary-key lookup — one row — where it
 * used to aggregate across all of `timeline_placements` once per card played.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const partGid = url.searchParams.get('partGid')?.trim();
	if (!partGid) {
		return json({ stats: null });
	}

	if (!platform?.env?.DB) {
		return json({ stats: { played: 0, correct: 0 } });
	}

	try {
		const row = await platform.env.DB.prepare(
			`SELECT played, correct FROM track_stats WHERE part_gid = ?1`
		)
			.bind(partGid)
			.first<TrackStatsRow>();

		// A track nobody has placed yet simply has no rollup row.
		return json({
			stats: {
				played: Number(row?.played ?? 0),
				correct: Number(row?.correct ?? 0)
			}
		});
	} catch (error) {
		await logger.error(platform.env.DB, 'Track stats GET server error', {
			context: { error: error instanceof Error ? error.message : String(error), partGid }
		});
		return json({ stats: null });
	}
};
