import { writable, type Readable, get } from 'svelte/store';

// Target LUFS for normalization.
const TARGET_LUFS = -23;
const FADE_DURATION = 0.3;

interface DeezerTrackData {
	id: number;
	title: string;
	preview: string;
	artist: { name: string };
	contributors?: Array<{ name: string }>;
}

interface WindowWithDeezerCallbacks extends Window {
	[key: string]: unknown;
}

declare const window: WindowWithDeezerCallbacks;

export const playerState = writable({
	isPlaying: false,
	progress: 0,
	track: null as DeezerTrackData | null,
	analyserNode: null as AnalyserNode | null
});

class DeezerPlayer {
	// Web Audio API properties (used when normalization is enabled)
	private audioContext: AudioContext | null = null;
	private audioBuffer: AudioBuffer | null = null;
	private sourceNode: AudioBufferSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private analyserNode: AnalyserNode | null = null;

	// HTML Audio Element properties (used when normalization is disabled)
	private audioElement: HTMLAudioElement | null = null;

	// Common properties
	private currentTrackData: DeezerTrackData | null = null;
	private onPlaybackEndCallback: (() => void) | null = null;

	private progressInterval: number | null = null;
	private playbackStartTime = 0;
	private playbackPausedTime = 0;

	private trackLength: number = 30; // 30s previews from Deezer
	private ignoreTrackLength: boolean = false; // If true, always use full 30s duration
	private loadPromise: Promise<void> | null = null;

	private enableAudioNormalization: boolean = true; // Default to true, controlled by settings

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
	 * Sets whether to ignore the custom track length setting and always use full 30s
	 */
	setIgnoreTrackLength(ignore: boolean): void {
		this.ignoreTrackLength = ignore;
	}

	/**
	 * Sets whether to use Web Audio API with LUFS normalization
	 */
	setEnableAudioNormalization(enable: boolean): void {
		this.enableAudioNormalization = enable;
	}

	private getAudioContext(): AudioContext {
		if (!this.audioContext) {
			this.audioContext = new AudioContext();
		}
		return this.audioContext;
	}

	private async fetchTrackData(deezerId: number): Promise<DeezerTrackData | null> {
		return new Promise((resolve) => {
			const callbackName = `deezerCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const script = document.createElement('script');
			const timeout = setTimeout(() => {
				cleanup();
				console.error(`DeezerPlayer: Timeout fetching track ${deezerId}`);
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
				resolve(null);
			};

			script.src = `https://api.deezer.com/track/${deezerId}?output=jsonp&callback=${callbackName}`;
			document.head.appendChild(script);
		});
	}

	async load(deezerId: number): Promise<void> {
		this.destroy();
		const loadPromise = this._load(deezerId);
		this.loadPromise = loadPromise;
		await loadPromise;
		this.loadPromise = null;
	}

	private async _load(deezerId: number): Promise<void> {
		try {
			this.currentTrackData = await this.fetchTrackData(deezerId);
			if (!this.currentTrackData || !this.currentTrackData.preview) {
				throw new Error('Track data or preview URL not available.');
			}

			playerState.update((s) => ({ ...s, track: this.currentTrackData }));

			// Always fetch and analyze audio for LUFS
			const response = await fetch(this.currentTrackData.preview);
			const arrayBuffer = await response.arrayBuffer();

			// Decode audio data for analysis (and for Web Audio API playback if enabled)
			const audioContext = this.getAudioContext();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			// Calculate LUFS for normalization
			const lufs = await this.calculateLUFS(audioBuffer);
			console.log(
				`[DeezerPlayer] Calculated LUFS for track ${this.currentTrackData.id}: ${lufs.toFixed(2)}`
			);

			let gain = 10 ** ((TARGET_LUFS - lufs) / 20);
			if (gain > 5) {
				gain = 5; // Limit max gain to prevent excessive amplification
				console.warn(`[DeezerPlayer] Max gain exceeded. Clamping gain to ${gain.toFixed(2)}.`);
			}
			console.log(
				`[DeezerPlayer] Calculated gain of ${gain.toFixed(2)} to reach ${TARGET_LUFS} LUFS.`
			);

			if (this.enableAudioNormalization) {
				// Web Audio API mode - use GainNode
				this.audioBuffer = audioBuffer;
				this.gainNode = audioContext.createGain();
				this.gainNode.gain.value = gain;
				console.log(`[DeezerPlayer] Web Audio API mode: applying gain via GainNode`);
			} else {
				// HTML Audio Element mode - translate gain to volume
				this.audioElement = new Audio(this.currentTrackData.preview);
				this.audioElement.crossOrigin = 'anonymous';

				// Preload the audio
				await new Promise<void>((resolve, reject) => {
					if (!this.audioElement) {
						reject(new Error('Audio element not initialized'));
						return;
					}

					this.audioElement.addEventListener('canplaythrough', () => resolve(), { once: true });
					this.audioElement.addEventListener('error', (e) => reject(e), { once: true });
					this.audioElement.load();
				});

				// Translate gain to volume: gain of 2 = volume 1.0, gain of 1 = volume 0.5
				// Volume = min(1, gain / 2)
				const volume = Math.min(1, gain / 2);
				this.audioElement.volume = volume;
				console.log(
					`[DeezerPlayer] HTML Audio mode: translated gain ${gain.toFixed(2)} to volume ${volume.toFixed(2)}`
				);
			}
		} catch (error) {
			console.error('DeezerPlayer: Error loading track', error);
			this.destroy();
			throw error;
		}
	}

	async play(): Promise<void> {
		if (this.loadPromise) {
			await this.loadPromise;
		}

		if (this.enableAudioNormalization) {
			// Web Audio API mode
			if (!this.audioBuffer || !this.gainNode) {
				console.warn('DeezerPlayer: No track loaded or ready.');
				return;
			}

			if (this.sourceNode) {
				// Already playing
				return;
			}

			const audioContext = this.getAudioContext();
			this.sourceNode = audioContext.createBufferSource();
			this.sourceNode.buffer = this.audioBuffer;

			this.analyserNode = audioContext.createAnalyser();
			this.analyserNode.fftSize = 2048;

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

			const offset = this.playbackPausedTime;
			const effectiveTrackLength = this.ignoreTrackLength ? 30 : this.trackLength;
			const duration = effectiveTrackLength > offset ? effectiveTrackLength - offset : 0;

			this.sourceNode.start(0, offset, duration);

			this.playbackStartTime = audioContext.currentTime - offset;
			this.playbackPausedTime = 0;

			playerState.update((s) => ({ ...s, isPlaying: true, analyserNode: this.analyserNode }));
			this.startProgressTracking();

			this.sourceNode.onended = () => {
				this.stop(false); // Stop without destroying if it ended naturally
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

			const offset = this.playbackPausedTime;
			this.audioElement.currentTime = offset;

			const effectiveTrackLength = this.ignoreTrackLength ? 30 : this.trackLength;

			await this.audioElement.play();

			this.playbackStartTime = performance.now() / 1000 - offset;
			this.playbackPausedTime = 0;

			playerState.update((s) => ({ ...s, isPlaying: true, analyserNode: null }));
			this.startProgressTracking();

			// Set up event listeners for playback end
			const handleEnded = () => {
				this.stop(false);
				this.onPlaybackEndCallback?.();
			};

			const handleTimeUpdate = () => {
				if (this.audioElement && this.audioElement.currentTime >= effectiveTrackLength) {
					this.audioElement.pause();
					this.audioElement.removeEventListener('ended', handleEnded);
					this.audioElement.removeEventListener('timeupdate', handleTimeUpdate);
					this.stop(false);
					this.onPlaybackEndCallback?.();
				}
			};

			this.audioElement.addEventListener('ended', handleEnded, { once: true });
			this.audioElement.addEventListener('timeupdate', handleTimeUpdate);
		}
	}

	pause(): void {
		if (this.enableAudioNormalization) {
			if (!this.sourceNode) return;
			this.playbackPausedTime = this.getAudioContext().currentTime - this.playbackStartTime;
		} else {
			if (!this.audioElement || this.audioElement.paused) return;
			this.playbackPausedTime = this.audioElement.currentTime;
		}
		this.stop(true); // Stop and preserve state for resume
	}

	private stop(isPausing: boolean): void {
		if (this.enableAudioNormalization) {
			// Web Audio API mode
			if (!this.sourceNode) return;

			this.sourceNode.onended = null; // Prevent double-firing onended
			this.sourceNode.stop();
			this.sourceNode.disconnect();
			this.analyserNode?.disconnect();
			this.gainNode?.disconnect();

			this.sourceNode = null;

			if (!isPausing) {
				this.playbackPausedTime = 0;
			}
		} else {
			// HTML Audio Element mode
			if (!this.audioElement) return;

			this.audioElement.pause();

			if (!isPausing) {
				this.audioElement.currentTime = 0;
				this.playbackPausedTime = 0;
			}
		}

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, analyserNode: null }));
	}

	destroy(): void {
		this.stop(false);
		this.audioBuffer = null;
		this.audioElement = null;
		this.currentTrackData = null;
		this.playbackPausedTime = 0;
		playerState.set({
			isPlaying: false,
			progress: 0,
			track: null,
			analyserNode: null
		});
	}

	private startProgressTracking(): void {
		this.stopProgressTracking();
		this.progressInterval = window.setInterval(() => {
			const effectiveTrackLength = this.ignoreTrackLength ? 30 : this.trackLength;
			const duration = effectiveTrackLength;
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

	getCurrentTime(): number {
		if (this.isPlaying()) {
			if (this.enableAudioNormalization && this.audioContext) {
				return this.audioContext.currentTime - this.playbackStartTime;
			} else if (!this.enableAudioNormalization && this.audioElement) {
				return this.audioElement.currentTime;
			}
		}
		return this.playbackPausedTime;
	}

	getDuration(): number {
		if (this.enableAudioNormalization) {
			return this.audioBuffer?.duration ?? 0;
		} else {
			return this.audioElement?.duration ?? 0;
		}
	}

	getAnalyserNode(): AnalyserNode | null {
		return this.analyserNode;
	}

	isPlaying(): boolean {
		return get(playerState).isPlaying;
	}

	setOnPlaybackEnd(callback: (() => void) | null): void {
		this.onPlaybackEndCallback = callback;
	}

	getTrackData(): DeezerTrackData | null {
		return this.currentTrackData;
	}

	getArtists(): string[] {
		const data = this.currentTrackData;
		if (!data) return [];

		const contributors = data.contributors;
		if (Array.isArray(contributors) && contributors.length > 0) {
			return contributors.map((contributor) => contributor.name);
		}

		return data.artist?.name ? [data.artist.name] : [];
	}

	replay(): void {
		if (this.enableAudioNormalization) {
			if (!this.audioBuffer || !this.gainNode) {
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

			this.audioElement.pause();
			this.audioElement.currentTime = 0;
		}

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, progress: 0 }));

		this.playbackPausedTime = 0;
		this.play();
	}

	seek(time: number): void {
		if (this.enableAudioNormalization) {
			if (!this.audioBuffer) return;

			const wasPlaying = this.isPlaying();
			if (this.sourceNode) {
				this.sourceNode.onended = null;
				this.sourceNode.stop();
				this.sourceNode.disconnect();
				this.analyserNode?.disconnect();
				this.gainNode?.disconnect();
				this.sourceNode = null;
			}
			this.stopProgressTracking();

			this.playbackPausedTime = time;

			if (wasPlaying) {
				this.play();
			} else {
				const duration = this.audioBuffer?.duration ?? this.trackLength;
				const progress = duration > 0 ? time / duration : 0;
				playerState.update((s) => ({ ...s, progress }));
			}
		} else {
			if (!this.audioElement) return;

			const wasPlaying = this.isPlaying();
			this.audioElement.currentTime = time;
			this.playbackPausedTime = time;

			if (wasPlaying) {
				// Will resume from new position
			} else {
				const duration = this.audioElement.duration ?? this.trackLength;
				const progress = duration > 0 ? time / duration : 0;
				playerState.update((s) => ({ ...s, progress }));
			}
		}
	}

	// LUFS Calculation (based on ITU-R BS.1770-4)
	private async calculateLUFS(buffer: AudioBuffer): Promise<number> {
		const sampleRate = buffer.sampleRate;
		const offlineCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, sampleRate);

		// Stage 1: K-weighting pre-filter (high-shelf)
		const kFilter1 = offlineCtx.createBiquadFilter();
		kFilter1.type = 'highshelf';
		kFilter1.frequency.value = 1681.9744509555319;
		kFilter1.gain.value = 4;

		// Stage 2: K-weighting high-pass filter
		const kFilter2 = offlineCtx.createBiquadFilter();
		kFilter2.type = 'highpass';
		kFilter2.frequency.value = 38.13547087613982;
		kFilter2.Q.value = 0.5003270373238773;

		const source = offlineCtx.createBufferSource();
		source.buffer = buffer;
		source.connect(kFilter1);
		kFilter1.connect(kFilter2);
		kFilter2.connect(offlineCtx.destination);
		source.start(0);

		const filteredBuffer = await offlineCtx.startRendering();

		const channels = Array.from({ length: filteredBuffer.numberOfChannels }, (_, i) =>
			filteredBuffer.getChannelData(i)
		);

		// Gating block duration: 400ms
		const gateBlockSize = Math.floor(0.4 * sampleRate);
		const overlap = 0.75; // 75% overlap
		const stepSize = Math.floor(gateBlockSize * (1 - overlap));
		const numBlocks = Math.floor((filteredBuffer.length - gateBlockSize) / stepSize);

		if (numBlocks <= 0) return -70; // Not enough audio data

		const blockLoudness: number[] = [];

		for (let i = 0; i < numBlocks; i++) {
			const start = i * stepSize;
			const end = start + gateBlockSize;
			let blockPower = 0;
			for (const channel of channels) {
				let channelPower = 0;
				for (let j = start; j < end; j++) {
					channelPower += channel[j] * channel[j];
				}
				blockPower += channelPower / gateBlockSize;
			}
			if (blockPower > 0) {
				const loudness = -0.691 + 10 * Math.log10(blockPower);
				blockLoudness.push(loudness);
			}
		}

		if (blockLoudness.length === 0) return -70; // Silence

		// Absolute gate at -70 LUFS
		const absoluteThreshold = -70;
		const gatedBlocks = blockLoudness.filter((l) => l > absoluteThreshold);

		if (gatedBlocks.length === 0) return -70;

		const averageLoudness =
			-0.691 +
			10 *
				Math.log10(
					gatedBlocks.reduce((sum, l) => sum + 10 ** ((l + 0.691) / 10), 0) / gatedBlocks.length
				);

		// Relative gate
		const relativeThreshold = averageLoudness - 10;
		const finalGatedBlocks = gatedBlocks.filter((l) => l > relativeThreshold);

		if (finalGatedBlocks.length === 0) return -70;

		const finalAveragePower =
			finalGatedBlocks.reduce((sum, l) => sum + 10 ** ((l + 0.691) / 10), 0) /
			finalGatedBlocks.length;

		const integratedLUFS = -0.691 + 10 * Math.log10(finalAveragePower);

		return isFinite(integratedLUFS) ? integratedLUFS : -70;
	}
}

export const deezerPlayer = new DeezerPlayer();

// Expose a readable store for easier component integration
export const progress: Readable<number> = {
	subscribe: (run) => {
		return playerState.subscribe((s) => run(s.progress));
	}
};
