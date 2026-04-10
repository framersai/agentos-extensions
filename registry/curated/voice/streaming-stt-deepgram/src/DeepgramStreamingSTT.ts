// @ts-nocheck
/**
 * @file DeepgramStreamingSTT.ts
 * @description {@link IStreamingSTT} factory implementation backed by Deepgram.
 *
 * {@link DeepgramStreamingSTT} is a thin factory that creates
 * {@link DeepgramStreamSession} instances on demand.  It holds no persistent
 * state other than the API key and a reference count used to implement
 * {@link isStreaming}.
 *
 * @module streaming-stt-deepgram/DeepgramStreamingSTT
 */

import { DeepgramStreamSession } from './DeepgramStreamSession.js';
import type { DeepgramStreamingConfig } from './types.js';

/** Minimal re-export of the StreamingSTTConfig shape used by this adapter. */
export interface StreamingSTTConfig {
  language?: string;
  interimResults?: boolean;
  punctuate?: boolean;
  profanityFilter?: boolean;
  providerOptions?: Record<string, unknown>;
}

/**
 * {@link IStreamingSTT}-compatible factory for Deepgram streaming sessions.
 *
 * Instantiate once per agent and reuse for the lifetime of the voice pipeline.
 * Each call to {@link startSession} opens an independent WebSocket connection
 * to Deepgram so that multiple concurrent sessions are supported.
 *
 * @example
 * ```ts
 * const stt = new DeepgramStreamingSTT(process.env.DEEPGRAM_API_KEY!);
 * const session = await stt.startSession({ language: 'fr-FR' });
 *
 * session.on('final_transcript', (evt) => console.log(evt.text));
 * microphone.on('frame', (f) => session.pushAudio(f));
 * ```
 */
export class DeepgramStreamingSTT {
  /**
   * Stable provider identifier used by the voice pipeline to select between
   * registered STT implementations.
   */
  readonly providerId = 'deepgram-streaming';

  /** `true` while at least one session has been created and not yet closed. */
  get isStreaming(): boolean {
    return this._activeSessions > 0;
  }

  /** Count of sessions opened but not yet closed. */
  private _activeSessions = 0;

  /**
   * @param apiKey - Deepgram API key.  Passed through to every session.
   */
  constructor(private readonly apiKey: string) {}

  /**
   * Open a new streaming recognition session.
   *
   * Provider-specific options can be forwarded via `config.providerOptions`
   * under the following keys:
   * - `model` — Deepgram model name (default `'nova-2'`).
   * - `diarize` — Enable speaker diarization (default `false`).
   * - `keywords` — Custom keyword list (default `[]`).
   * - `endpointing` — Native endpointing duration ms, or `false`.
   *
   * @param config - Generic session config merged with Deepgram defaults.
   * @returns A ready-to-use {@link DeepgramStreamSession}.
   */
  async startSession(config?: StreamingSTTConfig): Promise<DeepgramStreamSession> {
    const provOpts = (config?.providerOptions ?? {}) as Partial<DeepgramStreamingConfig>;

    const sessionConfig: DeepgramStreamingConfig = {
      apiKey: this.apiKey,
      language: config?.language ?? provOpts.language,
      punctuate: config?.punctuate ?? provOpts.punctuate,
      interimResults: config?.interimResults ?? provOpts.interimResults,
      model: provOpts.model,
      diarize: provOpts.diarize,
      keywords: provOpts.keywords,
      endpointing: provOpts.endpointing,
    };

    const session = new DeepgramStreamSession(sessionConfig);

    this._activeSessions++;
    session.once('close', () => {
      this._activeSessions = Math.max(0, this._activeSessions - 1);
    });

    return session;
  }
}
