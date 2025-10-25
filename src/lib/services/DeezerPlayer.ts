export class DeezerPlayer {
	private iframe: HTMLIFrameElement | null = null;
	private currentTrackId: number | null = null;

	/**
	 * Initializes the Deezer player with an iframe element
	 */
	init(iframe: HTMLIFrameElement): void {
		this.iframe = iframe;
	}

	/**
	 * Loads a track by Deezer ID
	 */
	load(deezerId: number): void {
		if (!this.iframe) {
			console.warn('DeezerPlayer: iframe not initialized');
			return;
		}

		this.currentTrackId = deezerId;
		this.iframe.src = `https://widget.deezer.com/widget/auto/track/${deezerId}`;
	}

	/**
	 * Plays the current track
	 */
	play(): void {
		if (!this.iframe) {
			console.warn('DeezerPlayer: iframe not initialized');
			return;
		}

		// Deezer widget auto-plays by default
		// If we need to control playback, we'd use the Deezer widget API
		// For now, just reload the iframe to start playing
		if (this.currentTrackId !== null) {
			this.iframe.src = `https://widget.deezer.com/widget/auto/track/${this.currentTrackId}`;
		}
	}

	/**
	 * Pauses the current track
	 */
	pause(): void {
		if (!this.iframe) {
			console.warn('DeezerPlayer: iframe not initialized');
			return;
		}

		// To pause, we'd need to use the Deezer widget API
		// For simplicity, we can stop playback by setting an empty src
		// Note: This is a workaround; proper implementation would use the widget API
		this.iframe.src = 'about:blank';
	}

	/**
	 * Seeks to a specific time in the track
	 */
	seek(time: number): void {
		// Seeking requires Deezer widget API integration
		// This is a placeholder for future implementation
		console.log(`Seek to ${time}s (not implemented)`);
	}

	/**
	 * Gets the current track ID
	 */
	getCurrentTrackId(): number | null {
		return this.currentTrackId;
	}

	/**
	 * Shows or hides the iframe (for debugging)
	 */
	setVisible(visible: boolean): void {
		if (!this.iframe) {
			return;
		}

		if (visible) {
			this.iframe.style.opacity = '1';
			this.iframe.style.pointerEvents = 'auto';
			this.iframe.style.position = 'fixed';
			this.iframe.style.bottom = '20px';
			this.iframe.style.right = '20px';
			this.iframe.style.zIndex = '1000';
		} else {
			this.iframe.style.opacity = '0';
			this.iframe.style.pointerEvents = 'none';
			this.iframe.style.position = 'fixed';
			this.iframe.style.bottom = '-1000px';
		}
	}
}

// Export singleton instance
export const deezerPlayer = new DeezerPlayer();
