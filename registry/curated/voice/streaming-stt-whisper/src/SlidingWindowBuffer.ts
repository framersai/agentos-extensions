/**
 * @file SlidingWindowBuffer.ts
 * @description Ring buffer that accumulates Float32 audio frames into fixed-size chunks
 * with configurable overlap between consecutive chunks.
 *
 * When {@link pushSamples} fills the internal buffer to {@link chunkSizeSamples}, it
 * emits a `'chunk_ready'` event carrying the complete `Float32Array` chunk, copies the
 * last {@link overlapSamples} samples to the head of the buffer as overlap context for
 * the next chunk, and resets the write cursor accordingly.
 *
 * The overlap strategy prevents words straddling chunk boundaries from being silently
 * dropped by the Whisper model.
 *
 * @module streaming-stt-whisper/SlidingWindowBuffer
 */

import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default chunk size in samples.
 * At 16 kHz this corresponds to exactly 1 second of mono audio.
 */
export const DEFAULT_CHUNK_SIZE_SAMPLES = 16_000;

/**
 * Default overlap in samples carried forward to the next chunk.
 * At 16 kHz this corresponds to 200 ms of audio context.
 */
export const DEFAULT_OVERLAP_SAMPLES = 3_200;

// ---------------------------------------------------------------------------
// Events interface (TypeScript augmentation for typed emit/on)
// ---------------------------------------------------------------------------

/** Event map for {@link SlidingWindowBuffer}. */
export interface SlidingWindowBufferEvents {
  /** Emitted when a complete chunk of {@link chunkSizeSamples} is ready. */
  chunk_ready: [chunk: Float32Array];
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Ring-buffer that accumulates raw PCM samples and emits fixed-size audio
 * chunks with configurable overlap.
 *
 * @example
 * ```ts
 * const buf = new SlidingWindowBuffer(16_000, 3_200);
 * buf.on('chunk_ready', (chunk) => sendToWhisper(chunk));
 *
 * microphone.on('frame', (f) => buf.pushSamples(f.samples));
 * await buf.flush(); // emit any remaining samples
 * ```
 */
export class SlidingWindowBuffer extends EventEmitter {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  /**
   * Internal sample store.  Sized to {@link chunkSizeSamples} so a single
   * allocation is reused for the lifetime of the session.
   */
  private buffer: Float32Array;

  /**
   * Current write position within {@link buffer}.
   * Always in the range `[0, chunkSizeSamples)`.
   */
  private writePos = 0;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param chunkSizeSamples - Number of samples per emitted chunk.
   *   Defaults to {@link DEFAULT_CHUNK_SIZE_SAMPLES} (1 s at 16 kHz).
   * @param overlapSamples - Number of samples carried forward from each chunk
   *   to the start of the next.  Must be less than `chunkSizeSamples`.
   *   Defaults to {@link DEFAULT_OVERLAP_SAMPLES} (200 ms at 16 kHz).
   */
  constructor(
    private readonly chunkSizeSamples: number = DEFAULT_CHUNK_SIZE_SAMPLES,
    private readonly overlapSamples: number = DEFAULT_OVERLAP_SAMPLES,
  ) {
    super();

    if (overlapSamples >= chunkSizeSamples) {
      throw new RangeError(
        `overlapSamples (${overlapSamples}) must be less than chunkSizeSamples (${chunkSizeSamples})`,
      );
    }

    this.buffer = new Float32Array(chunkSizeSamples);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Append audio samples to the internal buffer.
   *
   * If the incoming batch causes the buffer to reach or exceed
   * {@link chunkSizeSamples}, one or more `'chunk_ready'` events are emitted
   * before the remainder is retained for the next chunk.  Each chunk includes
   * an overlap region copied from the tail of the previous chunk.
   *
   * @param samples - Float32 PCM samples to append.
   */
  pushSamples(samples: Float32Array): void {
    let srcOffset = 0;

    while (srcOffset < samples.length) {
      // How many samples can we copy into the current chunk before it is full?
      const spaceLeft = this.chunkSizeSamples - this.writePos;
      const copyCount = Math.min(spaceLeft, samples.length - srcOffset);

      this.buffer.set(samples.subarray(srcOffset, srcOffset + copyCount), this.writePos);
      this.writePos += copyCount;
      srcOffset += copyCount;

      if (this.writePos >= this.chunkSizeSamples) {
        // Chunk is full — emit a copy (not a reference to the internal buffer).
        this.emit('chunk_ready', this.buffer.slice());

        // Copy the last `overlapSamples` to the beginning of the buffer so that
        // the next chunk begins with audio context from the previous boundary.
        const overlapStart = this.chunkSizeSamples - this.overlapSamples;
        this.buffer.copyWithin(0, overlapStart, this.chunkSizeSamples);
        this.writePos = this.overlapSamples;
      }
    }
  }

  /**
   * Emit any samples currently held in the buffer as a final partial chunk.
   *
   * If the buffer contains no samples (`writePos === 0`), this is a no-op.
   * After flushing, the buffer is reset to an empty state.
   */
  flush(): void {
    if (this.writePos === 0) return;

    // Emit only the samples that were actually written (not the whole buffer).
    this.emit('chunk_ready', this.buffer.slice(0, this.writePos));
    this.reset();
  }

  /**
   * Clear all buffered samples and reset the write cursor to zero.
   *
   * Does NOT emit a `'chunk_ready'` event — use {@link flush} for that.
   */
  reset(): void {
    this.buffer = new Float32Array(this.chunkSizeSamples);
    this.writePos = 0;
  }

  // -------------------------------------------------------------------------
  // Accessors (useful for testing)
  // -------------------------------------------------------------------------

  /** Number of samples currently held in the buffer. */
  get bufferedSamples(): number {
    return this.writePos;
  }
}
