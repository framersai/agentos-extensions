/**
 * @file LocalDiarizationBackend.ts
 * @description Offline speaker diarization backend using a sliding-window
 * spectral-centroid voiceprint and cosine similarity matching.
 *
 * Audio is accumulated in a {@link SlidingWindowExtractor}.  When a full chunk
 * is ready, a 16-dimensional feature vector is extracted and matched against
 * cached speaker centroids.  If no centroid exceeds the similarity threshold a
 * new `Speaker_N` identity is created.
 *
 * The built-in feature extractor is intentionally lightweight.  An ONNX
 * x-vector model can replace {@link LocalDiarizationBackend.extractSimpleEmbedding}
 * later without changing the surrounding API.
 *
 * @module diarization/LocalDiarizationBackend
 */

import { EventEmitter } from 'node:events';
import type { SpeakerEmbeddingCache } from './SpeakerEmbeddingCache.js';
import type { SlidingWindowExtractor } from './SlidingWindowExtractor.js';
import type { SpeakerIdentified } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Size of the local feature vector in dimensions. */
const FEATURE_DIMS = 16;

/** Number of octave-band buckets used by the feature extractor. */
const OCTAVE_BANDS = 4;

/** Dimensions per octave band (FEATURE_DIMS / OCTAVE_BANDS). */
const DIMS_PER_BAND = FEATURE_DIMS / OCTAVE_BANDS;

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Fully offline diarization backend.
 *
 * Connects a {@link SlidingWindowExtractor} to a {@link SpeakerEmbeddingCache}
 * and emits `speaker_identified` events whenever a speaker label is resolved
 * for a new audio chunk.
 *
 * @example
 * ```ts
 * const cache = new SpeakerEmbeddingCache(0.7);
 * const extractor = new SlidingWindowExtractor(1500, 500, 16000);
 * const backend = new LocalDiarizationBackend(cache, extractor);
 *
 * backend.on('speaker_identified', ({ speakerId }) => console.log(speakerId));
 * backend.start();
 *
 * microphone.on('frame', (f) => extractor.pushAudio(f));
 * ```
 */
export class LocalDiarizationBackend extends EventEmitter {
  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param cache - Speaker voiceprint cache used for matching and centroid
   *   updates.
   * @param extractor - Sliding-window extractor that supplies audio chunks.
   */
  constructor(
    private readonly cache: SpeakerEmbeddingCache,
    private readonly extractor: SlidingWindowExtractor,
  ) {
    super();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Attach the `'chunk_ready'` listener to the extractor and begin processing
   * audio chunks.
   *
   * Calling `start()` more than once is safe — subsequent calls are no-ops
   * because the same bound listener is reused.
   */
  start(): void {
    this.extractor.on('chunk_ready', this._onChunkReady);
  }

  /**
   * Detach from the extractor and stop processing.
   */
  stop(): void {
    this.extractor.off('chunk_ready', this._onChunkReady);
  }

  // -------------------------------------------------------------------------
  // Internal event handler
  // -------------------------------------------------------------------------

  /**
   * Bound handler for `'chunk_ready'` events from the extractor.
   *
   * Stored as an arrow-function property so the same reference is used for
   * both `on()` and `off()`.
   */
  private readonly _onChunkReady = (chunk: Float32Array): void => {
    const embedding = this.extractSimpleEmbedding(chunk);
    const { speakerId } = this.cache.getOrCreateSpeaker(embedding);

    const payload: SpeakerIdentified = {
      speakerId,
      confidence: 0.7,
      timestamp: Date.now(),
    };

    this.emit('speaker_identified', payload);
  };

  // -------------------------------------------------------------------------
  // Feature extraction
  // -------------------------------------------------------------------------

  /**
   * Extract a 16-dimensional voiceprint from a raw PCM chunk.
   *
   * Feature layout (4 octave bands × 4 features per band):
   * - Band 0: sub-bass  (0 –  500 Hz equivalent bucket)
   * - Band 1: bass      (500 – 2000 Hz equivalent bucket)
   * - Band 2: mid       (2000 – 4000 Hz equivalent bucket)
   * - Band 3: high      (4000 Hz+ equivalent bucket)
   *
   * For each band the following statistics are computed:
   * - [0] RMS energy
   * - [1] Spectral centroid (normalised to band range)
   * - [2] Zero-crossing rate
   * - [3] Delta energy (mean absolute frame-to-frame change)
   *
   * This is a placeholder implementation suitable for demos and testing.
   * Replace with an ONNX x-vector model for production accuracy.
   *
   * @param chunk - Float32 PCM audio data.
   * @returns 16-dimensional embedding vector.
   */
  extractSimpleEmbedding(chunk: Float32Array): Float32Array {
    const features = new Float32Array(FEATURE_DIMS);
    const n = chunk.length;

    if (n === 0) return features;

    // Split the chunk index range into OCTAVE_BANDS equal bands.
    const bandSize = Math.ceil(n / OCTAVE_BANDS);

    for (let band = 0; band < OCTAVE_BANDS; band++) {
      const start = band * bandSize;
      const end = Math.min(start + bandSize, n);
      const bandLen = end - start;

      if (bandLen === 0) continue;

      // --- RMS energy ---
      let sumSq = 0;
      for (let i = start; i < end; i++) sumSq += (chunk[i]!) ** 2;
      const rms = Math.sqrt(sumSq / bandLen);

      // --- Spectral centroid (weighted mean index, normalised to [0,1]) ---
      let weightedIdx = 0;
      let totalAbs = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(chunk[i]!);
        weightedIdx += (i - start) * abs;
        totalAbs += abs;
      }
      const centroid = totalAbs > 0 ? weightedIdx / totalAbs / bandLen : 0;

      // --- Zero-crossing rate ---
      let zeroCrossings = 0;
      for (let i = start + 1; i < end; i++) {
        if ((chunk[i]! >= 0) !== (chunk[i - 1]! >= 0)) zeroCrossings++;
      }
      const zcr = zeroCrossings / (bandLen - 1);

      // --- Delta energy (mean |diff| between consecutive samples) ---
      let deltaSum = 0;
      for (let i = start + 1; i < end; i++) {
        deltaSum += Math.abs(chunk[i]! - chunk[i - 1]!);
      }
      const delta = deltaSum / (bandLen - 1);

      // Write into the feature vector.
      const base = band * DIMS_PER_BAND;
      features[base + 0] = rms;
      features[base + 1] = centroid;
      features[base + 2] = zcr;
      features[base + 3] = delta;
    }

    return features;
  }
}
