import { writable, type Readable, get } from 'svelte/store';

// Target LUFS for normalization.
const TARGET_LUFS = -22;
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
	private audioContext: AudioContext | null = null;
	private audioBuffer: AudioBuffer | null = null;
	private sourceNode: AudioBufferSourceNode | null = null;
	private gainNode: GainNode | null = null;
	private analyserNode: AnalyserNode | null = null;

	private currentTrackData: DeezerTrackData | null = null;
	private onPlaybackEndCallback: (() => void) | null = null;

	private progressInterval: number | null = null;
	private playbackStartTime = 0;
	private playbackPausedTime = 0;

	private trackLength: number = 30; // 30s previews from Deezer
	private ignoreTrackLength: boolean = false; // If true, always use full 30s duration
	private loadPromise: Promise<void> | null = null;

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

			const audioContext = this.getAudioContext();
			const response = await fetch(this.currentTrackData.preview);
			const arrayBuffer = await response.arrayBuffer();
			this.audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

			const lufs = await this.calculateLUFS(this.audioBuffer);
			console.log(
				`[DeezerPlayer] Calculated LUFS for track ${this.currentTrackData.id}: ${lufs.toFixed(2)}`
			);

			let gain = 10 ** ((TARGET_LUFS - lufs) / 20);
			if (gain > 8) {
				gain = 8; // Limit max gain to prevent excessive amplification
				console.warn(`[DeezerPlayer] Max gain exceeded. Clamping gain to ${gain.toFixed(2)}.`);
			}
			console.log(
				`[DeezerPlayer] Applying gain of ${gain.toFixed(2)} to reach ${TARGET_LUFS} LUFS.`
			);

			this.gainNode = audioContext.createGain();
			this.gainNode.gain.value = gain;
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
	}

	pause(): void {
		if (!this.sourceNode) return;

		this.playbackPausedTime = this.getAudioContext().currentTime - this.playbackStartTime;
		this.stop(true); // Stop and preserve state for resume
	}

	private stop(isPausing: boolean): void {
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

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, analyserNode: null }));
	}

	destroy(): void {
		this.stop(false);
		this.audioBuffer = null;
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
		if (this.isPlaying() && this.audioContext) {
			return this.audioContext.currentTime - this.playbackStartTime;
		}
		return this.playbackPausedTime;
	}

	getDuration(): number {
		return this.audioBuffer?.duration ?? 0;
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

		this.stopProgressTracking();
		playerState.update((s) => ({ ...s, isPlaying: false, progress: 0 }));

		this.playbackPausedTime = 0;
		this.play();
	}

	seek(time: number): void {
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
