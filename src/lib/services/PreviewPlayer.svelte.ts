import { deezerPlayer, type LoadedPlayableTrack } from './DeezerPlayer';

/**
 * Self-contained audio preview player with Svelte 5 reactive state.
 *
 * Reuses the shared {@link deezerPlayer} pipeline (`preload`) so previews get the same
 * LUFS normalization and leading-silence trim as in-game playback, then plays the
 * resulting asset through its OWN audio graph so it never conflicts with the active
 * game player. Previews always play the full (trimmed) clip — the per-game track-length
 * limit does not apply here.
 *
 * Used by:
 * - **TrackInfo**: replay the revealed track
 * - **TrackTable**: preview tracks while browsing the library
 *
 * Uses a generation counter to safely cancel in-flight async operations
 * when stop()/destroy() is called during a pending play().
 */
export class PreviewPlayer {
	isPlaying = $state(false);
	progress = $state(0);
	currentDeezerId = $state<number | null>(null);

	// htmlAudio fallback element (owned by the LoadedPlayableTrack)
	private loaded: LoadedPlayableTrack | null = null;

	// Web Audio graph (created lazily, reused across plays, closed on destroy)
	private audioContext: AudioContext | null = null;
	private sourceNode: AudioBufferSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private playbackStart = 0;

	private progressInterval: number | null = null;
	private generation = 0;

	/**
	 * Loads and plays a track by its Deezer ID.
	 * Stops any currently playing audio first. If stop/destroy is called while
	 * the load is in flight, the stale operation is silently discarded.
	 */
	async play(deezerId: number): Promise<void> {
		console.log('PreviewPlayer: playing Deezer ID', deezerId);

		// If the same track is already playing, toggle it off
		if (this.currentDeezerId === deezerId && this.isPlaying) {
			this.stop();
			return;
		}

		this.stop();

		const currentGeneration = ++this.generation;
		this.currentDeezerId = deezerId;

		let loaded: LoadedPlayableTrack;
		try {
			loaded = await deezerPlayer.preload(deezerId);
		} catch (error) {
			console.error('PreviewPlayer: Error loading track', deezerId, error);
			if (this.generation === currentGeneration) this.currentDeezerId = null;
			return;
		}

		// Bail out if a newer operation has started (stop/destroy/another play)
		if (this.generation !== currentGeneration) {
			loaded.destroy();
			return;
		}

		this.loaded = loaded;

		try {
			if (loaded.mode === 'webAudio' && loaded.audioBuffer) {
				await this.playWebAudio(loaded);
			} else if (loaded.audioElement) {
				await this.playHtmlAudio(loaded);
			} else {
				console.warn('PreviewPlayer: No playable asset for track', deezerId);
				this.stop();
				return;
			}

			// Check again after the async play() call
			if (this.generation !== currentGeneration) {
				this.stop();
				return;
			}

			this.isPlaying = true;
			this.progress = 0;
			this.startProgressTracking();
		} catch (error) {
			console.error('PreviewPlayer: Error playing audio', error);
			if (this.generation === currentGeneration) this.stop();
		}
	}

	private async playWebAudio(loaded: LoadedPlayableTrack): Promise<void> {
		if (!this.audioContext) this.audioContext = new AudioContext();
		const ctx = this.audioContext;
		if (ctx.state === 'suspended') await ctx.resume();

		this.sourceNode = ctx.createBufferSource();
		this.sourceNode.buffer = loaded.audioBuffer;
		this.gainNode = ctx.createGain();
		this.gainNode.gain.value = loaded.gain;
		this.sourceNode.connect(this.gainNode);
		this.gainNode.connect(ctx.destination);

		this.sourceNode.onended = () => this.stop();
		// Start at the music (skip leading silence); play the full trimmed remainder.
		this.sourceNode.start(0, loaded.startOffset);
		this.playbackStart = ctx.currentTime;
	}

	private async playHtmlAudio(loaded: LoadedPlayableTrack): Promise<void> {
		const audio = loaded.audioElement!;
		audio.currentTime = loaded.startOffset;
		audio.addEventListener('ended', () => this.stop(), { once: true });
		await audio.play();
	}

	/**
	 * Stops playback and resets state. Reuses the AudioContext across plays.
	 */
	stop(): void {
		this.generation++;

		if (this.sourceNode) {
			this.sourceNode.onended = null;
			try {
				this.sourceNode.stop();
			} catch {
				// Already stopped.
			}
			this.sourceNode.disconnect();
			this.gainNode?.disconnect();
			this.sourceNode = null;
			this.gainNode = null;
		}

		this.loaded?.destroy();
		this.loaded = null;

		this.stopProgressTracking();
		this.isPlaying = false;
		this.progress = 0;
		this.currentDeezerId = null;
	}

	/**
	 * Stops playback and releases all resources, including the AudioContext.
	 */
	destroy(): void {
		this.stop();
		this.audioContext?.close();
		this.audioContext = null;
	}

	private startProgressTracking(): void {
		this.stopProgressTracking();
		this.progressInterval = window.setInterval(() => {
			const loaded = this.loaded;
			if (!loaded || loaded.duration <= 0) return;

			let elapsed = 0;
			if (this.sourceNode && this.audioContext) {
				elapsed = this.audioContext.currentTime - this.playbackStart;
			} else if (loaded.audioElement) {
				elapsed = loaded.audioElement.currentTime - loaded.startOffset;
			}
			this.progress = Math.min(1, Math.max(0, elapsed / loaded.duration));
		}, 100);
	}

	private stopProgressTracking(): void {
		if (this.progressInterval !== null) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
	}
}
