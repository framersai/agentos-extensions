// @ts-nocheck
/**
 * @file OpenWakeWordProvider.ts
 * @description Wake-word detection provider using OpenWakeWord ONNX models.
 *
 * [OpenWakeWord](https://github.com/dscripka/openWakeWord) is an open-source
 * wake-word / wake-phrase detection framework.  This provider loads any
 * compatible ONNX model via `onnxruntime-node` and processes 80 ms audio
 * frames (1280 samples at 16 kHz).
 *
 * Feature extraction uses a simple but effective two-element vector:
 * - **RMS energy**: root-mean-square amplitude of the frame, normalised to
 *   INT16 range → [0, 1].
 * - **Zero-crossing rate**: fraction of consecutive sample pairs whose sign
 *   differs → [0, 1].
 *
 * These features capture both energy and spectral texture without requiring
 * an additional mel-filterbank preprocessing step, making the implementation
 * self-contained and dependency-free beyond `onnxruntime-node`.
 *
 * @module openwakeword
 */

import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A detected wake-word event returned by {@link OpenWakeWordProvider.detect}.
 */
export interface WakeWordDetection {
  /** Human-readable keyword label (from constructor options). */
  keyword: string;
  /** Detection probability in [0, 1] as reported by the ONNX model. */
  confidence: number;
  /** Stable provider identifier. */
  providerId: 'openwakeword';
}

/**
 * Constructor options for {@link OpenWakeWordProvider}.
 */
export interface OpenWakeWordProviderOptions {
  /**
   * Absolute path to the ONNX wake-word model file.
   * Resolved from `OPENWAKEWORD_MODEL_PATH` env var when omitted.
   * @defaultValue `~/.agentos/models/openwakeword/hey_mycroft.onnx`
   */
  modelPath?: string;
  /**
   * Detection probability threshold.  The model output must exceed this value
   * for a detection to be returned.
   * @defaultValue `0.5`
   */
  threshold?: number;
  /**
   * Human-readable keyword label included in every {@link WakeWordDetection}.
   * @defaultValue `'hey mycroft'`
   */
  keyword?: string;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * OpenWakeWord ONNX wake-word provider.
 *
 * Implements the `WakeWordProvider` contract expected by the AgentOS voice
 * pipeline without taking a hard runtime dependency on the interface types.
 */
export class OpenWakeWordProvider {
  /** Stable provider identifier used by the AgentOS extension registry. */
  readonly id = 'openwakeword';

  private readonly _modelPath: string;
  private readonly _threshold: number;
  private readonly _keyword: string;

  /** Lazily loaded ONNX inference session. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _session: any | null = null;

  /**
   * Create a new {@link OpenWakeWordProvider}.
   *
   * @param options - Optional configuration.  All fields have sensible defaults.
   */
  constructor(options: OpenWakeWordProviderOptions = {}) {
    this._modelPath =
      options.modelPath ??
      process.env['OPENWAKEWORD_MODEL_PATH'] ??
      path.join(os.homedir(), '.agentos', 'models', 'openwakeword', 'hey_mycroft.onnx');
    this._threshold = options.threshold ?? 0.5;
    this._keyword = options.keyword ?? 'hey mycroft';
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily create the ONNX `InferenceSession`.
   *
   * Dynamic import keeps the peer dep truly optional at module-load time.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _getSession(): Promise<any> {
    if (!this._session) {
      const ort = await import('onnxruntime-node');
      this._session = await ort.InferenceSession.create(this._modelPath);
    }
    return this._session;
  }

  /**
   * Extract a two-element feature vector from a raw PCM frame.
   *
   * The features are:
   * 1. **Normalised RMS energy** — captures overall loudness.
   * 2. **Zero-crossing rate** — captures high-frequency content / spectral texture.
   *
   * Both values are in [0, 1] and are concatenated into a `Float32Array` of
   * length 2 for consumption by the ONNX model.
   *
   * @param frame - 16-bit signed PCM samples (Int16Array).
   * @returns A `Float32Array` with `[rmsNorm, zcr]`.
   */
  private _extractFeatures(frame: Int16Array): Float32Array {
    const n = frame.length;

    if (n === 0) {
      return new Float32Array([0, 0]);
    }

    // RMS energy, normalised to [0, 1] using the INT16 max (32768).
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const s = frame[i]!;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / n);
    const rmsNorm = Math.min(rms / 32768, 1);

    // Zero-crossing rate: count sign changes / (n - 1).
    let crossings = 0;
    for (let i = 1; i < n; i++) {
      const prev = frame[i - 1]!;
      const curr = frame[i]!;
      if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
        crossings++;
      }
    }
    const zcr = n > 1 ? crossings / (n - 1) : 0;

    return new Float32Array([rmsNorm, zcr]);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a single 80 ms audio frame and detect any wake-word.
   *
   * The frame should contain 1280 samples of 16-bit PCM at 16 kHz.  The method
   * extracts RMS energy and zero-crossing rate as a two-element feature vector,
   * runs ONNX inference, and returns a detection if the output probability
   * exceeds the configured threshold.
   *
   * @param frame      - 16-bit PCM audio frame as an `Int16Array` (1280 samples).
   * @param _sampleRate - Sample rate (informational; must be 16000).
   * @returns A {@link WakeWordDetection} when a wake-word is detected, or `null`.
   */
  async detect(frame: Int16Array, _sampleRate: number): Promise<WakeWordDetection | null> {
    const ort = await import('onnxruntime-node');
    const session = await this._getSession();

    const features = this._extractFeatures(frame);
    const inputTensor = new ort.Tensor('float32', features, [1, features.length]);

    const outputs = await session.run({ input: inputTensor });

    // The model is expected to output a single probability value.  We accept
    // the first element of the first output tensor regardless of key name.
    const outputValues = Object.values(outputs) as Array<{ data: Float32Array | number[] }>;
    const firstOutput = outputValues[0];
    const probability: number =
      firstOutput?.data != null ? Number(firstOutput.data[0] ?? 0) : 0;

    if (probability > this._threshold) {
      return {
        keyword: this._keyword,
        confidence: probability,
        providerId: 'openwakeword',
      };
    }

    return null;
  }

  /**
   * No-op reset.
   *
   * The simple feature extraction used here is stateless.  Call this method
   * if you want to explicitly signal a context boundary (e.g. after a false
   * positive), but it currently has no effect.
   */
  reset(): void {
    // Intentional no-op — feature extraction is stateless.
  }

  /**
   * Release the ONNX session resources.
   *
   * Call this when the provider is no longer needed.
   */
  async dispose(): Promise<void> {
    if (this._session) {
      // onnxruntime-node sessions do not expose a release/destroy API in all
      // versions; attempt graceful release if the method exists.
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      if (typeof this._session.release === 'function') {
        await (this._session as { release(): Promise<void> }).release();
      }
      this._session = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing / diagnostics)
  // ---------------------------------------------------------------------------

  /** Returns the resolved model path. */
  getModelPath(): string { return this._modelPath; }

  /** Returns the configured detection threshold. */
  getThreshold(): number { return this._threshold; }

  /** Returns the configured keyword label. */
  getKeyword(): string { return this._keyword; }
}
