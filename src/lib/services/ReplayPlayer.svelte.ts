import { fetchDeezerTrackData } from './DeezerPlayer';

/**
 * Self-contained audio replay player with Svelte 5 reactive state.
 * Used by TrackInfo to replay tracks independently of the main game DeezerPlayer singleton.
 * Each instance manages its own HTMLAudioElement, avoiding conflicts with the game's audio pipeline.
 * Uses a generation counter to safely cancel in-flight async operations on stop/destroy.
 */
export class ReplayPlayer {
	isPlaying = $state(false);
	progress = $state(0);

	private audio: HTMLAudioElement | null = null;
	private progressInterval: number | null = null;
	private generation = 0;

	/**
	 * Loads and plays a track by its Deezer ID.
	 * Stops any currently playing audio first. If stop/destroy is called while
	 * the fetch is in flight, the stale operation is silently discarded.
	 */
	async play(deezerId: number): Promise<void> {
		this.stop();

		const currentGeneration = ++this.generation;

		const trackData = await fetchDeezerTrackData(deezerId);

		// Bail out if a newer operation has started (stop/destroy/another play)
		if (this.generation !== currentGeneration) return;

		if (!trackData?.preview) {
			console.warn('ReplayPlayer: No preview URL available for track', deezerId);
			return;
		}

		this.audio = new Audio(trackData.preview);
		this.audio.crossOrigin = 'anonymous';
		this.audio.addEventListener('ended', () => this.stop(), { once: true });

		try {
			await this.audio.play();

			// Check again after the async play() call
			if (this.generation !== currentGeneration) {
				this.audio?.pause();
				this.audio = null;
				return;
			}

			this.isPlaying = true;
			this.progress = 0;
			this.startProgressTracking();
		} catch (error) {
			console.error('ReplayPlayer: Error playing audio', error);
			if (this.generation === currentGeneration) {
				this.stop();
			}
		}
	}

	/**
	 * Stops playback and resets state.
	 */
	stop(): void {
		this.generation++;
		if (this.audio) {
			this.audio.pause();
			this.audio = null;
		}
		this.stopProgressTracking();
		this.isPlaying = false;
		this.progress = 0;
	}

	/**
	 * Stops playback and releases all resources.
	 */
	destroy(): void {
		this.stop();
	}

	private startProgressTracking(): void {
		this.stopProgressTracking();
		this.progressInterval = window.setInterval(() => {
			if (this.audio && this.audio.duration > 0) {
				this.progress = this.audio.currentTime / this.audio.duration;
			}
		}, 100);
	}

	private stopProgressTracking(): void {
		if (this.progressInterval !== null) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
	}
}
