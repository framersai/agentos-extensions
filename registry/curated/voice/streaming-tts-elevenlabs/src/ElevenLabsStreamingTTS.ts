/**
 * @file ElevenLabsStreamingTTS.ts
 * @description {@link IStreamingTTS}-compatible factory for ElevenLabs TTS sessions.
 *
 * {@link ElevenLabsStreamingTTS} is a thin factory that creates
 * {@link ElevenLabsTTSSession} instances on demand.  It holds no mutable state
 * other than an active-session reference count used to implement {@link isStreaming}.
 *
 * @module streaming-tts-elevenlabs/ElevenLabsStreamingTTS
 */

import { ElevenLabsTTSSession } from './ElevenLabsTTSSession.js';
import type { ElevenLabsStreamingTTSConfig, StreamingTTSConfig } from './types.js';

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Factory for ElevenLabs-backed streaming TTS sessions.
 *
 * Instantiate once per agent and reuse across voice turns.  Each call to
 * {@link startSession} creates an independent {@link ElevenLabsTTSSession} that
 * owns its own WebSocket connection lifecycle.
 *
 * @example
 * ```ts
 * const tts = new ElevenLabsStreamingTTS({ apiKey: process.env.ELEVENLABS_API_KEY! });
 * const session = await tts.startSession();
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 *
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 */
export class ElevenLabsStreamingTTS {
  /**
   * Stable provider identifier used by the voice pipeline to select between
   * registered TTS implementations.
   */
  readonly providerId = 'elevenlabs-streaming-tts';

  /** `true` while at least one session is open and not yet closed. */
  get isStreaming(): boolean {
    return this._activeSessions > 0;
  }

  /** Count of sessions opened but not yet closed or cancelled. */
  private _activeSessions = 0;

  /**
   * @param config - ElevenLabs provider configuration.  `apiKey` is required;
   *   all other fields have sensible defaults.
   */
  constructor(private readonly config: ElevenLabsStreamingTTSConfig) {}

  /**
   * Open a new streaming TTS session backed by a fresh WebSocket connection.
   *
   * Provider-specific options can be forwarded via `config.providerOptions`
   * under the following keys:
   * - `voiceId`        — ElevenLabs voice ID (default Rachel).
   * - `modelId`        — Model ID (default `'eleven_turbo_v2'`).
   * - `stability`      — Voice stability 0.0–1.0 (default `0.5`).
   * - `similarityBoost`— Similarity boost 0.0–1.0 (default `0.75`).
   * - `style`          — Style exaggeration 0.0–1.0 (default `0.0`).
   * - `useSpeakerBoost`— Speaker boost enabled (default `true`).
   *
   * @param config - Generic session config merged with provider defaults.
   * @returns A ready-to-use {@link ElevenLabsTTSSession}.
   */
  async startSession(config?: StreamingTTSConfig): Promise<ElevenLabsTTSSession> {
    const provOpts = (config?.providerOptions ?? {}) as Partial<ElevenLabsStreamingTTSConfig>;

    // Session-level overrides take precedence over factory-level config.
    const sessionProviderConfig: ElevenLabsStreamingTTSConfig = {
      ...this.config,
      voiceId:        provOpts.voiceId         ?? this.config.voiceId,
      modelId:        provOpts.modelId         ?? this.config.modelId,
      stability:      provOpts.stability       ?? this.config.stability,
      similarityBoost:provOpts.similarityBoost ?? this.config.similarityBoost,
      style:          provOpts.style           ?? this.config.style,
      useSpeakerBoost:provOpts.useSpeakerBoost ?? this.config.useSpeakerBoost,
    };

    const session = new ElevenLabsTTSSession(sessionProviderConfig, config ?? {});

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
