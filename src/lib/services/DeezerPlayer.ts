import { writable, type Readable, get } from 'svelte/store';
import { waitForOnline } from '$lib/stores/networkStatus';
import { calculateGain, calculateLUFS, detectLeadingSilence } from './audioProcessing';

const FADE_DURATION = 0.3;
const FETCH_TIMEOUT_MS = 15_000; // 15s timeout for audio data fetch
const AUDIO_PRELOAD_TIMEOUT_MS = 15_000; // 15s timeout for HTML audio preload

/**
 * Error subclass for network-related failures.
 * Allows callers to distinguish transient connectivity issues from
 * permanent errors (e.g. track not found on Deezer).
 */
export class NetworkError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'NetworkError';
	}
}

export interface DeezerTrackData {
	id: number;
	title: string;
	preview: string;
	artist: { name: string };
	contributors?: Array<{ name: string }>;
}

export interface LoadedPlayableTrack {
	deezerId: number;
	data: DeezerTrackData;
	mode: 'webAudio' | 'htmlAudio';
	gain: number;
	/** Leading silence (seconds) skipped at playback start. */
	startOffset: number;
	/** Playable duration in seconds = full decoded duration − startOffset. */
	duration: number;
	audioBuffer: AudioBuffer | null;
	audioElement: HTMLAudioElement | null;
	destroy: () => void;
}

interface WindowWithDeezerCallbacks extends Window {
	[key: string]: unknown;
}

declare const window: WindowWithDeezerCallbacks;

export const playerState = writable({
	isPlaying: false,
	isLoading: false,
	progress: 0,
	track: null as DeezerTrackData | null,
	analyserNode: null as AnalyserNode | null
});

/**
 * Fetches track metadata from the Deezer API via JSONP.
 * @param deezerId The Deezer track ID.
 * @returns The track data, or null if the fetch fails.
 */
export async function fetchDeezerTrackData(
	deezerId: number,
	options?: { throwOnNetworkError?: boolean }
): Promise<DeezerTrackData | null> {
	return new Promise((resolve, reject) => {
		const callbackName = `deezerCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
		const script = document.createElement('script');
		const timeout = setTimeout(() => {
			cleanup();
			console.error(`DeezerPlayer: Timeout fetching track ${deezerId}`);
			if (options?.throwOnNetworkError) {
				reject(new NetworkError(`Timeout fetching Deezer metadata for track ${deezerId}`));
				return;
			}
			resolve(null);
		}, 10000);

		window[callbackName] = (data: DeezerTrackData) => {
			cleanup();
			if (data) {
				resolve(data);
			} else {
				console.error(`DeezerPlayer: Error fetching track ${deezerId}`);
				resolve(null);
			}
		};

		const cleanup = () => {
			clearTimeout(timeout);
			delete window[callbackName];
			script.parentNode?.removeChild(script);
		};

		script.onerror = () => {
			cleanup();
			console.error(`DeezerPlayer: Failed to fetch track ${deezerId}`);
			if (options?.throwOnNetworkError) {
				reject(new NetworkError(`Failed to fetch Deezer metadata for track ${deezerId}`));
				return;
			}
			resolve(null);
		};

		script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${callbackName}`;
		document.head.appendChild(script);
	});
}

class DeezerPlayer {
	// Web Audio API properties (used when normalization is enabled)
	private audioContext: AudioContext | null = null;
	private audioBuffer: AudioBuffer | null = null;
	private sourceNode: AudioBufferSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private analyserNode: AnalyserNode | null = null;

	// HTML Audio Element properties (used when normalization is disabled)
	private audioElement: HTMLAudioElement | null = null;

	// HTML Audio event listener references (for cleanup)
	private boundHandleEnded: (() => void) | null = null;
	private boundHandleTimeUpdate: (() => void) | null = null;

	// Common properties
	private currentTrackData: DeezerTrackData | null = null;
	private activeLoadedTrack: LoadedPlayableTrack | null = null;
	private onPlaybackEndCallback: (() => void) | null = null;

	private progressInterval: number | null = null;
	private playbackStartTime = 0;

	private trackLength: number = 30; // 30s previews from Deezer
	private ignoreTrackLength: boolean = false; // If true, always use full 30s duration
	private loadPromise: Promise<void> | null = null;

	/**
	 * Generation counter for load cancellation.
	 * Incremented on every load() call so that a stale _load() can detect
	 * it has been superseded and abort without corrupting singleton state.
	 */
	private loadGeneration = 0;

	private enableAudioNormalization: boolean = false;

	/**
	 * Sets the track length limit in seconds.
	 * @param seconds The desired track length (clamped between 5 and 30).
	 */
	setTrackLength(seconds: number): void {
		this.trackLength = Math.max(5, Math.min(30, seconds));
	}

	/**
	 * Gets the current track length limit in seconds.
	 * @returns The current track length.
	 */
	getTrackLength(): number {
		return this.trackLength;
	}

	/**
	 * Sets whether to ignore the custom track length and always use the full 30s preview.
	 * @param ignore If true, the full 30s preview is always used.
	 */
	setIgnoreTrackLength(ignore: boolean): void {
		this.ignoreTrackLength = ignore;
	}

	/**
	 * Enables or disables Web Audio API-based LUFS normalization.
	 * @param enable If true, audio is processed for volume normalization.
	 */
	setEnableAudioNormalization(enable: boolean): void {
		this.enableAudioNormalization = enable;
	}

	private supportsVolumeControl(): boolean {
		const audio = document.createElement('audio');
		const originalVolume = audio.volume;

		// Try to set a different volume
		audio.volume = 0.5;

		// Check if it actually changed
		const supportsVolume = audio.volume !== originalVolume;

		return supportsVolume;
	}

	private getAudioContext(): AudioContext {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		return this.audioContext;
	}

	private async fetchTrackData(deezerId: number): Promise<DeezerTrackData | null> {
		return fetchDeezerTrackData(deezerId);
	}

	/**
	 * Loads a track by its Deezer ID, preparing it for playback.
	 * This involves fetching track metadata and pre-loading the audio.
	 * @param deezerId The Deezer track ID.
	 */
	async load(deezerId: number): Promise<void> {
		this.destroy();
		const generation = ++this.loadGeneration;
		playerState.update((s) => ({ ...s, isLoading: true }));
		try {
			const loadPromise = this.preload(deezerId).then((loadedTrack) => {
				if (this.loadGeneration !== generation) {
					loadedTrack.destroy();
					return;
				}
				this.setLoadedTrack(loadedTrack);
			});
			this.loadPromise = loadPromise;
			await loadPromise;
			// Only clear if we are still the active generation
			if (this.loadGeneration === generation) {
				this.loadPromise = null;
			}
		} finally {
			if (this.loadGeneration === generation) {
				playerState.update((s) => ({ ...s, isLoading: false }));
			}
		}
	}

	/**
	 * Preloads a Deezer track without mutating the active player state.
	 * The returned asset can be held in a buffer and later passed to playLoaded().
	 */
	async preload(deezerId: number): Promise<LoadedPlayableTrack> {
		return this._preload(deezerId);
	}

	/**
	 * Fetches a URL with a timeout. Throws NetworkError on timeout or fetch failure.
	 */
	private async fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(url, { signal: controller.signal });
			if (!response.ok) {
				throw new NetworkError(`HTTP ${response.status} fetching ${url}`);
			}
			return response;
		} catch (error) {
			if (error instanceof NetworkError) throw error;
			const msg =
				error instanceof DOMException && error.name === 'AbortError'
					? `Fetch timed out after ${timeoutMs}ms: ${url}`
					: `Network error fetching ${url}`;
			throw new NetworkError(msg, error);
		} finally {
			clearTimeout(timer);
		}
	}

	/**
	 * Preloads an HTMLAudioElement with a timeout.
	 * Throws NetworkError if the audio cannot be loaded in time.
	 */
	private preloadAudioElement(audio: HTMLAudioElement, timeoutMs: number): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			let settled = false;
			const timer = setTimeout(() => {
				settled = true;
				cleanup();
				reject(new NetworkError(`Audio preload timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			const cleanup = () => {
				clearTimeout(timer);
				audio.removeEventListener('canplaythrough', handleCanPlayThrough);
				audio.removeEventListener('error', handleError);
			};

			const handleCanPlayThrough = () => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve();
			};

			const handleError = (e: Event) => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(new NetworkError('Audio element failed to load', e));
			};

			audio.addEventListener('canplaythrough', handleCanPlayThrough);
			audio.addEventListener('error', handleError);
			audio.load();
		});
	}

	private async _preload(deezerId: number): Promise<LoadedPlayableTrack> {
		try {
			const supportsVolumeControl = this.supportsVolumeControl();
			console.debug('[DeezerPlayer] preload started', {
				deezerId,
				enableAudioNormalization: this.enableAudioNormalization,
				supportsVolumeControl
			});

			// If offline, wait until back online before attempting load
			if (typeof navigator !== 'undefined' && !navigator.onLine) {
				console.debug('[DeezerPlayer] offline; waiting before preload', { deezerId });
				await waitForOnline();
			}

			const currentTrackData = await fetchDeezerTrackData(deezerId, {
				throwOnNetworkError: true
			});
			if (!currentTrackData || !currentTrackData.preview) {
				throw new Error('Track data or preview URL not available.');
			}

			const trackData = currentTrackData;

			// Decode the preview for analysis: silence-trim offset always, plus LUFS when we
			// normalize. Required for Web Audio playback (normalization on); best-effort
			// otherwise so a network/decode hiccup never breaks plain fallback playback.
			let audioBuffer: AudioBuffer | null = null;
			try {
				const response = await this.fetchWithTimeout(trackData.preview, FETCH_TIMEOUT_MS);
				const arrayBuffer = await response.arrayBuffer();
				const audioContext = this.getAudioContext();
				audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			} catch (error) {
				if (this.enableAudioNormalization) throw error; // Web Audio playback needs the buffer.
				console.debug('[DeezerPlayer] analysis decode failed; playing untrimmed', {
					deezerId,
					error
				});
			}

			// Leading-silence trim offset (0 when no buffer or no meaningful silence).
			const startOffset = audioBuffer ? detectLeadingSilence(audioBuffer) : 0;

			// Web Audio API mode: play the decoded buffer with a GainNode for normalization.
			if (this.enableAudioNormalization && audioBuffer) {
				const lufs = await calculateLUFS(audioBuffer);
				console.debug(`[DeezerPlayer] LUFS for track ${trackData.id}: ${lufs.toFixed(2)}`);
				const gain = calculateGain(lufs);
				const duration = Math.max(0, audioBuffer.duration - startOffset);
				console.debug('[DeezerPlayer] preload ready', {
					deezerId,
					mode: 'webAudio',
					duration,
					startOffset,
					gain
				});
				return {
					deezerId,
					data: trackData,
					mode: 'webAudio',
					gain,
					startOffset,
					duration,
					audioBuffer,
					audioElement: null,
					destroy: () => {}
				};
			}

			// HTML Audio Element mode (normalization off). Translate gain to volume where the
			// platform supports it; on iOS (no volume control) play at native level.
			const audioElement = new Audio(trackData.preview);
			audioElement.crossOrigin = 'anonymous';
			await this.preloadAudioElement(audioElement, AUDIO_PRELOAD_TIMEOUT_MS);

			let gain = 1;
			if (audioBuffer && supportsVolumeControl) {
				const lufs = await calculateLUFS(audioBuffer);
				console.debug(`[DeezerPlayer] LUFS for track ${trackData.id}: ${lufs.toFixed(2)}`);
				gain = calculateGain(lufs);
				// gain of 2 → volume 1.0, gain of 1 → volume 0.5
				const volume = Math.min(1, gain / 2);
				audioElement.volume = volume;
				console.debug(
					`[DeezerPlayer] HTML Audio mode: gain ${gain.toFixed(2)} → volume ${volume.toFixed(2)}`
				);
			}

			const duration = Math.max(0, (audioElement.duration || 30) - startOffset);
			console.debug('[DeezerPlayer] preload ready', {
				deezerId,
				mode: 'htmlAudio',
				duration,
				startOffset,
				gain
			});
			return {
				deezerId,
				data: trackData,
				mode: 'htmlAudio',
				gain,
				startOffset,
				duration,
				audioBuffer: null,
				audioElement,
				destroy: () => {
					audioElement.pause();
					audioElement.removeAttribute('src');
					audioElement.load();
				}
			};
		} catch (error) {
			console.error('DeezerPlayer: Error loading track', error);
			throw error;
		}
	}

	private setLoadedTrack(loadedTrack: LoadedPlayableTrack): void {
		this.stop();
		this.activeLoadedTrack = loadedTrack;
		this.currentTrackData = loadedTrack.data;
		this.audioBuffer = loadedTrack.audioBuffer;
		this.audioElement = loadedTrack.audioElement;
		this.gainNode = null;
		playerState.update((s) => ({ ...s, track: loadedTrack.data }));
	}

	async playLoaded(loadedTrack: LoadedPlayableTrack): Promise<void> {
		if (this.activeLoadedTrack !== loadedTrack) {
			this.setLoadedTrack(loadedTrack);
		}
		await this.play();
	}

	/**
	 * The amount of audio (seconds) to actually play for the active track.
	 * Buzzer mode (ignoreTrackLength) plays the full clip; otherwise the configurable
	 * track-length setting caps it. Bounded by the track's dynamic playable duration so
	 * we never request more audio than exists after the silence trim.
	 */
	private getEffectiveTrackLength(): number {
		const playable = this.activeLoadedTrack?.duration ?? this.trackLength;
		return this.ignoreTrackLength ? playable : Math.min(this.trackLength, playable);
	}

	/**
	 * Starts playing the loaded track from the beginning.
	 */
	async play(): Promise<void> {
		if (this.loadPromise) {
			await this.loadPromise;
		}

		if (this.activeLoadedTrack?.mode === 'webAudio') {
			// Web Audio API mode
			if (!this.audioBuffer || !this.activeLoadedTrack) {
				console.warn('DeezerPlayer: No track loaded or ready.');
				return;
			}

			if (this.sourceNode) {
				// Already playing
				return;
			}

			const audioContext = this.getAudioContext();

			// Resume AudioContext if it's suspended
			if (audioContext.state === 'suspended') {
				await audioContext.resume();
			}

			this.sourceNode = audioContext.createBufferSource();
			this.sourceNode.buffer = this.audioBuffer;

			this.analyserNode = audioContext.createAnalyser();
			this.analyserNode.fftSize = 2048;
			this.gainNode = audioContext.createGain();
			this.gainNode.gain.value = this.activeLoadedTrack.gain;

			this.sourceNode.connect(this.analyserNode);
			this.analyserNode.connect(this.gainNode);
			this.gainNode.connect(audioContext.destination);

			// Fade in
			const initialGain = this.gainNode.gain.value;
			this.gainNode.gain.setValueAtTime(0, audioContext.currentTime);
			this.gainNode.gain.linearRampToValueAtTime(
				initialGain,
				audioContext.currentTime + FADE_DURATION
			);

			// Start at the music (skipping leading silence) and play the dynamic length.
			this.sourceNode.start(0, this.activeLoadedTrack.startOffset, this.getEffectiveTrackLength());

			this.playbackStartTime = audioContext.currentTime;

			playerState.update((s) => ({
				...s,
				isPlaying: true,
				progress: 0,
				analyserNode: this.analyserNode
			}));
			this.startProgressTracking();

			this.sourceNode.onended = () => {
				this.stop();
				this.onPlaybackEndCallback?.();
			};
		} else {
			// HTML Audio Element mode
			if (!this.audioElement) {
				console.warn('DeezerPlayer: No track loaded or ready.');
				return;
			}

			if (!this.audioElement.paused) {
				// Already playing
				return;
			}

			// Start at the music (skipping leading silence); stop after the dynamic length.
			const startOffset = this.activeLoadedTrack?.startOffset ?? 0;
			const effectiveTrackLength = this.getEffectiveTrackLength();
			this.audioElement.currentTime = startOffset;
			await this.audioElement.play();
			this.playbackStartTime = performance.now() / 1000;

			playerState.update((s) => ({ ...s, isPlaying: true, progress: 0, analyserNode: null }));
			this.startProgressTracking();

			// Remove any stale listeners from a previous play() on the same element
			this.removeAudioEventListeners();

			// Set up event listeners for playback end
			const audioEl = this.audioElement; // capture ref for closures

			const handleEnded = () => {
				this.removeAudioEventListeners();
				this.stop();
				this.onPlaybackEndCallback?.();
			};

			const handleTimeUpdate = () => {
				if (audioEl.currentTime >= startOffset + effectiveTrackLength) {
					this.removeAudioEventListeners();
					this.stop();
					this.onPlaybackEndCallback?.();
				}
			};

			this.boundHandleEnded = handleEnded;
			this.boundHandleTimeUpdate = handleTimeUpdate;
			audioEl.addEventListener('ended', handleEnded, { once: true });
			audioEl.addEventListener('timeupdate', handleTimeUpdate);
		}
	}

	/**
	 * Stops playback immediately.
	 */
	stop(): void {
		if (this.activeLoadedTrack?.mode === 'webAudio') {
			// Web Audio API mode
			if (this.sourceNode) {
				this.sourceNode.onended = null; // Prevent double-firing onended
				try {
					this.sourceNode.stop();
				} catch {
					// Already stopped sources still need progress/state cleanup below.
				}
				this.sourceNode.disconnect();
				this.analyserNode?.disconnect();
				this.gainNode?.disconnect();

				this.sourceNode = null;
			}
		} else {
			// HTML Audio Element mode
			if (this.audioElement) {
				// Remove event listeners BEFORE pausing to prevent ghost callbacks
				this.removeAudioEventListeners();

				this.audioElement.pause();
				this.audioElement.currentTime = 0;
			}
		}

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, progress: 0, analyserNode: null }));
	}

	/**
	 * Stops playback and releases all audio resources.
	 */
	destroy(): void {
		this.stop();
		this.audioBuffer = null;
		this.audioElement = null;
		this.activeLoadedTrack = null;
		this.currentTrackData = null;
		this.loadPromise = null;
		playerState.set({
			isPlaying: false,
			isLoading: false,
			progress: 0,
			track: null,
			analyserNode: null
		});
	}

	/**
	 * Removes HTML Audio event listeners added in play().
	 * Safe to call even if no listeners are registered.
	 */
	private removeAudioEventListeners(): void {
		if (this.audioElement) {
			if (this.boundHandleEnded) {
				this.audioElement.removeEventListener('ended', this.boundHandleEnded);
			}
			if (this.boundHandleTimeUpdate) {
				this.audioElement.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
			}
		}
		this.boundHandleEnded = null;
		this.boundHandleTimeUpdate = null;
	}

	private startProgressTracking(): void {
		this.stopProgressTracking();
		this.progressInterval = window.setInterval(() => {
			const duration = this.getEffectiveTrackLength();
			const currentTime = this.getCurrentTime();
			const progress = duration > 0 ? currentTime / duration : 0;
			playerState.update((s) => ({ ...s, progress }));
		}, 100);
	}

	private stopProgressTracking(): void {
		if (this.progressInterval) {
			clearInterval(this.progressInterval);
			this.progressInterval = null;
		}
	}

	/**
	 * Gets the current playback time in seconds.
	 * @returns The current time of the track.
	 */
	getCurrentTime(): number {
		// Reported as elapsed-since-music-start (0-based) so the leading-silence offset is
		// invisible to progress and any duration-based scoring.
		if (this.isPlaying()) {
			if (this.activeLoadedTrack?.mode === 'webAudio' && this.audioContext) {
				return this.audioContext.currentTime - this.playbackStartTime;
			} else if (this.activeLoadedTrack?.mode === 'htmlAudio' && this.audioElement) {
				return this.audioElement.currentTime - this.activeLoadedTrack.startOffset;
			}
		}
		return 0;
	}

	/**
	 * Gets the total duration of the loaded audio track in seconds.
	 * @returns The duration of the track.
	 */
	getDuration(): number {
		if (this.activeLoadedTrack?.mode === 'webAudio') {
			return this.audioBuffer?.duration ?? 0;
		} else {
			return this.audioElement?.duration ?? 0;
		}
	}

	/**
	 * Gets the Web Audio API AnalyserNode for visualization.
	 * @returns The AnalyserNode, or null if not in normalization mode.
	 */
	getAnalyserNode(): AnalyserNode | null {
		return this.analyserNode;
	}

	/**
	 * Checks if the player is currently playing.
	 * @returns True if playing, false otherwise.
	 */
	isPlaying(): boolean {
		return get(playerState).isPlaying;
	}

	/**
	 * Sets a callback function to be executed when playback ends.
	 * @param callback The function to call on playback end.
	 */
	setOnPlaybackEnd(callback: (() => void) | null): void {
		this.onPlaybackEndCallback = callback;
	}

	/**
	 * Gets the metadata for the currently loaded track.
	 * @returns The Deezer track data, or null if no track is loaded.
	 */
	getTrackData(): DeezerTrackData | null {
		return this.currentTrackData;
	}

	/**
	 * Gets a list of artist names for the current track.
	 * @returns An array of artist names.
	 */
	getArtists(): string[] {
		const data = this.currentTrackData;
		if (!data) return [];

		const contributors = data.contributors;
		if (Array.isArray(contributors) && contributors.length > 0) {
			return contributors.map((contributor) => contributor.name);
		}

		return data.artist?.name ? [data.artist.name] : [];
	}

	/**
	 * Stops the current track and starts it again from the beginning.
	 */
	async replay(): Promise<void> {
		if (this.activeLoadedTrack?.mode === 'webAudio') {
			if (!this.audioBuffer || !this.activeLoadedTrack) {
				console.warn('DeezerPlayer: No track loaded or ready.');
				return;
			}

			if (this.sourceNode) {
				this.sourceNode.onended = null;
				this.sourceNode.stop();
				this.sourceNode.disconnect();
				this.analyserNode?.disconnect();
				this.gainNode?.disconnect();
				this.sourceNode = null;
			}
		} else {
			if (!this.audioElement) {
				console.warn('DeezerPlayer: No track loaded or ready.');
				return;
			}

			this.removeAudioEventListeners();
			this.audioElement.pause();
			this.audioElement.currentTime = this.activeLoadedTrack?.startOffset ?? 0;
		}

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, progress: 0 }));

		await this.play();
	}
}

export const deezerPlayer = new DeezerPlayer();

// Expose a readable store for easier component integration
export const progress: Readable<number> = {
	subscribe: (run) => {
		return playerState.subscribe((s) => run(s.progress));
	}
};
