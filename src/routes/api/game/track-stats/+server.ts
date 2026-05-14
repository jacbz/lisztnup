import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/server/logging';

const MIN_VISIBLE_PLAYS = 5;

interface TrackStatsRow {
	played: number;
	correct: number | null;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const partGid = url.searchParams.get('partGid')?.trim();
	if (!partGid) {
		return json({ stats: null });
	}

	if (!platform?.env?.DB) {
		return json({ stats: null });
	}

	try {
		const row = await platform.env.DB.prepare(
			`SELECT COUNT(*) AS played,
				SUM(CASE WHEN placed_correctly THEN 1 ELSE 0 END) AS correct
			 FROM timeline_placements
			 WHERE part_gid = ?1`
		)
			.bind(partGid)
			.first<TrackStatsRow>();

		const played = Number(row?.played ?? 0);
		if (played < MIN_VISIBLE_PLAYS) {
			return json({ stats: null });
		}

		const correct = Number(row?.correct ?? 0);
		return json({
			stats: {
				played,
				correctPercent: Math.round((correct / played) * 100)
			}
		});
	} catch (error) {
		await logger.error(platform.env.DB, 'Track stats GET server error', {
			context: { error: error instanceof Error ? error.message : String(error), partGid }
		});
		return json({ stats: null });
	}
};
