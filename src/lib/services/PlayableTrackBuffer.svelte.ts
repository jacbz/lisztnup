import { tracklist, waitForOnline } from '$lib/stores';
import type { Track } from '$lib/models';
import { deezerPlayer, NetworkError, type LoadedPlayableTrack } from './DeezerPlayer';
import type { TracklistGenerator } from './TracklistGenerator';

const TARGET_READY_AHEAD = 2;
const MAX_PRELOAD_RETRIES = 3;

interface BufferedPlayableTrack {
	track: Track;
	loaded: LoadedPlayableTrack;
}

interface PlayableTrackBufferOptions {
	generator: TracklistGenerator;
	maxPlayableTracks?: number | null;
	targetReadyAhead?: number;
}

/**
 * Owns playable track sampling, audio preloading, retry behavior, and the
 * ready-ahead queue used by all game modes.
 */
export class PlayableTrackBuffer {
	current = $state<BufferedPlayableTrack | null>(null);
	readyAhead = $state<BufferedPlayableTrack[]>([]);
	isInitialLoading = $state(false);
	isBlockedOnTrack = $state(false);
	isRefilling = $state(false);
	hasVisibleError = $state(false);
	tracksExhausted = $state(false);

	readonly #generator: TracklistGenerator;
	readonly #maxPlayableTracks: number | null;
	readonly #targetReadyAhead: number;

	#fillPromise: Promise<void> | null = null;
	#generation = 0;
	#loadedPlayableCount = 0;
	#sourceExhausted = false;
	#waiters: Array<() => void> = [];

	constructor(options: PlayableTrackBufferOptions) {
		this.#generator = options.generator;
		this.#maxPlayableTracks = options.maxPlayableTracks ?? null;
		this.#targetReadyAhead = options.targetReadyAhead ?? TARGET_READY_AHEAD;
	}

	get currentTrack(): Track | null {
		return this.current?.track ?? null;
	}

	get currentLoadedTrack(): LoadedPlayableTrack | null {
		return this.current?.loaded ?? null;
	}

	get currentDuration(): number {
		return this.current?.loaded.duration ?? 30;
	}

	sampleSilentTrack(): Track | null {
		return this.#generator.sample();
	}

	async start(): Promise<void> {
		const generation = ++this.#generation;
		this.#resetState();
		this.isInitialLoading = true;
		console.debug('[PreloadBuffer] initial load started', {
			generation,
			targetReadyAhead: this.#targetReadyAhead,
			maxPlayableTracks: this.#maxPlayableTracks
		});

		try {
			const firstTrack = await this.#loadUntilReady(generation);
			if (!this.#isActive(generation)) {
				firstTrack?.loaded.destroy();
				return;
			}
			this.current = firstTrack;
			this.hasVisibleError = false;
			console.debug(
				'[PreloadBuffer] initial track ready',
				firstTrack ? this.#trackDebug(firstTrack) : null
			);
		} finally {
			if (this.#isActive(generation)) {
				this.isInitialLoading = false;
				this.ensureFilled();
			}
		}
	}

	async advance(): Promise<Track | null> {
		const generation = this.#generation;
		console.debug('[PreloadBuffer] advance requested', this.#stateDebug());

		if (this.readyAhead.length === 0 && !this.#sourceExhausted && this.#canLoadAnotherPlayable()) {
			this.isBlockedOnTrack = true;
			console.debug('[PreloadBuffer] buffer empty; blocking for next track', this.#stateDebug());
			await this.#ensureOneFutureReady(generation);
		}

		if (!this.#isActive(generation)) return null;

		const next = this.readyAhead.shift() ?? null;
		if (!next) {
			this.current?.loaded.destroy();
			this.current = null;
			this.tracksExhausted = true;
			this.isBlockedOnTrack = false;
			console.debug('[PreloadBuffer] no next track available; exhausted', this.#stateDebug());
			return null;
		}

		this.current?.loaded.destroy();
		this.current = next;
		this.isBlockedOnTrack = false;
		this.hasVisibleError = false;
		console.debug('[PreloadBuffer] advanced to buffered track', {
			...this.#trackDebug(next),
			readyAhead: this.readyAhead.length
		});
		this.ensureFilled();
		return next.track;
	}

	ensureFilled(): void {
		if (this.#fillPromise || this.#sourceExhausted || !this.#canLoadAnotherPlayable()) return;
		const generation = this.#generation;
		console.debug('[PreloadBuffer] background refill started', this.#stateDebug());
		this.#fillPromise = this.#fillLoop(generation).finally(() => {
			if (this.#isActive(generation)) {
				this.#fillPromise = null;
				this.isRefilling = false;
				console.debug('[PreloadBuffer] background refill finished', this.#stateDebug());
			}
		});
	}

	retryVisible(): void {
		this.hasVisibleError = false;
		console.debug('[PreloadBuffer] visible retry requested', this.#stateDebug());
		this.ensureFilled();
	}

	invalidateFutureTracks(): void {
		console.debug('[PreloadBuffer] invalidating future tracks', this.#stateDebug());
		for (const item of this.readyAhead) {
			item.loaded.destroy();
		}
		this.readyAhead = [];
		this.ensureFilled();
	}

	reset(): void {
		this.#generation++;
		console.debug('[PreloadBuffer] reset', { generation: this.#generation });
		this.#resetState();
	}

	destroy(): void {
		this.reset();
	}

	#resetState(): void {
		this.current?.loaded.destroy();
		for (const item of this.readyAhead) {
			item.loaded.destroy();
		}
		this.current = null;
		this.readyAhead = [];
		this.isInitialLoading = false;
		this.isBlockedOnTrack = false;
		this.isRefilling = false;
		this.hasVisibleError = false;
		this.tracksExhausted = false;
		this.#sourceExhausted = false;
		this.#fillPromise = null;
		this.#loadedPlayableCount = 0;
		this.#notifyWaiters();
	}

	async #ensureOneFutureReady(generation: number): Promise<void> {
		while (
			this.#isActive(generation) &&
			this.readyAhead.length === 0 &&
			!this.#sourceExhausted &&
			this.#canLoadAnotherPlayable()
		) {
			if (!this.#fillPromise) this.ensureFilled();
			await this.#waitForQueueChange();
		}
	}

	async #fillLoop(generation: number): Promise<void> {
		this.isRefilling = true;
		while (
			this.#isActive(generation) &&
			!this.#sourceExhausted &&
			this.readyAhead.length < this.#targetReadyAhead &&
			this.#canLoadAnotherPlayable()
		) {
			const loaded = await this.#loadUntilReady(generation);
			if (!this.#isActive(generation)) {
				loaded?.loaded.destroy();
				return;
			}
			if (!loaded) return;
			this.readyAhead = [...this.readyAhead, loaded];
			this.#notifyWaiters();
			this.hasVisibleError = false;
			console.debug('[PreloadBuffer] future track ready', {
				...this.#trackDebug(loaded),
				readyAhead: this.readyAhead.length
			});
		}
	}

	async #loadUntilReady(generation: number): Promise<BufferedPlayableTrack | null> {
		while (this.#isActive(generation) && this.#canLoadAnotherPlayable()) {
			try {
				return await this.#loadOnePlayable(generation);
			} catch (error) {
				if (!this.#isActive(generation)) return null;
				if (!(error instanceof NetworkError)) throw error;

				const visibleWait = this.isBlockedOnTrack || (this.isInitialLoading && !this.current);
				if (visibleWait) {
					this.hasVisibleError = true;
					console.debug('[PreloadBuffer] visible load retrying after network error', {
						message: error.message,
						...this.#stateDebug()
					});
				} else {
					console.debug('[PreloadBuffer] silent refill retrying after network error', {
						message: error.message,
						...this.#stateDebug()
					});
				}

				if (typeof navigator !== 'undefined' && !navigator.onLine) {
					await waitForOnline();
				} else {
					await this.#delay(visibleWait ? 2000 : 4000);
				}
			}
		}
		return null;
	}

	async #loadOnePlayable(generation: number): Promise<BufferedPlayableTrack | null> {
		while (this.#isActive(generation) && this.#canLoadAnotherPlayable()) {
			const track = this.#generator.sample();
			if (!track) {
				this.#sourceExhausted = true;
				this.#notifyWaiters();
				console.debug('[PreloadBuffer] source exhausted', this.#stateDebug());
				if (!this.current && this.readyAhead.length === 0) {
					this.tracksExhausted = true;
				}
				return null;
			}

			const loaded = await this.#loadTrackAudio(track, generation);
			if (loaded) {
				this.#loadedPlayableCount++;
				tracklist.update((items) => [...items, track]);
				console.debug('[PreloadBuffer] sampled playable track loaded', {
					work: track.work.name,
					part: track.part.name,
					deezerId: loaded.deezerId,
					loadedPlayableCount: this.#loadedPlayableCount
				});
				return { track, loaded };
			}
		}
		return null;
	}

	async #loadTrackAudio(track: Track, generation: number): Promise<LoadedPlayableTrack | null> {
		const availableDeezerIds = [...track.part.deezer];
		let lastNetworkError: NetworkError | null = null;

		while (this.#isActive(generation) && availableDeezerIds.length > 0) {
			const randomIndex = Math.floor(Math.random() * availableDeezerIds.length);
			const deezerId = availableDeezerIds[randomIndex];

			for (let attempt = 1; attempt <= MAX_PRELOAD_RETRIES; attempt++) {
				try {
					const loaded = await deezerPlayer.preload(deezerId);
					console.debug('[PreloadBuffer] Deezer ID loaded', {
						deezerId,
						attempt,
						work: track.work.name,
						part: track.part.name
					});
					return loaded;
				} catch (error) {
					if (!this.#isActive(generation)) return null;

					if (error instanceof NetworkError) {
						lastNetworkError = error;
						console.debug('[PreloadBuffer] Deezer ID network failure', {
							deezerId,
							attempt,
							maxAttempts: MAX_PRELOAD_RETRIES,
							message: error.message
						});
						if (attempt < MAX_PRELOAD_RETRIES) {
							if (typeof navigator !== 'undefined' && !navigator.onLine) {
								await waitForOnline();
							} else {
								await this.#delay(1000 * Math.pow(2, attempt - 1));
							}
							continue;
						}
					}

					console.debug('[PreloadBuffer] Deezer ID rejected; trying fallback', {
						deezerId,
						attempt,
						error
					});
					break;
				}
			}

			availableDeezerIds.splice(randomIndex, 1);
		}

		if (lastNetworkError) throw lastNetworkError;
		console.warn('All Deezer IDs failed for track, sampling another:', track.work.name);
		return null;
	}

	#canLoadAnotherPlayable(): boolean {
		return this.#maxPlayableTracks === null || this.#loadedPlayableCount < this.#maxPlayableTracks;
	}

	#isActive(generation: number): boolean {
		return this.#generation === generation;
	}

	#stateDebug(): Record<string, unknown> {
		return {
			current: this.current ? this.#trackDebug(this.current) : null,
			readyAhead: this.readyAhead.length,
			isInitialLoading: this.isInitialLoading,
			isBlockedOnTrack: this.isBlockedOnTrack,
			isRefilling: this.isRefilling,
			hasVisibleError: this.hasVisibleError,
			tracksExhausted: this.tracksExhausted,
			sourceExhausted: this.#sourceExhausted,
			loadedPlayableCount: this.#loadedPlayableCount
		};
	}

	#trackDebug(item: BufferedPlayableTrack): Record<string, unknown> {
		return {
			work: item.track.work.name,
			part: item.track.part.name,
			deezerId: item.loaded.deezerId,
			mode: item.loaded.mode,
			duration: item.loaded.duration
		};
	}

	#waitForQueueChange(): Promise<void> {
		return new Promise((resolve) => {
			this.#waiters.push(resolve);
		});
	}

	#notifyWaiters(): void {
		const waiters = this.#waiters;
		this.#waiters = [];
		for (const resolve of waiters) {
			resolve();
		}
	}

	#delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
