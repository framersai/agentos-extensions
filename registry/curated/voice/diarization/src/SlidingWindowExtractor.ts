/**
 * @file SlidingWindowExtractor.ts
 * @description Ring buffer that accumulates audio frames into fixed-size chunks
 * with configurable overlap, tuned for diarization (1.5 s chunks, 0.5 s overlap).
 *
 * Mirrors the design of `SlidingWindowBuffer` from the Whisper STT pack but
 * operates on {@link AudioFrame} objects rather than raw sample arrays, and
 * uses millisecond-based chunk/overlap sizes for a friendlier API.
 *
 * @module diarization/SlidingWindowExtractor
 */

import { EventEmitter } from 'node:events';
import type { AudioFrame } from './types.js';

// ---------------------------------------------------------------------------
// Events interface
// ---------------------------------------------------------------------------

/** Event map for {@link SlidingWindowExtractor}. */
export interface SlidingWindowExtractorEvents {
  /** Emitted when a complete chunk of audio samples is ready. */
  chunk_ready: [chunk: Float32Array];
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Sliding-window audio extractor for the diarization pipeline.
 *
 * Accepts {@link AudioFrame} objects pushed by the voice pipeline, accumulates
 * samples in an internal ring buffer, and emits `'chunk_ready'` events when a
 * full chunk is available.  The last `overlapSamples` of each chunk are kept
 * as context at the head of the next chunk.
 *
 * @example
 * ```ts
 * const extractor = new SlidingWindowExtractor(1500, 500, 16000);
 * extractor.on('chunk_ready', (chunk) => processChunk(chunk));
 * microphone.on('frame', (f) => extractor.pushAudio(f));
 * ```
 */
export class SlidingWindowExtractor extends EventEmitter {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  /** Internal sample store.  Sized to {@link chunkSizeSamples}. */
  private buffer: Float32Array;

  /** Current write position within {@link buffer}. */
  private writePos = 0;

  // -------------------------------------------------------------------------
  // Computed dimensions (from ms → samples)
  // -------------------------------------------------------------------------

  /** Number of samples per emitted chunk. */
  private readonly chunkSizeSamples: number;

  /** Number of overlap samples carried forward to the next chunk. */
  private readonly overlapSamples: number;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param chunkSizeMs - Duration of each emitted chunk in milliseconds.
   *   @defaultValue 1500
   * @param overlapMs - Overlap between consecutive chunks in milliseconds.
   *   Must be less than `chunkSizeMs`.
   *   @defaultValue 500
   * @param sampleRate - Expected audio sample rate in Hz.
   *   @defaultValue 16000
   */
  constructor(
    private readonly chunkSizeMs: number = 1500,
    private readonly overlapMs: number = 500,
    private readonly sampleRate: number = 16_000,
  ) {
    super();

    this.chunkSizeSamples = Math.round((chunkSizeMs / 1000) * sampleRate);
    this.overlapSamples = Math.round((overlapMs / 1000) * sampleRate);

    if (this.overlapSamples >= this.chunkSizeSamples) {
      throw new RangeError(
        `overlapMs (${overlapMs}) must result in fewer samples than chunkSizeMs (${chunkSizeMs})`,
      );
    }

    this.buffer = new Float32Array(this.chunkSizeSamples);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Push an audio frame into the extractor.
   *
   * Samples are appended to the internal ring buffer.  When the buffer fills
   * to `chunkSizeSamples`, a `'chunk_ready'` event is emitted and the overlap
   * region is copied to the head of the buffer for the next chunk.
   *
   * @param frame - Audio frame to append.
   */
  pushAudio(frame: AudioFrame): void {
    this.pushSamples(frame.samples);
  }

  /**
   * Flush any remaining samples as a final partial chunk.
   *
   * If the buffer is empty this is a no-op.
   */
  flush(): void {
    if (this.writePos === 0) return;
    this.emit('chunk_ready', this.buffer.slice(0, this.writePos));
    this.reset();
  }

  /**
   * Clear the buffer without emitting a chunk.
   */
  reset(): void {
    this.buffer = new Float32Array(this.chunkSizeSamples);
    this.writePos = 0;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** Number of samples currently held in the buffer. */
  get bufferedSamples(): number {
    return this.writePos;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Append raw PCM samples and emit chunks as they fill.
   *
   * @param samples - Float32 PCM data to append.
   */
  private pushSamples(samples: Float32Array): void {
    let srcOffset = 0;

    while (srcOffset < samples.length) {
      const spaceLeft = this.chunkSizeSamples - this.writePos;
      const copyCount = Math.min(spaceLeft, samples.length - srcOffset);

      this.buffer.set(samples.subarray(srcOffset, srcOffset + copyCount), this.writePos);
      this.writePos += copyCount;
      srcOffset += copyCount;

      if (this.writePos >= this.chunkSizeSamples) {
        // Emit a copy — the buffer is reused for the next chunk.
        this.emit('chunk_ready', this.buffer.slice());

        // Copy the overlap region to the start of the buffer.
        const overlapStart = this.chunkSizeSamples - this.overlapSamples;
        this.buffer.copyWithin(0, overlapStart, this.chunkSizeSamples);
        this.writePos = this.overlapSamples;
      }
    }
  }
}
