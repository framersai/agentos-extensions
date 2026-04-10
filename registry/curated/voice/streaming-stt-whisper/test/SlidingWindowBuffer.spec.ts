// @ts-nocheck
/**
 * @file SlidingWindowBuffer.spec.ts
 * @description Unit tests for {@link SlidingWindowBuffer}.
 *
 * All tests are synchronous — SlidingWindowBuffer is a pure EventEmitter
 * with no async behaviour.
 */

import { describe, it, expect, vi } from 'vitest';
import { SlidingWindowBuffer, DEFAULT_CHUNK_SIZE_SAMPLES, DEFAULT_OVERLAP_SAMPLES } from '../src/SlidingWindowBuffer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a Float32Array filled with a constant value. */
function makeSamples(length: number, value = 0.5): Float32Array {
  return new Float32Array(length).fill(value);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SlidingWindowBuffer', () => {
  // 1. Constructor defaults
  it('exposes DEFAULT_CHUNK_SIZE_SAMPLES and DEFAULT_OVERLAP_SAMPLES constants', () => {
    expect(DEFAULT_CHUNK_SIZE_SAMPLES).toBe(16_000);
    expect(DEFAULT_OVERLAP_SAMPLES).toBe(3_200);
  });

  it('throws when overlapSamples >= chunkSizeSamples', () => {
    expect(() => new SlidingWindowBuffer(100, 100)).toThrow(RangeError);
    expect(() => new SlidingWindowBuffer(100, 150)).toThrow(RangeError);
  });

  // 2. chunk_ready emits when buffer fills
  it('emits chunk_ready exactly once when pushed exactly chunkSizeSamples', () => {
    const buf = new SlidingWindowBuffer(8, 2);
    const handler = vi.fn<[Float32Array], void>();
    buf.on('chunk_ready', handler);

    buf.pushSamples(makeSamples(8, 0.3));

    expect(handler).toHaveBeenCalledTimes(1);
    const chunk = handler.mock.calls[0]![0];
    expect(chunk.length).toBe(8);
    expect(chunk[0]).toBeCloseTo(0.3);
  });

  it('emits chunk_ready with a copy (not a reference to the internal buffer)', () => {
    const buf = new SlidingWindowBuffer(4, 1);
    let capturedChunk: Float32Array | null = null;
    buf.on('chunk_ready', (c) => { capturedChunk = c; });

    buf.pushSamples(makeSamples(4, 0.7));

    // Push another chunk — if it were the same reference, capturedChunk values
    // would be mutated.
    buf.pushSamples(makeSamples(3, 0.0)); // partial, no new emit
    expect(capturedChunk![0]).toBeCloseTo(0.7); // original value preserved
  });

  // 3. Overlap is carried forward correctly
  it('carries the last overlapSamples into the start of the next chunk', () => {
    // chunkSize=6, overlap=2
    // Push 6 samples with values [1,1,1,1,9,9] — last 2 are the overlap seeds.
    const buf = new SlidingWindowBuffer(6, 2);
    const chunks: Float32Array[] = [];
    buf.on('chunk_ready', (c) => chunks.push(c));

    const first = new Float32Array([1, 1, 1, 1, 9, 9]);
    buf.pushSamples(first); // emits chunk_ready → chunks[0]

    // Now push 4 more samples to complete the second chunk.
    // The buffer starts with [9, 9, _, _, _, _] (overlap from first chunk).
    const second = new Float32Array([2, 2, 2, 2]);
    buf.pushSamples(second); // emits chunk_ready → chunks[1]

    expect(chunks).toHaveLength(2);

    // Second chunk should start with the 2-sample overlap (values 9, 9)
    expect(chunks[1]![0]).toBeCloseTo(9);
    expect(chunks[1]![1]).toBeCloseTo(9);
    // Followed by the 4 new samples
    expect(chunks[1]![2]).toBeCloseTo(2);
    expect(chunks[1]![5]).toBeCloseTo(2);
  });

  // 4. Multiple chunks from a single pushSamples call
  it('emits multiple chunk_ready events when a large batch spans several chunks', () => {
    const buf = new SlidingWindowBuffer(4, 1);
    const handler = vi.fn<[Float32Array], void>();
    buf.on('chunk_ready', handler);

    // 4+4+4 = 12 samples with overlap=1 means writePos starts at 1 after each chunk.
    // After chunk 1 (4 samples): write 3 new + 1 overlap = 4 → chunk 2, etc.
    // Push enough to get at least 2 chunks.
    buf.pushSamples(makeSamples(4)); // emit #1
    buf.pushSamples(makeSamples(3)); // fill writePos 1+3=4 → emit #2

    expect(handler).toHaveBeenCalledTimes(2);
  });

  // 5. flush() emits remaining buffered audio
  it('flush() emits a chunk_ready for buffered partial data', () => {
    const buf = new SlidingWindowBuffer(8, 2);
    const handler = vi.fn<[Float32Array], void>();
    buf.on('chunk_ready', handler);

    buf.pushSamples(makeSamples(3, 0.4)); // partial — no emit yet
    expect(handler).not.toHaveBeenCalled();

    buf.flush();

    expect(handler).toHaveBeenCalledTimes(1);
    const chunk = handler.mock.calls[0]![0];
    // Only the 3 pushed samples should be in the chunk.
    expect(chunk.length).toBe(3);
    expect(chunk[0]).toBeCloseTo(0.4);
  });

  it('flush() is a no-op when the buffer is empty', () => {
    const buf = new SlidingWindowBuffer(8, 2);
    const handler = vi.fn();
    buf.on('chunk_ready', handler);

    buf.flush();
    expect(handler).not.toHaveBeenCalled();
  });

  it('flush() resets the write cursor so subsequent pushSamples starts fresh', () => {
    const buf = new SlidingWindowBuffer(8, 2);
    buf.pushSamples(makeSamples(3));
    buf.flush();

    expect(buf.bufferedSamples).toBe(0);

    // Push 3 more — should be 3 in buffer again (not 6).
    buf.pushSamples(makeSamples(3));
    expect(buf.bufferedSamples).toBe(3);
  });

  // 6. reset() clears state without emitting
  it('reset() clears buffered samples and emits no events', () => {
    const buf = new SlidingWindowBuffer(8, 2);
    const handler = vi.fn();
    buf.on('chunk_ready', handler);

    buf.pushSamples(makeSamples(5));
    buf.reset();

    expect(buf.bufferedSamples).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });

  // 7. Handles partial frames (smaller than chunkSize)
  it('accumulates multiple partial frames without emitting until chunk is full', () => {
    const buf = new SlidingWindowBuffer(10, 2);
    const handler = vi.fn();
    buf.on('chunk_ready', handler);

    buf.pushSamples(makeSamples(3));
    buf.pushSamples(makeSamples(3));
    buf.pushSamples(makeSamples(3));

    // 9 samples < chunkSize(10) — no emit yet
    expect(handler).not.toHaveBeenCalled();
    expect(buf.bufferedSamples).toBe(9);

    buf.pushSamples(makeSamples(1)); // now at 10 → emit

    expect(handler).toHaveBeenCalledTimes(1);
    // After emit, writePos = overlapSamples(2) due to carry-forward
    expect(buf.bufferedSamples).toBe(2);
  });

  // 8. bufferedSamples accessor
  it('bufferedSamples returns the current write position', () => {
    const buf = new SlidingWindowBuffer(16, 4);
    expect(buf.bufferedSamples).toBe(0);

    buf.pushSamples(makeSamples(6));
    expect(buf.bufferedSamples).toBe(6);

    buf.pushSamples(makeSamples(10)); // total 16 → emit, cursor reset to 4 (overlap)
    expect(buf.bufferedSamples).toBe(4);
  });
});
