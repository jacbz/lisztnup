interface DeezerTrackData {
	id: number;
	title: string;
	title_short: string;
	duration: number;
	preview: string;
	artist: {
		id: number;
		name: string;
		picture: string;
		picture_small: string;
		picture_medium: string;
		picture_big: string;
		picture_xl: string;
	};
	album: {
		id: number;
		title: string;
		cover: string;
		cover_small: string;
		cover_medium: string;
		cover_big: string;
		cover_xl: string;
	};
}

export class DeezerPlayer {
	private audio: HTMLAudioElement | null = null;
	private currentTrackId: number | null = null;
	private currentTrackData: DeezerTrackData | null = null;
	private volume: number = 1.0;

	/**
	 * Fetches track metadata from Deezer API
	 */
	private async fetchTrackData(deezerId: number): Promise<DeezerTrackData | null> {
		try {
			const response = await fetch(`https://api.deezer.com/track/${deezerId}`);
			if (!response.ok) {
				console.error(`DeezerPlayer: Failed to fetch track ${deezerId}`);
				return null;
			}
			const data = await response.json();
			return data;
		} catch (error) {
			console.error('DeezerPlayer: Error fetching track data', error);
			return null;
		}
	}

	/**
	 * Loads a track by Deezer ID
	 */
	async load(deezerId: number): Promise<void> {
		this.currentTrackId = deezerId;

		// Fetch track metadata
		this.currentTrackData = await this.fetchTrackData(deezerId);

		if (!this.currentTrackData) {
			console.warn('DeezerPlayer: Could not load track data');
			return;
		}

		// Create or reset audio element
		if (this.audio) {
			this.audio.pause();
			this.audio.src = '';
		}

		this.audio = new Audio(this.currentTrackData.preview);
		this.audio.volume = this.volume;
		this.audio.loop = false;
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
			await this.audio.play();
		} catch (error) {
			console.error('DeezerPlayer: Error playing track', error);
		}
	}

	/**
	 * Pauses the current track
	 */
	pause(): void {
		if (!this.audio) {
			console.warn('DeezerPlayer: No track loaded');
			return;
		}

		this.audio.pause();
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
		if (this.audio) {
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
	getArtistName(): string | null {
		return this.currentTrackData?.artist.name || null;
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
	getDuration(): number {
		return this.audio?.duration || 0;
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
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
