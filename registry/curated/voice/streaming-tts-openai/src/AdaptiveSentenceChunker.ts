/**
 * @file AdaptiveSentenceChunker.ts
 * @description Buffers LLM token stream and emits complete sentence chunks.
 *
 * {@link AdaptiveSentenceChunker} sits between the LLM token stream and the
 * TTS synthesis pipeline.  Rather than synthesising each tiny token fragment
 * individually, it accumulates tokens and emits a `'sentence'` event whenever
 * a sentence boundary is detected (`.`, `?`, `!`, `;` followed by whitespace
 * or end-of-input).  A fallback flush timer ensures audio is never blocked
 * indefinitely on fragments that lack terminal punctuation.
 *
 * @module streaming-tts-openai/AdaptiveSentenceChunker
 */

import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Regex — compiled once at module load
// ---------------------------------------------------------------------------

/**
 * Matches the first complete sentence within a string.
 *
 * Capture group 1: the sentence (including its terminal punctuation mark).
 * Capture group 2: remaining text after the inter-sentence whitespace.
 *
 * The `s` flag enables `.` to match newlines so multi-line inputs work.
 */
const SENTENCE_BOUNDARY = /^(.*?[.?!;])\s(.*)/s;

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

/**
 * Token accumulator that splits LLM output into TTS-friendly sentence chunks.
 *
 * ### Events
 *
 * | Event        | Payload  | Description                                    |
 * |--------------|----------|------------------------------------------------|
 * | `'sentence'` | `string` | A complete sentence ready for TTS synthesis    |
 *
 * ### Usage
 * ```ts
 * const chunker = new AdaptiveSentenceChunker(2000);
 * chunker.on('sentence', (text) => tts.synthesise(text));
 *
 * llm.on('token', (tok) => chunker.pushTokens(tok));
 * llm.on('end',   ()    => chunker.flush());
 * ```
 */
export class AdaptiveSentenceChunker extends EventEmitter {
  /** Accumulated text waiting for a sentence boundary. */
  private buffer: string = '';

  /** Handle for the fallback flush timer; `null` when inactive. */
  private flushTimer: NodeJS.Timeout | null = null;

  /**
   * @param maxBufferMs - Maximum time in milliseconds to hold buffered text
   *   before forcing a word-boundary flush.  Defaults to 2 000 ms.
   */
  constructor(private readonly maxBufferMs: number = 2000) {
    super();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Append one or more LLM output tokens to the internal buffer and check for
   * sentence boundaries.
   *
   * If a boundary is found (`[.?!;]` followed by whitespace), the text up to
   * and including the punctuation is emitted as a `'sentence'` event and the
   * remainder stays in the buffer.  The method recurses to catch multiple
   * boundaries in a single push (e.g. when a large chunk arrives at once).
   *
   * The fallback flush timer is reset on every call so that the 2 s window
   * always starts from the most recent token activity.
   *
   * @param text - Token fragment(s) to append.  May be an empty string (used
   *   internally to trigger boundary re-checks without appending new text).
   */
  pushTokens(text: string): void {
    this.buffer += text;
    this.resetFlushTimer();

    // Check for sentence boundaries: [.?!;] followed by whitespace
    const match = this.buffer.match(SENTENCE_BOUNDARY);
    if (match) {
      const sentence = match[1]!;
      this.buffer = match[2]!;
      this.emit('sentence', sentence);

      // Recurse to handle multiple consecutive sentences in the buffer.
      if (this.buffer.length > 0) {
        this.pushTokens('');
      }
    }
  }

  /**
   * Flush any remaining buffered text immediately, without waiting for the
   * fallback timer.
   *
   * Call this when the LLM stream has ended to ensure the final fragment is
   * synthesised even if it lacks terminal punctuation.
   *
   * Emits a `'sentence'` event with the trimmed buffer contents if non-empty.
   * Cancels the fallback timer.
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const remaining = this.buffer.trim();
    if (remaining.length > 0) {
      this.buffer = '';
      this.emit('sentence', remaining);
    }
  }

  /**
   * Immediately cancel the chunker: cancel the fallback timer, clear the
   * buffer, and return whatever text was pending.
   *
   * No `'sentence'` event is emitted.  The caller receives the raw remaining
   * text so it can report it as unsynthesised content in a `'cancelled'` event.
   *
   * @returns The text that was in the buffer at the time of cancellation.
   */
  cancel(): string {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    const remaining = this.buffer;
    this.buffer = '';
    return remaining;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Reset the fallback flush timer.
   *
   * If text remains in the buffer after {@link maxBufferMs} milliseconds of
   * inactivity, the timer breaks the accumulated text at the last word
   * boundary (space) and emits the portion before that boundary as a sentence.
   * If there is no word boundary, the entire buffer is emitted verbatim.
   *
   * This prevents TTS from stalling indefinitely on bullet points, code
   * snippets, or other text that lacks standard sentence-ending punctuation.
   */
  private resetFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;

      if (this.buffer.length === 0) return;

      // Prefer a clean word boundary over splitting mid-token.
      const lastSpace = this.buffer.lastIndexOf(' ');
      if (lastSpace > 0) {
        const chunk = this.buffer.slice(0, lastSpace);
        this.buffer = this.buffer.slice(lastSpace + 1);
        this.emit('sentence', chunk);
      } else {
        // No word boundary found — emit everything.
        const chunk = this.buffer;
        this.buffer = '';
        this.emit('sentence', chunk);
      }
    }, this.maxBufferMs);
  }
}
