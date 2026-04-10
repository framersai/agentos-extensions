// @ts-nocheck
/**
 * @file ElevenLabsTTSSession.ts
 * @description Active TTS session backed by the ElevenLabs WebSocket Streaming API.
 *
 * {@link ElevenLabsTTSSession} implements the `StreamingTTSSession` interface
 * (EventEmitter) and provides the following events:
 *
 * | Event                | Payload                    | Description                                          |
 * |----------------------|----------------------------|------------------------------------------------------|
 * | `'audio_chunk'`      | `EncodedAudioChunk`        | MP3 audio buffer from ElevenLabs, ready for playback |
 * | `'utterance_complete'`| `{ text, durationMs }`    | ElevenLabs signalled end of audio generation         |
 * | `'cancelled'`        | `{ remaining: string }`    | Session cancelled; remaining text not rendered       |
 * | `'error'`            | `Error`                    | WebSocket or protocol error                          |
 * | `'close'`            | —                          | Session fully terminated                             |
 *
 * ### Protocol Overview
 *
 * The ElevenLabs WebSocket streaming protocol works as follows:
 *
 * 1. Open WSS connection to the voice/model endpoint.
 * 2. Send a BOS (Beginning-Of-Stream) message: `{ text: " ", voice_settings: {...}, xi_api_key }`.
 * 3. Stream text tokens as `{ text: "..." }` JSON messages.
 * 4. To generate audio for accumulated text, include `flush: true` in the text message.
 * 5. To end the stream, send an EOS (End-Of-Stream) message: `{ text: "" }`.
 * 6. The server returns binary messages (MP3 audio chunks) and JSON status messages.
 * 7. When all audio has been generated the server sends `{ isFinal: true }`.
 *
 * @module streaming-tts-elevenlabs/ElevenLabsTTSSession
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { ElevenLabsStreamingTTSConfig, StreamingTTSConfig, EncodedAudioChunk } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ElevenLabs WebSocket API base URL. */
const ELEVENLABS_WS_BASE = 'wss://api.elevenlabs.io';

/** Default voice ID — Rachel (a neutral, clear English voice). */
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

/** Default model — ElevenLabs Turbo v2, optimized for low latency. */
const DEFAULT_MODEL_ID = 'eleven_turbo_v2';

/** MP3 output format at 44.1 kHz / 128 kbps. */
const OUTPUT_FORMAT = 'mp3_44100_128';

/** Sample rate that matches the OUTPUT_FORMAT specifier. */
const SAMPLE_RATE_HZ = 44_100;

/**
 * Rough estimate of spoken word rate used to compute {@link EncodedAudioChunk.durationMs}.
 * 150 words per minute.
 */
const WORDS_PER_MS = 150 / 60_000;

/** Regex matching sentence-final punctuation. */
const SENTENCE_BOUNDARY_RE = /[.?!]/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimate the spoken duration in milliseconds for a piece of text.
 *
 * Uses a simple word-count heuristic (150 WPM).  Callers should treat the result
 * as a hint rather than a precise measurement.
 *
 * @param text - The text to estimate duration for.
 * @returns Estimated playback duration in milliseconds (minimum 200 ms).
 */
function estimateDurationMs(text: string): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(200, Math.round(wordCount / WORDS_PER_MS));
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Active streaming TTS session backed by the ElevenLabs WebSocket Streaming API.
 *
 * Construct via {@link ElevenLabsStreamingTTS.startSession} rather than directly.
 *
 * @example
 * ```ts
 * const session = new ElevenLabsTTSSession(
 *   { apiKey: process.env.ELEVENLABS_API_KEY! },
 *   {},
 * );
 *
 * session.on('audio_chunk', (chunk) => audioPlayer.enqueue(chunk.audio));
 * session.on('utterance_complete', ({ text, durationMs }) => {
 *   console.log(`Synthesis complete ~${durationMs} ms`);
 * });
 *
 * llm.on('token', (tok) => session.pushTokens(tok));
 * llm.on('end',   ()    => session.flush());
 * ```
 */
export class ElevenLabsTTSSession extends EventEmitter {
  // -------------------------------------------------------------------------
  // Resolved config
  // -------------------------------------------------------------------------

  /** ElevenLabs voice ID. */
  private readonly voiceId: string;

  /** ElevenLabs model ID. */
  private readonly modelId: string;

  /** Voice stability (0.0 – 1.0). */
  private readonly stability: number;

  /** Similarity boost (0.0 – 1.0). */
  private readonly similarityBoost: number;

  /** Style exaggeration (0.0 – 1.0). */
  private readonly style: number;

  /** Whether to enable speaker boost. */
  private readonly useSpeakerBoost: boolean;

  // -------------------------------------------------------------------------
  // Internal state
  // -------------------------------------------------------------------------

  /** Live WebSocket connection to the ElevenLabs streaming endpoint. */
  private readonly ws: WebSocket;

  /**
   * Text that has been pushed since the last sentence-boundary flush.
   *
   * Accumulated so that `cancel()` can report the remaining un-synthesised text.
   */
  private pendingText = '';

  /** `true` after {@link close} or {@link cancel} is called. */
  private closed = false;

  /**
   * Whether the BOS (beginning-of-stream) message has been sent.
   *
   * The BOS is sent once on `ws.open`; subsequent messages are plain text sends.
   */
  private bosAcknowledged = false;

  /**
   * Queue of text segments that need to be sent once the WebSocket opens.
   *
   * If `pushTokens` or `flush` is called before the socket is open, messages
   * are queued here and drained on `ws.open`.
   */
  private readonly sendQueue: Array<object> = [];

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param providerConfig - ElevenLabs-specific configuration (apiKey required).
   * @param _sessionConfig - Generic voice-pipeline session config (reserved for
   *   future `language` forwarding).
   */
  constructor(
    private readonly providerConfig: ElevenLabsStreamingTTSConfig,
    _sessionConfig: StreamingTTSConfig,
  ) {
    super();

    // Apply defaults.
    this.voiceId        = providerConfig.voiceId        ?? DEFAULT_VOICE_ID;
    this.modelId        = providerConfig.modelId        ?? DEFAULT_MODEL_ID;
    this.stability      = providerConfig.stability      ?? 0.5;
    this.similarityBoost= providerConfig.similarityBoost ?? 0.75;
    this.style          = providerConfig.style          ?? 0.0;
    this.useSpeakerBoost= providerConfig.useSpeakerBoost ?? true;

    // Build the WebSocket endpoint URL.
    const wsUrl =
      `${ELEVENLABS_WS_BASE}/v1/text-to-speech/${this.voiceId}/stream-input` +
      `?model_id=${this.modelId}&output_format=${OUTPUT_FORMAT}`;

    this.ws = new WebSocket(wsUrl);

    this._wireWebSocket();
  }

  // -------------------------------------------------------------------------
  // StreamingTTSSession interface
  // -------------------------------------------------------------------------

  /**
   * Push LLM output token(s) into the stream.
   *
   * Text is accumulated in an internal buffer.  When a sentence boundary
   * (`.`, `?`, `!`) is detected the accumulated segment is sent to ElevenLabs
   * with `flush: true` so the server generates audio immediately.  Mid-sentence
   * tokens are sent with a trailing space continuation to avoid falling intonation
   * on partial phrases.
   *
   * @param text - One or more LLM token characters to append.
   */
  pushTokens(text: string): void {
    if (this.closed) return;

    this.pendingText += text;

    // Check for sentence-boundary punctuation.
    const hasBoundary = SENTENCE_BOUNDARY_RE.test(text);

    if (hasBoundary) {
      // Send the accumulated text with flush: true so ElevenLabs generates audio.
      const segment = this.pendingText;
      this.pendingText = '';
      this._send({ text: segment, flush: true });
    } else {
      // Send the token chunk without flush; include a space continuation to hint
      // that the phrase is mid-sentence (prevents falling prosody on partial text).
      this._send({ text });
    }
  }

  /**
   * Flush any remaining buffered text and signal EOS to ElevenLabs.
   *
   * Call this when the LLM stream has ended.  Sends an EOS (end-of-stream)
   * message (`{ text: "" }`) which instructs ElevenLabs to finalise audio
   * generation for all remaining buffered text and close the stream.
   *
   * @returns Promise that resolves when the EOS message is queued for sending.
   */
  async flush(): Promise<void> {
    if (this.closed) return;

    // If there is buffered text that has not been sent, send it with flush: true first.
    if (this.pendingText.trim().length > 0) {
      const segment = this.pendingText;
      this.pendingText = '';
      this._send({ text: segment, flush: true });
    }

    // Send EOS — empty string signals end of stream to ElevenLabs.
    this._send({ text: '' });
  }

  /**
   * Cancel the session immediately.
   *
   * Closes the WebSocket, discards any unsent text, and emits a `'cancelled'`
   * event carrying the remaining un-synthesised text.
   */
  cancel(): void {
    if (this.closed) return;
    this.closed = true;

    const remaining = this.pendingText;
    this.pendingText = '';

    this.ws.close();
    this.emit('cancelled', { remaining });
  }

  /**
   * Close the session cleanly.
   *
   * Sends a WebSocket close frame and emits a `'close'` event.
   * Idempotent — safe to call multiple times.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    this.ws.close();
    this.emit('close');
  }

  // -------------------------------------------------------------------------
  // Internal — WebSocket wiring
  // -------------------------------------------------------------------------

  /**
   * Attach event listeners to the WebSocket instance and handle the full
   * message lifecycle.
   */
  private _wireWebSocket(): void {
    this.ws.on('open', () => {
      // Send BOS message immediately on connection open.
      const bosMessage = {
        text: ' ',
        voice_settings: {
          stability:        this.stability,
          similarity_boost: this.similarityBoost,
          style:            this.style,
          use_speaker_boost: this.useSpeakerBoost,
        },
        xi_api_key: this.providerConfig.apiKey,
      };

      // Use the raw WS send to bypass the queue (BOS must be first).
      this.ws.send(JSON.stringify(bosMessage));
      this.bosAcknowledged = true;

      // Drain any messages queued before the socket opened.
      for (const queued of this.sendQueue) {
        this.ws.send(JSON.stringify(queued));
      }
      this.sendQueue.length = 0;
    });

    this.ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (this.closed) return;

      if (isBinary) {
        // Binary message: MP3 audio chunk.
        const audio = Buffer.isBuffer(data)
          ? data
          : Buffer.from(data as ArrayBuffer);

        const durationMs = estimateDurationMs(this.pendingText);

        const chunk: EncodedAudioChunk = {
          audio,
          format:     'mp3',
          sampleRate: SAMPLE_RATE_HZ,
          durationMs,
          text:       '',
        };

        this.emit('audio_chunk', chunk);
      } else {
        // Text (JSON) message: parse for protocol signals.
        try {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;

          if (msg['isFinal'] === true) {
            // ElevenLabs has finished generating all audio for this stream.
            const durationMs = estimateDurationMs(this.pendingText);
            this.emit('utterance_complete', { text: this.pendingText, durationMs });
          }

          // Other JSON messages (e.g. alignment data) are silently ignored for now.
        } catch {
          // Malformed JSON from the server — emit a non-fatal error.
          this.emit('error', new Error(`ElevenLabs: unexpected non-JSON text message: ${String(data)}`));
        }
      }
    });

    this.ws.on('error', (err: Error) => {
      if (!this.closed) {
        this.emit('error', err);
      }
    });

    this.ws.on('close', () => {
      if (!this.closed) {
        this.closed = true;
        this.emit('close');
      }
    });
  }

  /**
   * Send a JSON message over the WebSocket.
   *
   * If the socket is not yet open, the message is queued and will be sent once
   * the `open` event fires (after the BOS message is dispatched).
   *
   * @param msg - The message object to serialise and send.
   */
  private _send(msg: object): void {
    if (this.bosAcknowledged && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      // Queue for post-open delivery.
      this.sendQueue.push(msg);
    }
  }
}
