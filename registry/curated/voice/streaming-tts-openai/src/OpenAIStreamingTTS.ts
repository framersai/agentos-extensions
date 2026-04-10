// @ts-nocheck
/**
 * @file OpenAIStreamingTTS.ts
 * @description {@link IStreamingTTS}-compatible factory for OpenAI TTS sessions.
 *
 * {@link OpenAIStreamingTTS} is a thin factory that creates
 * {@link OpenAITTSSession} instances on demand.  It holds no mutable state
 * other than an active-session reference count used to implement
 * {@link isStreaming}.
 *
 * @module streaming-tts-openai/OpenAIStreamingTTS
 */

import { OpenAITTSSession } from './OpenAITTSSession.js';
import type { OpenAIStreamingTTSConfig, StreamingTTSConfig } from './types.js';

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Factory for OpenAI-backed streaming TTS sessions.
 *
 * Instantiate once per agent and reuse across voice turns.  Each call to
 * {@link startSession} creates an independent {@link OpenAITTSSession} that
 * owns its own HTTP connection lifecycle.
 *
 * @example
 * ```ts
 * const tts = new OpenAIStreamingTTS({ apiKey: process.env.OPENAI_API_KEY! });
 * const session = await tts.startSession();
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 *
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 */
export class OpenAIStreamingTTS {
  /**
   * Stable provider identifier used by the voice pipeline to select between
   * registered TTS implementations.
   */
  readonly providerId = 'openai-streaming-tts';

  /** `true` while at least one session is open and not yet closed. */
  get isStreaming(): boolean {
    return this._activeSessions > 0;
  }

  /** Count of sessions opened but not yet closed or cancelled. */
  private _activeSessions = 0;

  /**
   * @param config - OpenAI provider configuration.  `apiKey` is required;
   *   all other fields have sensible defaults.
   */
  constructor(private readonly config: OpenAIStreamingTTSConfig) {}

  /**
   * Open a new streaming TTS session.
   *
   * Provider-specific options can be forwarded via `config.providerOptions`
   * under the following keys:
   * - `model`        — TTS model name (default `'tts-1'`).
   * - `voice`        — Voice preset (default `'nova'`).
   * - `format`       — Output format (default `'opus'`).
   * - `maxBufferMs`  — Flush timer duration ms (default `2000`).
   *
   * @param config - Generic session config merged with provider defaults.
   * @returns A ready-to-use {@link OpenAITTSSession}.
   */
  async startSession(config?: StreamingTTSConfig): Promise<OpenAITTSSession> {
    const provOpts = (config?.providerOptions ?? {}) as Partial<OpenAIStreamingTTSConfig>;

    // Session-level overrides take precedence over factory-level config.
    const sessionProviderConfig: OpenAIStreamingTTSConfig = {
      ...this.config,
      model:        provOpts.model        ?? this.config.model,
      voice:        provOpts.voice        ?? this.config.voice,
      format:       provOpts.format       ?? this.config.format,
      maxBufferMs:  provOpts.maxBufferMs  ?? this.config.maxBufferMs,
    };

    const session = new OpenAITTSSession(sessionProviderConfig, config ?? {});

    this._activeSessions++;

    // Decrement the counter when the session terminates for any reason.
    const onDone = (): void => {
      this._activeSessions = Math.max(0, this._activeSessions - 1);
    };
    session.once('close',     onDone);
    session.once('cancelled', onDone);

    return session;
  }
}
