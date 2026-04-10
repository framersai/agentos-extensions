// @ts-nocheck
/**
 * @file DeepgramStreamSession.ts
 * @description Active streaming STT session backed by the Deepgram WebSocket API.
 *
 * {@link DeepgramStreamSession} implements the {@link StreamingSTTSession} interface
 * (which extends `EventEmitter`) and adds Deepgram-specific convenience events:
 *
 * | Event                 | Payload              | Description                                           |
 * |-----------------------|----------------------|-------------------------------------------------------|
 * | `'transcript'`        | `TranscriptEvent`    | Every hypothesis (interim + final, per base interface)|
 * | `'interim_transcript'`| `TranscriptEvent`    | Non-final hypothesis only                             |
 * | `'final_transcript'`  | `TranscriptEvent`    | Final (stable) hypothesis                             |
 * | `'speech_start'`      | —                    | First non-empty word received in this utterance       |
 * | `'speech_end'`        | —                    | Deepgram `speech_final` flag fired                    |
 * | `'error'`             | `Error`              | Unrecoverable provider error                          |
 * | `'close'`             | —                    | Session fully terminated                              |
 *
 * ### Auto-reconnect
 * On an unexpected WebSocket close (code ≠ 1000/1001), the session buffers
 * incoming audio frames (up to 5 s worth at 16 kHz / 512 samples per frame)
 * and reattempts the connection with exponential back-off starting at 100 ms,
 * doubling each attempt up to a cap of 5 000 ms.
 *
 * @module streaming-stt-deepgram/DeepgramStreamSession
 */

import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import type { DeepgramStreamingConfig } from './types.js';
import { extractSpeakerFromWords, mapDeepgramWord } from './DeepgramDiarizationAdapter.js';
import type { DeepgramWord } from './DeepgramDiarizationAdapter.js';

// ---------------------------------------------------------------------------
// Voice pipeline type imports (shapes only — no runtime dep on agentos at test time)
// ---------------------------------------------------------------------------

/** Minimal AudioFrame shape — mirrors packages/agentos/src/voice-pipeline/types.ts */
export interface AudioFrame {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
  speakerHint?: string;
}

/** Minimal TranscriptWord shape. */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

/** Minimal TranscriptEvent shape. */
export interface TranscriptEvent {
  text: string;
  confidence: number;
  words: TranscriptWord[];
  isFinal: boolean;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Deepgram WebSocket entry point for streaming recognition. */
const DEEPGRAM_WS_BASE = 'wss://api.deepgram.com/v1/listen';

/** Maximum number of audio frames to buffer during reconnect (~5 s at 16 kHz/512). */
const MAX_BUFFER_FRAMES = 500;

/** Initial reconnect back-off delay in milliseconds. */
const BACKOFF_INITIAL_MS = 100;

/** Maximum reconnect back-off delay in milliseconds. */
const BACKOFF_MAX_MS = 5_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a Float32Array of normalised PCM samples to a 16-bit signed integer
 * PCM Buffer (little-endian), as required by the Deepgram `linear16` encoding.
 *
 * Samples are clamped to [-1, 1] before scaling to prevent wrap-around on
 * values outside the normalised range.
 *
 * @param samples - Float32 PCM input, each sample in [-1, 1].
 * @returns Node.js `Buffer` of Int16 samples (2 bytes each, little-endian).
 */
function float32ToInt16Buffer(samples: Float32Array): Buffer {
  const buf = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    // Clamp to [-1, 1] then scale to the Int16 range.
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    buf.writeInt16LE(Math.round(clamped * 0x7fff), i * 2);
  }
  return buf;
}

/**
 * Build the Deepgram WebSocket URL from the resolved configuration.
 *
 * @param cfg - Resolved Deepgram streaming configuration.
 * @returns Full `wss://` URL with query parameters.
 */
function buildWsUrl(cfg: Required<Omit<DeepgramStreamingConfig, 'keywords' | 'endpointing'>> & DeepgramStreamingConfig): string {
  const params = new URLSearchParams({
    model: cfg.model,
    language: cfg.language,
    punctuate: String(cfg.punctuate),
    interim_results: String(cfg.interimResults),
    diarize: String(cfg.diarize),
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
  });

  if (cfg.keywords && cfg.keywords.length > 0) {
    for (const kw of cfg.keywords) {
      params.append('keywords', kw);
    }
  }

  if (cfg.endpointing !== false && cfg.endpointing !== undefined) {
    params.set('endpointing', String(cfg.endpointing));
  }

  return `${DEEPGRAM_WS_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Active streaming STT session backed by a Deepgram WebSocket connection.
 *
 * Construct via {@link DeepgramStreamingSTT.startSession} rather than directly.
 *
 * @example
 * ```ts
 * const session = new DeepgramStreamSession({ apiKey: process.env.DEEPGRAM_API_KEY! });
 *
 * session.on('interim_transcript', (evt) => process.stdout.write(`\r${evt.text}`));
 * session.on('final_transcript',   (evt) => console.log(`FINAL: ${evt.text}`));
 * session.on('speech_end',         ()    => console.log('utterance ended'));
 *
 * // Push audio frames from a microphone source:
 * microphone.on('frame', (frame) => session.pushAudio(frame));
 *
 * // Signal end of utterance:
 * await session.flush();
 * session.close();
 * ```
 */
export class DeepgramStreamSession extends EventEmitter {
  // -------------------------------------------------------------------------
  // Private state
  // -------------------------------------------------------------------------

  /** Resolved configuration with all defaults applied. */
  private readonly cfg: DeepgramStreamingConfig & {
    model: string;
    language: string;
    punctuate: boolean;
    interimResults: boolean;
    diarize: boolean;
  };

  /** Current WebSocket connection (replaced on reconnect). */
  private ws: WebSocket | null = null;

  /** `true` once the first non-empty transcript arrives in this utterance. */
  private speechStarted = false;

  /** `true` after {@link close} is called — prevents reconnect attempts. */
  private closed = false;

  /**
   * Ring buffer of audio frames accumulated while the WebSocket is
   * reconnecting.  Capped at {@link MAX_BUFFER_FRAMES} to bound memory.
   */
  private reconnectBuffer: AudioFrame[] = [];

  /** Current reconnect back-off delay in milliseconds. */
  private backoffMs = BACKOFF_INITIAL_MS;

  /** Active reconnect timer handle. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** `true` while the WebSocket is open and ready to accept binary data. */
  private wsReady = false;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * @param config - Deepgram streaming configuration.  `apiKey` is required;
   *                 all other fields have sensible defaults.
   */
  constructor(config: DeepgramStreamingConfig) {
    super();

    // Apply defaults.
    this.cfg = {
      model: 'nova-2',
      language: 'en-US',
      punctuate: true,
      interimResults: true,
      diarize: false,
      ...config,
    };

    this.connect();
  }

  // -------------------------------------------------------------------------
  // StreamingSTTSession interface
  // -------------------------------------------------------------------------

  /**
   * Push a raw PCM audio frame into the recognition stream.
   *
   * Converts Float32 samples to Int16 linear PCM and transmits them as binary
   * over the WebSocket.  Frames received while the socket is reconnecting are
   * queued in {@link reconnectBuffer} (up to {@link MAX_BUFFER_FRAMES}).
   *
   * @param frame - Audio frame with normalised Float32 samples at any sample rate.
   *                Frames are sent as-is; resample to 16 kHz before calling if
   *                the source differs from the Deepgram session's `sample_rate`.
   */
  pushAudio(frame: AudioFrame): void {
    if (this.closed) return;

    const pcmBuffer = float32ToInt16Buffer(frame.samples);

    if (this.wsReady && this.ws) {
      this.ws.send(pcmBuffer);
    } else {
      // Buffer frames during reconnect — drop the oldest when full.
      if (this.reconnectBuffer.length >= MAX_BUFFER_FRAMES) {
        this.reconnectBuffer.shift();
      }
      this.reconnectBuffer.push(frame);
    }
  }

  /**
   * Signal end-of-utterance to Deepgram.
   *
   * Sends the JSON `{"type":"CloseStream"}` control message, instructing
   * Deepgram to flush any buffered audio and emit a final transcript before
   * closing the connection from their side.
   *
   * @returns A promise that resolves immediately after the message is enqueued.
   */
  async flush(): Promise<void> {
    if (this.ws && this.wsReady) {
      this.ws.send(JSON.stringify({ type: 'CloseStream' }));
    }
  }

  /**
   * Immediately terminate the session without waiting for a final result.
   *
   * Cancels any pending reconnect timer, marks the session as closed, and
   * terminates the underlying WebSocket.  After `close()` no further events
   * are emitted.
   */
  close(): void {
    this.closed = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.terminate();
      this.ws = null;
    }

    this.wsReady = false;
    this.emit('close');
  }

  // -------------------------------------------------------------------------
  // Internal — WebSocket lifecycle
  // -------------------------------------------------------------------------

  /**
   * Open (or reopen) the Deepgram WebSocket connection.
   *
   * Attaches `open`, `message`, `error`, and `close` handlers.  On successful
   * open the reconnect buffer is drained in order.
   */
  private connect(): void {
    if (this.closed) return;

    const url = buildWsUrl(this.cfg as Parameters<typeof buildWsUrl>[0]);

    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Token ${this.cfg.apiKey}`,
      },
    });

    this.ws = socket;

    socket.on('open', () => {
      this.wsReady = true;
      this.backoffMs = BACKOFF_INITIAL_MS; // reset on successful connect

      // Drain buffered frames accumulated during the reconnect window.
      const buffered = this.reconnectBuffer.splice(0);
      for (const frame of buffered) {
        const pcm = float32ToInt16Buffer(frame.samples);
        socket.send(pcm);
      }
    });

    socket.on('message', (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString()) as DeepgramMessage;
        this.handleMessage(msg);
      } catch {
        // Ignore malformed frames — Deepgram occasionally sends keep-alive
        // empty strings or non-JSON control bytes.
      }
    });

    socket.on('error', (err: Error) => {
      this.emit('error', err);
    });

    socket.on('close', (code: number) => {
      this.wsReady = false;
      this.ws = null;

      // Normal closure (1000 = Normal, 1001 = Going Away) or explicit close().
      const isNormal = code === 1000 || code === 1001;
      if (isNormal || this.closed) {
        if (!this.closed) {
          // Deepgram closed normally after a CloseStream — emit session close.
          this.emit('close');
        }
        return;
      }

      // Unexpected drop — schedule reconnect with exponential back-off.
      this.scheduleReconnect();
    });
  }

  /**
   * Schedule a reconnect attempt after the current {@link backoffMs} delay,
   * then double the delay for the next attempt (capped at {@link BACKOFF_MAX_MS}).
   */
  private scheduleReconnect(): void {
    if (this.closed) return;

    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // -------------------------------------------------------------------------
  // Internal — message parsing
  // -------------------------------------------------------------------------

  /**
   * Process a parsed Deepgram WebSocket message and emit the appropriate events.
   *
   * Deepgram sends two primary result types:
   * - `Results` — transcript hypotheses with `is_final` and `speech_final` flags.
   * - `Metadata` — session-level metadata (ignored here).
   *
   * @param msg - Parsed Deepgram JSON message.
   */
  private handleMessage(msg: DeepgramMessage): void {
    if (msg.type !== 'Results') return;

    const alt = msg.channel?.alternatives?.[0];
    if (!alt) return;

    const text = alt.transcript ?? '';
    const confidence = alt.confidence ?? 0;
    const rawWords: DeepgramWord[] = alt.words ?? [];

    const words = rawWords.map(mapDeepgramWord);

    // Determine majority speaker when diarization is enabled.
    const majoritySpeaker = this.cfg.diarize
      ? extractSpeakerFromWords(rawWords)
      : undefined;

    // Suppress empty interim frames — Deepgram emits these as silence padding.
    if (text.trim() === '' && !msg.is_final) return;

    // Emit 'speech_start' on the first non-empty transcript in this utterance.
    if (!this.speechStarted && text.trim() !== '') {
      this.speechStarted = true;
      this.emit('speech_start');
    }

    const event: TranscriptEvent = {
      text,
      confidence,
      words,
      isFinal: msg.is_final ?? false,
      durationMs: msg.duration !== undefined ? Math.round(msg.duration * 1000) : undefined,
    };

    // Attach majority speaker to the event as a convenience property.
    if (majoritySpeaker) {
      (event as TranscriptEvent & { speaker?: string }).speaker = majoritySpeaker;
    }

    // Base interface event — always emitted for both interim and final results.
    this.emit('transcript', event);

    if (msg.is_final) {
      this.emit('final_transcript', event);

      // Reset speech-started tracker for the next utterance.
      this.speechStarted = false;

      if (msg.speech_final) {
        this.emit('speech_end');
      }
    } else {
      this.emit('interim_transcript', event);
    }
  }
}

// ---------------------------------------------------------------------------
// Internal Deepgram message shapes
// ---------------------------------------------------------------------------

/** Parsed shape of a Deepgram WebSocket `Results` message. */
interface DeepgramMessage {
  type: string;
  is_final?: boolean;
  speech_final?: boolean;
  duration?: number;
  channel?: {
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
      words?: DeepgramWord[];
    }>;
  };
}
