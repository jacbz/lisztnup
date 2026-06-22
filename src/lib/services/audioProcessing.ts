/**
 * Pure audio-analysis helpers shared by the game player (DeezerPlayer) and the
 * library preview player (PreviewPlayer). No DOM, no singleton state — these only
 * operate on decoded AudioBuffers so they stay testable and reusable.
 */

// Target LUFS for normalization.
const TARGET_LUFS = -23;
// Maximum allowed gain to prevent excessive amplification of very quiet tracks.
const MAX_GAIN = 2.5;

/**
 * Translates an integrated LUFS measurement into a linear gain factor that brings
 * the track to `targetLufs`, clamped to `maxGain`.
 */
export function calculateGain(
	lufs: number,
	targetLufs: number = TARGET_LUFS,
	maxGain: number = MAX_GAIN
): number {
	let gain = 10 ** ((targetLufs - lufs) / 20);
	if (gain > maxGain) {
		console.debug(
			`[audioProcessing] Max gain exceeded: ${gain.toFixed(2)}. Clamping to ${maxGain.toFixed(2)}.`
		);
		gain = maxGain;
	}
	console.debug(
		`[audioProcessing] LUFS ${lufs.toFixed(2)} → gain ${gain.toFixed(2)} (target ${targetLufs} LUFS).`
	);
	return gain;
}

export interface SilenceDetectionOptions {
	/** Window size for RMS measurement, in milliseconds. */
	windowMs?: number;
	/** A window louder than this (dBFS) is considered the start of the audio. */
	thresholdDb?: number;
	/** Lead-in kept before the first non-silent window so attacks aren't clipped, in ms. */
	leadInMs?: number;
	/** Offsets smaller than this are ignored (not worth trimming), in ms. */
	minTrimMs?: number;
	/** Hard cap on how much may be trimmed, in seconds. */
	maxTrimS?: number;
	/** Stop scanning after this many seconds (protects near-silent tracks), in seconds. */
	scanLimitS?: number;
}

/**
 * Detects leading silence at the FRONT of a decoded track and returns the offset
 * (in seconds) at which playback should start. Returns 0 when there is no
 * meaningful leading silence, when the track is (near-)silent throughout, or when
 * the offset would be negligible. The result is capped so a quiet intro is never
 * over-trimmed.
 */
export function detectLeadingSilence(
	buffer: AudioBuffer,
	options: SilenceDetectionOptions = {}
): number {
	const {
		windowMs = 20,
		thresholdDb = -50,
		leadInMs = 30,
		minTrimMs = 50,
		maxTrimS = 5,
		scanLimitS = 10
	} = options;

	const sampleRate = buffer.sampleRate;
	const windowSize = Math.max(1, Math.floor((windowMs / 1000) * sampleRate));
	const scanLimitSamples = Math.min(buffer.length, Math.floor(scanLimitS * sampleRate));
	const threshold = 10 ** (thresholdDb / 20); // dBFS → linear amplitude

	const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
		buffer.getChannelData(i)
	);

	let firstNonSilentSample = -1;
	for (let start = 0; start + windowSize <= scanLimitSamples; start += windowSize) {
		let sumSquares = 0;
		for (const channel of channels) {
			for (let j = start; j < start + windowSize; j++) {
				sumSquares += channel[j] * channel[j];
			}
		}
		const rms = Math.sqrt(sumSquares / (windowSize * channels.length));
		if (rms > threshold) {
			firstNonSilentSample = start;
			break;
		}
	}

	// No audible window within the scan window → don't trim (near-silent track).
	if (firstNonSilentSample <= 0) return 0;

	let offset = firstNonSilentSample / sampleRate - leadInMs / 1000;
	offset = Math.max(0, Math.min(offset, maxTrimS));

	if (offset < minTrimMs / 1000) return 0;

	console.debug('[audioProcessing] leading silence trim', {
		offsetSec: Number(offset.toFixed(3)),
		thresholdDb
	});
	return offset;
}

/**
 * Computes the integrated loudness (LUFS) of a decoded buffer using ITU-R BS.1770-4
 * K-weighting and two-stage gating.
 */
export async function calculateLUFS(buffer: AudioBuffer): Promise<number> {
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
