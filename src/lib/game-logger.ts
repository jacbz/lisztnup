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
	private endpoint = '/api/game/events';

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
	public startGame(
		mode: string,
		tracklistId: string,
		locale: string,
		gameInfo: Record<string, any> | null = null
	) {
		this.sessionId = generateSessionId();
		this.dispatch({
			type: 'game_start',
			sessionId: this.sessionId,
			mode,
			tracklistId,
			locale,
			gameInfo
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
	public endGame(
		state: 'completed' | 'abandoned' = 'abandoned',
		gameInfo: Record<string, any> | null = null
	) {
		if (!this.sessionId) return;

		this.dispatch({
			type: 'game_end',
			sessionId: this.sessionId,
			state,
			gameInfo: gameInfo || {}
		});

		// Unset session ID so we do not pollute later.
		this.sessionId = null;
	}

	/**
	 * Send a problem report to the server.
	 */
	public async reportProblem(data: Record<string, any>) {
		const payload = {
			sessionId: this.sessionId,
			...data
		};

		try {
			const response = await fetch('/api/game/reports', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			return response.ok;
		} catch (e) {
			console.error('Failed to send problem report', e);
			return false;
		}
	}

	/**
	 * Send feedback to the server.
	 */
	public async sendFeedback(message: string) {
		const payload = {
			sessionId: this.sessionId,
			message
		};

		try {
			const response = await fetch('/api/game/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			return response.ok;
		} catch (e) {
			console.error('Failed to send feedback', e);
			return false;
		}
	}

	public getSessionId() {
		return this.sessionId;
	}
}

export const analytics = new GameAnalytics();
