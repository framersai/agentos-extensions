// @ts-nocheck
/**
 * @file AdaptiveSentenceChunker.spec.ts
 * @description Unit tests for {@link AdaptiveSentenceChunker}.
 *
 * All timer-dependent tests use Vitest fake timers so no real delays occur.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdaptiveSentenceChunker } from '../src/AdaptiveSentenceChunker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Collect all `'sentence'` events emitted synchronously by `fn`.
 *
 * @param chunker - The chunker under test.
 * @param fn      - Callback that exercises the chunker.
 * @returns Array of collected sentence strings.
 */
function collectSentences(chunker: AdaptiveSentenceChunker, fn: () => void): string[] {
  const results: string[] = [];
  chunker.on('sentence', (s: string) => results.push(s));
  fn();
  return results;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AdaptiveSentenceChunker', () => {
  let chunker: AdaptiveSentenceChunker;

  beforeEach(() => {
    // Fresh chunker with a 2 000 ms flush window; real timers for most tests.
    chunker = new AdaptiveSentenceChunker(2000);
  });

  afterEach(() => {
    // Cancel any pending timers and clear the buffer between tests.
    chunker.cancel();
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // 1. Period + space
  // -------------------------------------------------------------------------

  it('emits sentence on period followed by a space', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('Hello world. ');
    });

    expect(sentences).toEqual(['Hello world.']);
  });

  // -------------------------------------------------------------------------
  // 2. Question mark
  // -------------------------------------------------------------------------

  it('emits sentence on question mark followed by a space', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('Are you there? ');
    });

    expect(sentences).toEqual(['Are you there?']);
  });

  // -------------------------------------------------------------------------
  // 3. Exclamation mark
  // -------------------------------------------------------------------------

  it('emits sentence on exclamation mark followed by a space', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('Watch out! ');
    });

    expect(sentences).toEqual(['Watch out!']);
  });

  // -------------------------------------------------------------------------
  // 4. Multiple sentences in one push
  // -------------------------------------------------------------------------

  it('handles multiple sentences arriving in a single pushTokens call', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('First sentence. Second sentence. Third ');
    });

    // Two complete sentences; "Third " is buffered.
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toBe('First sentence.');
    expect(sentences[1]).toBe('Second sentence.');
  });

  // -------------------------------------------------------------------------
  // 5. Fallback flush timer (fake timers)
  // -------------------------------------------------------------------------

  it('forces flush after maxBufferMs when no sentence boundary is found', () => {
    vi.useFakeTimers();

    const sentences: string[] = [];
    chunker.on('sentence', (s: string) => sentences.push(s));

    // Push text without terminal punctuation — no sentence emitted yet.
    chunker.pushTokens('This has no punctuation yet');
    expect(sentences).toHaveLength(0);

    // Advance time past the 2 000 ms window.
    vi.advanceTimersByTime(2001);

    // The timer fires and splits at the last word boundary.
    // "This has no punctuation yet" → emits "This has no punctuation", buffers "yet"
    expect(sentences).toHaveLength(1);
    expect(sentences[0]).toBe('This has no punctuation');
  });

  // -------------------------------------------------------------------------
  // 6. flush() emits remaining text
  // -------------------------------------------------------------------------

  it('flush() emits remaining buffered text even without punctuation', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('Partial sentence without end');
      chunker.flush();
    });

    expect(sentences).toEqual(['Partial sentence without end']);
  });

  // -------------------------------------------------------------------------
  // 7. cancel() returns remaining text and clears buffer
  // -------------------------------------------------------------------------

  it('cancel() returns remaining text and clears the internal buffer', () => {
    const sentences: string[] = [];
    chunker.on('sentence', (s: string) => sentences.push(s));

    chunker.pushTokens('Some text not yet emitted');
    const remaining = chunker.cancel();

    // cancel() must NOT emit a 'sentence' event.
    expect(sentences).toHaveLength(0);

    // It returns the buffered text verbatim.
    expect(remaining).toBe('Some text not yet emitted');

    // Buffer is now empty; a second cancel returns ''.
    expect(chunker.cancel()).toBe('');
  });

  // -------------------------------------------------------------------------
  // 8. Empty pushes
  // -------------------------------------------------------------------------

  it('handles empty pushTokens calls without emitting or throwing', () => {
    const sentences: string[] = [];
    chunker.on('sentence', (s: string) => sentences.push(s));

    expect(() => {
      chunker.pushTokens('');
      chunker.pushTokens('');
    }).not.toThrow();

    expect(sentences).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 9. Semicolon boundary
  // -------------------------------------------------------------------------

  it('treats semicolon followed by space as a sentence boundary', () => {
    const sentences = collectSentences(chunker, () => {
      chunker.pushTokens('First clause; second clause');
    });

    expect(sentences).toEqual(['First clause;']);
    // "second clause" stays buffered (no terminal punctuation yet)
  });

  // -------------------------------------------------------------------------
  // 10. Flush timer resets on each push
  // -------------------------------------------------------------------------

  it('resets the flush timer on each pushTokens call', () => {
    vi.useFakeTimers();

    const sentences: string[] = [];
    chunker.on('sentence', (s: string) => sentences.push(s));

    chunker.pushTokens('word ');
    vi.advanceTimersByTime(1800); // close to the 2 000 ms window

    // Push again — timer should reset.
    chunker.pushTokens('another ');
    vi.advanceTimersByTime(1800); // still under the reset window

    // No flush yet because the timer was reset.
    expect(sentences).toHaveLength(0);

    // Now advance past the full window from the last push.
    vi.advanceTimersByTime(400);
    expect(sentences).toHaveLength(1);
  });
});
