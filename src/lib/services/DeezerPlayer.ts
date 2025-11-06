interface DeezerTrackData {
	id: number;
	title: string;
	title_short: string;
	duration: number;
	preview: string;
	artist: {
		name: string;
	};
	contributors?: Array<{
		name: string;
	}>;
}

// Extend window interface for JSONP callbacks
interface WindowWithDeezerCallbacks extends Window {
	[key: string]: unknown;
}

declare const window: WindowWithDeezerCallbacks;

export class DeezerPlayer {
	private audio: HTMLAudioElement | null = null;
	private currentTrackId: number | null = null;
	private currentTrackData: DeezerTrackData | null = null;
	private volume: number = 1.0;
	private trackLength: number = 20; // Default 20 seconds
	private fadeIntervalId: number | null = null;
	private readonly FADE_DURATION = 300; // Fade duration in milliseconds
	private readonly FADE_STEPS = 30; // Number of steps in fade animation

	/**
	 * Sets the track length limit in seconds (5-30)
	 */
	setTrackLength(seconds: number): void {
		this.trackLength = Math.max(5, Math.min(30, seconds));
	}

	/**
	 * Gets the current track length limit
	 */
	getTrackLength(): number {
		return this.trackLength;
	}

	/**
	 * Cancels any ongoing fade animation
	 */
	private cancelFade(): void {
		if (this.fadeIntervalId !== null) {
			clearInterval(this.fadeIntervalId);
			this.fadeIntervalId = null;
		}
	}

	/**
	 * Fades volume from current to target over FADE_DURATION
	 */
	private fadeVolume(targetVolume: number, onComplete?: () => void): void {
		if (!this.audio) return;

		this.cancelFade();

		const startVolume = this.audio.volume;
		const volumeDelta = targetVolume - startVolume;
		const stepDuration = this.FADE_DURATION / this.FADE_STEPS;
		let currentStep = 0;

		this.fadeIntervalId = window.setInterval(() => {
			if (!this.audio) {
				this.cancelFade();
				return;
			}

			currentStep++;
			const progress = currentStep / this.FADE_STEPS;

			if (progress >= 1) {
				this.audio.volume = targetVolume;
				this.cancelFade();
				if (onComplete) onComplete();
			} else {
				this.audio.volume = startVolume + volumeDelta * progress;
			}
		}, stepDuration);
	}

	/**
	 * Fetches track metadata from Deezer API using JSONP to bypass CORS
	 */
	private async fetchTrackData(deezerId: number): Promise<DeezerTrackData | null> {
		return new Promise((resolve) => {
			// Generate unique callback name
			const callbackName = `deezerCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

			// Create script element for JSONP
			const script = document.createElement('script');
			const timeout = setTimeout(() => {
				cleanup();
				console.error(`DeezerPlayer: Timeout fetching track ${deezerId}`);
				resolve(null);
			}, 10000); // 10 second timeout

			// Define global callback function
			window[callbackName] = (data: DeezerTrackData) => {
				cleanup();
				resolve(data);
			};

			// Cleanup function
			const cleanup = () => {
				clearTimeout(timeout);
				delete window[callbackName];
				if (script.parentNode) {
					script.parentNode.removeChild(script);
				}
			};

			// Handle script load errors
			script.onerror = () => {
				cleanup();
				console.error(`DeezerPlayer: Failed to fetch track ${deezerId}`);
				resolve(null);
			};

			// Set script source with JSONP callback parameter
			script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${callbackName}`;

			// Append script to DOM to trigger request
			document.head.appendChild(script);
		});
	}

	/**
	 * Loads a track by Deezer ID
	 */
	async load(deezerId: number, ignoreTrackLength: boolean = false): Promise<void> {
		this.currentTrackId = deezerId;

		// Fetch track metadata
		this.currentTrackData = await this.fetchTrackData(deezerId);

		if (!this.currentTrackData) {
			console.warn('DeezerPlayer: Could not load track data');
			throw new Error('Failed to fetch track data');
		}

		// Check if preview URL exists
		if (!this.currentTrackData.preview) {
			console.warn('DeezerPlayer: Track has no preview URL');
			throw new Error('Track has no preview URL');
		}

		// Create or reset audio element
		if (this.audio) {
			this.audio.pause();
			this.audio.src = '';
		}

		this.audio = new Audio(this.currentTrackData.preview);
		this.audio.volume = 0.1; // Start at 0.1 for fade in
		this.audio.loop = false;

		// Add event listener to enforce track length limit with fade out (only if not ignoring)
		if (!ignoreTrackLength) {
			this.audio.addEventListener('timeupdate', () => {
				if (this.audio && this.audio.currentTime >= this.trackLength - this.FADE_DURATION / 1000) {
					// Start fade out before reaching the limit
					if (!this.audio.paused && this.fadeIntervalId === null) {
						this.fadeVolume(0, () => {
							if (this.audio) {
								this.audio.pause();
								this.audio.currentTime = this.trackLength;
							}
						});
					}
				}
			});
		}
	}

	/**
	 * Plays the current track
	 */
	async play(): Promise<void> {
		if (!this.audio) {
			console.warn('DeezerPlayer: No track loaded');
			return;
		}

		try {
			// Start from beginning if at the end
			if (this.audio.currentTime >= this.trackLength) {
				this.audio.currentTime = 0;
			}

			// Set volume to 0.1 before playing
			this.audio.volume = 0.1;
			await this.audio.play();

			// Fade in to target volume
			this.fadeVolume(this.volume);
		} catch (error) {
			console.error('DeezerPlayer: Error playing track', error);
		}
	}

	/**
	 * Pauses the current track (no fade out - immediate stop)
	 */
	pause(): void {
		if (!this.audio) {
			console.warn('DeezerPlayer: No track loaded');
			return;
		}

		this.cancelFade();
		this.audio.pause();
		this.audio.volume = this.volume; // Restore volume for next play
	}

	/**
	 * Seeks to a specific time in the track
	 */
	seek(time: number): void {
		if (!this.audio) {
			console.warn('DeezerPlayer: No track loaded');
			return;
		}

		this.audio.currentTime = time;
	}

	/**
	 * Sets the volume (0.0 to 1.0)
	 */
	setVolume(volume: number): void {
		this.volume = Math.max(0, Math.min(1, volume));
		// Only update audio volume if not currently fading
		if (this.audio && this.fadeIntervalId === null) {
			this.audio.volume = this.volume;
		}
	}

	/**
	 * Gets the current volume
	 */
	getVolume(): number {
		return this.volume;
	}

	/**
	 * Gets the current track ID
	 */
	getCurrentTrackId(): number | null {
		return this.currentTrackId;
	}

	/**
	 * Gets the artist name from the loaded track data
	 */
	getArtists(): string[] {
		const data = this.currentTrackData;
		if (!data) return [];

		// If contributors array exists and has entries, use their names joined
		const contributors = data.contributors;
		if (Array.isArray(contributors) && contributors.length > 0) {
			return contributors.map((contributor) => contributor.name);
		}

		return data.artist?.name ? [data.artist.name] : [];
	}

	/**
	 * Gets the full track data
	 */
	getTrackData(): DeezerTrackData | null {
		return this.currentTrackData;
	}

	/**
	 * Checks if audio is currently playing
	 */
	isPlaying(): boolean {
		return this.audio ? !this.audio.paused : false;
	}

	/**
	 * Gets current playback time in seconds
	 */
	getCurrentTime(): number {
		return this.audio?.currentTime || 0;
	}

	/**
	 * Gets track duration in seconds
	 */
	getDuration(ignoreTrackLength = false): number {
		const actualDuration = this.audio?.duration || 0;
		if (ignoreTrackLength) {
			return actualDuration;
		}
		return Math.min(actualDuration, this.trackLength);
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		this.cancelFade();
		if (this.audio) {
			this.audio.pause();
			this.audio.src = '';
			this.audio = null;
		}
		this.currentTrackData = null;
		this.currentTrackId = null;
	}
}

// Export singleton instance
export const deezerPlayer = new DeezerPlayer();
