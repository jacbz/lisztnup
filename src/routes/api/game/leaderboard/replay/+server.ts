import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { logger } from '$lib/server/logging';

/**
 * Fetches one replay blob on demand.
 *
 * The leaderboard list carries only a `has_log` flag, so a 500-row records view
 * no longer drags 500 serialized timelines across the wire. The blob is fetched
 * when a viewer actually opens a replay — the rare case.
 */
export const GET: RequestHandler = async ({ url, platform }) => {
	const rawId = url.searchParams.get('id');
	const scoreId = rawId != null && /^\d+$/.test(rawId) ? Number(rawId) : null;

	if (scoreId == null) {
		return json({ log: null }, { status: 400 });
	}
	if (!platform?.env?.DB) {
		return json({ log: null }, { status: 503 });
	}

	try {
		const row = await platform.env.DB.prepare(
			`SELECT log FROM timeline_score_logs WHERE score_id = ?1`
		)
			.bind(scoreId)
			.first<{ log: string }>();

		if (!row) return json({ log: null }, { status: 404 });

		return json(
			{ log: row.log },
			// Replays are immutable once written, so they cache indefinitely.
			{ headers: { 'cache-control': 'public, max-age=31536000, immutable' } }
		);
	} catch (error) {
		await logger.error(platform.env.DB, 'Leaderboard replay GET server error', {
			context: { error: error instanceof Error ? error.message : String(error), scoreId }
		});
		return json({ log: null }, { status: 500 });
	}
};
