/**
 * @file VoskSTTProvider.ts
 * @description Offline speech-to-text provider backed by the Vosk library.
 *
 * Vosk is a fully offline speech recognition toolkit.  A pre-downloaded model
 * directory must be available on disk; its path is supplied via the constructor
 * or the `VOSK_MODEL_PATH` environment variable, with a default of
 * `~/.agentos/models/vosk/`.
 *
 * The `vosk` package is declared as a peer dependency so it is loaded only at
 * runtime via dynamic `import()`.  This allows the module itself to be
 * imported without throwing when the peer is absent (e.g. in test environments
 * where the native addon may not be compiled).
 *
 * @module vosk
 */

import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Module-level singletons — shared across all provider instances so the
// model is loaded from disk at most once per process.
// ---------------------------------------------------------------------------

/** The lazily-loaded Vosk `Model` instance (shared singleton). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _model: any = null;

/** Resolved model directory path (set on first load). */
let _resolvedModelPath: string = '';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single recognised audio segment returned by the provider.
 *
 * Mirrors the generic `SpeechTranscriptionResult` shape used across the
 * AgentOS voice pipeline.
 */
export interface SpeechTranscriptionResult {
  /** The recognised text. */
  transcript: string;
  /** Confidence score in [0, 1]. Vosk does not expose per-utterance confidence; always 1. */
  confidence: number;
  /** Whether this is a final (non-speculative) result. Always `true` for batch calls. */
  isFinal: boolean;
}

/**
 * Audio frame passed to {@link VoskSTTProvider.transcribe}.
 */
export interface AudioData {
  /** Raw PCM bytes (LINEAR16, 16-bit little-endian). */
  data: Buffer;
  /** Sample rate in Hz. @defaultValue `16000` */
  sampleRate?: number;
}

/**
 * Constructor options for {@link VoskSTTProvider}.
 */
export interface VoskSTTOptions {
  /**
   * Absolute path to the Vosk model directory.
   * Falls back to `VOSK_MODEL_PATH` env var, then `~/.agentos/models/vosk/`.
   */
  modelPath?: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Vosk offline speech-to-text provider.
 *
 * Implements the `SpeechToTextProvider` contract expected by the AgentOS voice
 * pipeline without taking a hard runtime dependency on the interface types.
 *
 * ### Streaming support
 * `supportsStreaming` is `true` — Vosk natively supports incremental audio
 * frames via its `Recognizer.acceptWaveform()` API.  For a fully streaming
 * session, callers may obtain a raw `Recognizer` instance and feed frames
 * incrementally; `transcribe()` is the batch convenience wrapper.
 */
export class VoskSTTProvider {
  /** Stable provider identifier used by the AgentOS extension registry. */
  readonly id = 'vosk';

  /**
   * Indicates that Vosk supports streaming recognition natively.
   * Callers may use this flag to decide between batch and streaming modes.
   */
  readonly supportsStreaming = true;

  /** Resolved model path, set during construction. */
  private readonly _modelPath: string;

  /**
   * Create a new {@link VoskSTTProvider}.
   *
   * @param options - Optional configuration.  If `modelPath` is omitted the
   *   value is resolved from `VOSK_MODEL_PATH` env var or the default
   *   `~/.agentos/models/vosk/`.
   */
  constructor(options: VoskSTTOptions = {}) {
    this._modelPath =
      options.modelPath ??
      process.env['VOSK_MODEL_PATH'] ??
      path.join(os.homedir(), '.agentos', 'models', 'vosk');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily load the Vosk model singleton.
   *
   * The model is expensive to load from disk so it is shared across all
   * instances within the same process.  The path used by the first successful
   * load wins for the lifetime of the process.
   *
   * @returns The loaded Vosk `Model` instance.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _getModel(): Promise<any> {
    if (!_model) {
      // Dynamic import keeps the peer dep truly optional at module-load time.
      const vosk = await import('vosk');
      _resolvedModelPath = this._modelPath;
      _model = new vosk.Model(_resolvedModelPath);
    }
    return _model;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Transcribe a batch PCM audio buffer using the local Vosk model.
   *
   * The audio must be encoded as LINEAR16 (raw PCM, 16-bit little-endian) at
   * the specified sample rate (default 16 kHz).
   *
   * Internally a short-lived `Recognizer` is created for each call, the
   * waveform is accepted in one shot, and `finalResult()` is used to obtain
   * the final hypothesis.
   *
   * @param audio - Audio frame containing the raw PCM bytes and sample rate.
   * @returns Array containing a single {@link SpeechTranscriptionResult}.
   */
  async transcribe(audio: AudioData): Promise<SpeechTranscriptionResult[]> {
    const vosk = await import('vosk');
    const model = await this._getModel();
    const sampleRate = audio.sampleRate ?? 16000;

    // Create a fresh recogniser for each batch call.
    const recognizer = new vosk.Recognizer({ model, sampleRate });

    try {
      recognizer.acceptWaveform(audio.data);
      // finalResult() flushes any pending partial hypothesis.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result: { text: string } = recognizer.finalResult() as any;
      return [
        {
          transcript: result.text ?? '',
          confidence: 1,
          isFinal: true,
        },
      ];
    } finally {
      // Free native recogniser memory.
      recognizer.free();
    }
  }

  /**
   * Expose the resolved model path for diagnostics and testing.
   *
   * @returns The model path that will be (or has been) loaded.
   */
  getModelPath(): string {
    return this._modelPath;
  }
}

// ---------------------------------------------------------------------------
// Internal test helpers — exported only for use in the test suite
// ---------------------------------------------------------------------------

/**
 * Reset the module-level model singleton.
 *
 * **For testing only.** Calling this function allows unit tests to verify that
 * the model is loaded lazily (exactly once) across multiple provider instances.
 *
 * @internal
 */
export function _resetModelSingleton(): void {
  _model = null;
  _resolvedModelPath = '';
}

/**
 * Return the currently loaded model singleton (may be `null`).
 *
 * **For testing only.**
 *
 * @internal
 */
export function _getModelSingleton(): unknown {
  return _model;
}

/**
 * Return the model path that was used when the singleton was loaded.
 *
 * **For testing only.**
 *
 * @internal
 */
export function _getResolvedModelPath(): string {
  return _resolvedModelPath;
}
