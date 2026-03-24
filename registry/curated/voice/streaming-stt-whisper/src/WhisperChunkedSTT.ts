/**
 * @file WhisperChunkedSTT.ts
 * @description {@link IStreamingSTT}-compatible factory backed by OpenAI Whisper HTTP API.
 *
 * {@link WhisperChunkedSTT} is a thin factory that creates {@link WhisperChunkSession}
 * instances on demand.  It holds no persistent mutable state other than the API key
 * and an active-session reference counter used to implement {@link isStreaming}.
 *
 * @module streaming-stt-whisper/WhisperChunkedSTT
 */

import { WhisperChunkSession } from './WhisperChunkSession.js';
import type { WhisperChunkedConfig } from './types.js';

// ---------------------------------------------------------------------------
// Generic STT config shape (mirrors packages/agentos/src/voice-pipeline/types.ts)
// ---------------------------------------------------------------------------

/** Generic streaming STT session configuration accepted by {@link startSession}. */
export interface StreamingSTTConfig {
  language?: string;
  interimResults?: boolean;
  punctuate?: boolean;
  profanityFilter?: boolean;
  providerOptions?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Factory class
// ---------------------------------------------------------------------------

/**
 * {@link IStreamingSTT}-compatible factory for Whisper chunked sessions.
 *
 * Instantiate once per agent and reuse across the lifetime of the voice pipeline.
 * Each call to {@link startSession} creates an independent {@link WhisperChunkSession}
 * with its own sliding-window buffer and in-flight fetch state.
 *
 * @example
 * ```ts
 * const stt = new WhisperChunkedSTT(process.env.OPENAI_API_KEY!);
 * const session = await stt.startSession({ language: 'en' });
 *
 * session.on('interim_transcript', (evt) => console.log(evt.text));
 * microphone.on('frame', (f) => session.pushAudio(f));
 * await session.flush();
 * ```
 */
export class WhisperChunkedSTT {
  /**
   * Stable provider identifier used by the voice pipeline to select between
   * registered STT implementations.
   */
  readonly providerId = 'whisper-chunked';

  /**
   * `true` while at least one session has been opened and not yet closed.
   */
  get isStreaming(): boolean {
    return this._activeSessions > 0;
  }

  /** Count of sessions opened but not yet closed. */
  private _activeSessions = 0;

  /**
   * @param apiKey - OpenAI (or compatible) API key passed to every session.
   * @param baseUrl - Optional base URL override (e.g. for self-hosted Whisper).
   */
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl?: string,
  ) {}

  /**
   * Open a new chunked Whisper recognition session.
   *
   * Provider-specific options can be forwarded via `config.providerOptions`
   * using the following keys:
   * - `model` — Whisper model name (default `'whisper-1'`).
   * - `baseUrl` — API base URL override.
   * - `prompt` — Initial transcription prompt.
   * - `chunkSizeSamples` — Samples per chunk (default 16 000).
   * - `overlapSamples` — Overlap samples (default 3 200).
   *
   * @param config - Generic session configuration.
   * @returns A configured and ready-to-use {@link WhisperChunkSession}.
   */
  async startSession(config?: StreamingSTTConfig): Promise<WhisperChunkSession> {
    const provOpts = (config?.providerOptions ?? {}) as Partial<WhisperChunkedConfig>;

    const sessionConfig: WhisperChunkedConfig = {
      apiKey: this.apiKey,
      baseUrl: (provOpts.baseUrl as string | undefined) ?? this.baseUrl,
      model: provOpts.model as string | undefined,
      language: config?.language ?? (provOpts.language as string | undefined),
      prompt: provOpts.prompt as string | undefined,
      chunkSizeSamples: provOpts.chunkSizeSamples as number | undefined,
      overlapSamples: provOpts.overlapSamples as number | undefined,
    };

    const session = new WhisperChunkSession(sessionConfig);

    this._activeSessions++;
    session.once('close', () => {
      this._activeSessions = Math.max(0, this._activeSessions - 1);
    });

    return session;
  }
}
