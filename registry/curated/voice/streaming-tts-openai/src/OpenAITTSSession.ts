// @ts-nocheck
/**
 * @file OpenAITTSSession.ts
 * @description Active TTS session backed by the OpenAI Audio Speech API.
 *
 * {@link OpenAITTSSession} implements the `StreamingTTSSession` interface
 * (EventEmitter) and provides the following events:
 *
 * | Event                | Payload                    | Description                                     |
 * |----------------------|----------------------------|-------------------------------------------------|
 * | `'utterance_start'`  | `{ text: string }`         | Sentence chunk dispatched for synthesis         |
 * | `'audio_chunk'`      | `EncodedAudioChunk`        | Synthesised audio buffer ready for playback     |
 * | `'utterance_complete'`| `{ text, durationMs }`    | Synthesis complete for a sentence chunk         |
 * | `'cancelled'`        | `{ remaining: string }`    | Session cancelled; remaining text not rendered  |
 * | `'error'`            | `Error`                    | Unrecoverable synthesis error                   |
 * | `'close'`            | —                          | Session fully terminated                        |
 *
 * ### Pipelining
 * The session maintains a promise chain so that each sentence is fetched and
 * emitted in the original order.  Fetches are started eagerly (as soon as a
 * sentence is ready) and their results are consumed in sequence via the chain.
 *
 * @module streaming-tts-openai/OpenAITTSSession
 */

import { EventEmitter } from 'node:events';
import { AdaptiveSentenceChunker } from './AdaptiveSentenceChunker.js';
import type { OpenAIStreamingTTSConfig, StreamingTTSConfig, EncodedAudioChunk } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** OpenAI TTS API sample rate — always 24 kHz regardless of format. */
const SAMPLE_RATE_HZ = 24_000;

/**
 * Rough estimate of spoken word rate used to compute {@link EncodedAudioChunk.durationMs}.
 * 150 words per minute = 2.5 words per second.
 */
const WORDS_PER_MS = 150 / 60_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the spoken duration in milliseconds for a given sentence.
 *
 * Uses a simple word-count heuristic (150 WPM) rather than decoding the audio,
 * which would require codec-specific libraries.  Callers should treat the result
 * as a hint rather than a precise measurement.
 *
 * @param text - The synthesised sentence.
 * @returns Estimated playback duration in milliseconds.
 */
function estimateDurationMs(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(200, Math.round(wordCount / WORDS_PER_MS));
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Active streaming TTS session backed by the OpenAI Audio Speech API.
 *
 * Construct via {@link OpenAIStreamingTTS.startSession} rather than directly.
 *
 * @example
 * ```ts
 * const session = new OpenAITTSSession(
 *   { apiKey: process.env.OPENAI_API_KEY! },
 *   {},
 * );
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 * session.on('utterance_complete', ({ text, durationMs }) => {
 *   console.log(`Synthesised "${text}" in ~${durationMs} ms`);
 * });
 *
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 */
export class OpenAITTSSession extends EventEmitter {
  // -------------------------------------------------------------------------
  // Resolved config
  // -------------------------------------------------------------------------

  /** Full API base URL (no trailing slash). */
  private readonly baseUrl: string;

  /** TTS model name. */
  private readonly model: string;

  /** Voice preset. */
  private readonly voice: string;

  /** Audio output format / codec. */
  private readonly format: string;

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  /** Sentence boundary detector fed by {@link pushTokens}. */
  private readonly chunker: AdaptiveSentenceChunker;

  /**
   * Ordered promise chain that serialises audio emission.
   *
   * Each new sentence appends a fetch promise to the tail of the chain so
   * that `audio_chunk` events fire in the same order as the input text,
   * even when one fetch completes faster than an earlier one.
   */
  private fetchChain: Promise<void> = Promise.resolve();

  /**
   * Set of AbortControllers for all in-flight fetch requests.
   *
   * Used by {@link cancel} to abort every pending HTTP call immediately.
   */
  private readonly abortControllers: Set<AbortController> = new Set();

  /** `true` after {@link close} or {@link cancel} is called. */
  private closed = false;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param providerConfig - OpenAI-specific configuration (apiKey required).
   * @param _sessionConfig - Generic voice-pipeline session config (currently
   *   used only for future `language` forwarding).
   */
  constructor(
    private readonly providerConfig: OpenAIStreamingTTSConfig,
    _sessionConfig: StreamingTTSConfig,
  ) {
    super();

    // Apply defaults.
    this.baseUrl = (providerConfig.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');
    this.model   = providerConfig.model   ?? 'tts-1';
    this.voice   = providerConfig.voice   ?? 'nova';
    this.format  = providerConfig.format  ?? 'opus';

    const maxBufferMs = providerConfig.maxBufferMs ?? 2000;
    this.chunker = new AdaptiveSentenceChunker(maxBufferMs);

    // Wire chunker → fetch pipeline.
    this.chunker.on('sentence', (sentence: string) => {
      this.enqueueFetch(sentence);
    });
  }

  // -------------------------------------------------------------------------
  // StreamingTTSSession interface
  // -------------------------------------------------------------------------

  /**
   * Push LLM output token(s) into the sentence chunker.
   *
   * The chunker will buffer tokens and emit a `'sentence'` event once a
   * boundary is detected or the flush timer expires.
   *
   * @param text - One or more LLM token characters to append.
   */
  pushTokens(text: string): void {
    if (this.closed) return;
    this.chunker.pushTokens(text);
  }

  /**
   * Flush the chunker and wait for all pending synthesis fetches to complete.
   *
   * Call this when the LLM stream has ended.  The returned promise resolves
   * once every in-flight request has been processed and the corresponding
   * `audio_chunk` / `utterance_complete` events have been emitted.
   *
   * @returns Promise that resolves when the pipeline is drained.
   */
  async flush(): Promise<void> {
    if (this.closed) return;
    this.chunker.flush();
    // Wait for all fetch promises currently in the chain.
    await this.fetchChain;
  }

  /**
   * Abort all in-flight synthesis requests and emit a `'cancelled'` event
   * carrying any text that was still buffered in the chunker at the time of
   * cancellation.
   *
   * No further events are emitted after `cancel()`.
   */
  cancel(): void {
    if (this.closed) return;
    this.closed = true;

    // Retrieve unsynthesised text from the chunker before aborting.
    const remaining = this.chunker.cancel();

    // Abort every in-flight fetch.
    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();

    this.emit('cancelled', { remaining });
  }

  /**
   * Perform orderly teardown of the session.
   *
   * Cancels the chunker timer, aborts any remaining fetches, and emits a
   * `'close'` event.  Idempotent — safe to call multiple times.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.chunker.cancel();

    for (const controller of this.abortControllers) {
      controller.abort();
    }
    this.abortControllers.clear();

    this.emit('close');
  }

  // -------------------------------------------------------------------------
  // Internal — fetch pipeline
  // -------------------------------------------------------------------------

  /**
   * Add a TTS synthesis task for `sentence` to the end of the ordered fetch
   * chain.
   *
   * The fetch itself starts immediately (eager) so the HTTP round-trip begins
   * as soon as the sentence is ready.  However, the `audio_chunk` and
   * `utterance_complete` events are only emitted after all *preceding* tasks in
   * the chain have finished, preserving sequential output order.
   *
   * @param sentence - The sentence text to synthesise.
   */
  private enqueueFetch(sentence: string): void {
    if (this.closed) return;

    // Start the HTTP request immediately (eager fetch).
    const fetchPromise = this.synthesise(sentence);

    // Chain emission after any prior work completes.
    this.fetchChain = this.fetchChain.then(async () => {
      if (this.closed) return;
      await fetchPromise;
    });
  }

  /**
   * Perform the OpenAI TTS HTTP request for a single sentence and emit the
   * corresponding audio events.
   *
   * Emits (in order):
   * 1. `'utterance_start'` — before the request begins.
   * 2. `'audio_chunk'`     — with the synthesised audio buffer.
   * 3. `'utterance_complete'` — after the buffer is ready.
   *
   * On fetch error, emits `'error'` and swallows the exception so the chain
   * continues with the next sentence.
   *
   * @param sentence - The sentence text to synthesise.
   */
  private async synthesise(sentence: string): Promise<void> {
    if (this.closed) return;

    this.emit('utterance_start', { text: sentence });

    const controller = new AbortController();
    this.abortControllers.add(controller);

    try {
      const response = await fetch(`${this.baseUrl}/v1/audio/speech`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.providerConfig.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model:           this.model,
          voice:           this.voice,
          input:           sentence,
          response_format: this.format,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`OpenAI TTS request failed (${response.status}): ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio       = Buffer.from(arrayBuffer);
      const durationMs  = estimateDurationMs(sentence);

      const chunk: EncodedAudioChunk = {
        audio,
        format:     this.format,
        sampleRate: SAMPLE_RATE_HZ,
        durationMs,
        text:       sentence,
      };

      if (!this.closed) {
        this.emit('audio_chunk', chunk);
        this.emit('utterance_complete', { text: sentence, durationMs });
      }
    } catch (err: unknown) {
      // Suppress AbortError — it is an expected outcome of cancel().
      if (err instanceof Error && err.name === 'AbortError') return;

      if (!this.closed) {
        this.emit('error', err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      this.abortControllers.delete(controller);
    }
  }
}
