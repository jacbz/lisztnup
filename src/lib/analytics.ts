/**
 * A lightweight, deeply-integrated Analytics driver specifically for our game logic.
 * Ensures the network requests never block the main JS thread while playing.
 */

// Basic generator for simple secure random UUIDs without heavy crypto deps
function generateSessionId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	// Fallback for weird runtimes
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

class GameAnalytics {
	private sessionId: string | null = null;
	private endpoint = '/api/analytics/events';

	/**
	 * Fire-and-forget payload dispatcher using the browser's Background Sync
	 * or standard fetch, prioritizing Keep-Alive.
	 */
	private dispatch(payload: Record<string, any>) {
		try {
			if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
				// Reliable transmission even when the tab is closing
				navigator.sendBeacon(
					this.endpoint,
					new Blob([JSON.stringify(payload)], { type: 'application/json' })
				);
			} else {
				fetch(this.endpoint, {
					method: 'POST',
					keepalive: true,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				}).catch((e) => console.log('Analytics dropped', e));
			}
		} catch (e) {
			// Fail completely silently on the client
		}
	}

	/**
	 * Initiate a totally new game logging session.
	 * Should be triggered directly before standard gameplay mounts.
	 */
	public startSession(mode: string, tracklistId: string) {
		this.sessionId = generateSessionId();
		this.dispatch({
			type: 'session_start',
			sessionId: this.sessionId,
			mode,
			tracklistId
		});
	}

	/**
	 * Log a placement action immediately.
	 */
	public logPlacement(workGid: string, placedCorrectly: boolean) {
		// Do not force log if no session exists or user has adblock explicitly hard-blocking the file
		if (!this.sessionId) return;

		this.dispatch({
			type: 'timeline_placement',
			sessionId: this.sessionId,
			workGid,
			placedCorrectly
		});
	}

	/**
	 * Conclude playing, saving state back.
	 */
	public endSession() {
		if (!this.sessionId) return;

		this.dispatch({
			type: 'session_end',
			sessionId: this.sessionId
		});

		// Unset session ID so we do not pollute later.
		this.sessionId = null;
	}
}

export const analytics = new GameAnalytics();
