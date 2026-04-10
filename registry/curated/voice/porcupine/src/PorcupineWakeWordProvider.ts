// @ts-nocheck
/**
 * @file PorcupineWakeWordProvider.ts
 * @description Wake-word detection provider backed by Picovoice Porcupine.
 *
 * [Porcupine](https://picovoice.ai/platform/porcupine/) is an on-device
 * wake-word engine.  This provider wraps `@picovoice/porcupine-node` and
 * exposes the `WakeWordProvider` contract expected by the AgentOS voice
 * pipeline.
 *
 * The `@picovoice/porcupine-node` package is declared as a peer dependency so
 * it is loaded only at runtime via dynamic `import()`.
 *
 * ### Threading model
 * Porcupine's `process()` method is synchronous and stateless per-frame — each
 * 512-sample frame is processed independently.  The provider is therefore safe
 * to call from any async context.
 *
 * @module porcupine
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A detected wake-word event returned by {@link PorcupineWakeWordProvider.detect}.
 */
export interface WakeWordDetection {
  /** The keyword string that was detected (e.g. `'porcupine'`). */
  keyword: string;
  /**
   * Confidence score.  Porcupine does not expose a per-detection confidence;
   * this is always `1.0` to signal a positive detection.
   */
  confidence: 1.0;
  /** Stable provider identifier. */
  providerId: 'porcupine';
}

/**
 * Constructor options for {@link PorcupineWakeWordProvider}.
 */
export interface PorcupineWakeWordProviderOptions {
  /** Picovoice access key from https://console.picovoice.ai/ */
  accessKey: string;
  /**
   * Built-in keyword names to detect (e.g. `['porcupine', 'bumblebee']`).
   * @defaultValue `['porcupine']`
   */
  keywords?: string[];
  /**
   * Detection sensitivity in [0, 1] for each keyword.
   * Must be the same length as `keywords` when provided.
   * @defaultValue `[0.5]` (or `0.5` per keyword)
   */
  sensitivities?: number[];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Picovoice Porcupine wake-word provider.
 *
 * Implements the `WakeWordProvider` contract expected by the AgentOS voice
 * pipeline without taking a hard runtime dependency on the interface types.
 */
export class PorcupineWakeWordProvider {
  /** Stable provider identifier used by the AgentOS extension registry. */
  readonly id = 'porcupine';

  private readonly _accessKey: string;
  private readonly _keywords: string[];
  private readonly _sensitivities: number[];

  /** Lazily initialised Porcupine instance. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _porcupine: any | null = null;

  /**
   * Create a new {@link PorcupineWakeWordProvider}.
   *
   * @param options - Configuration including the required Picovoice access key.
   */
  constructor(options: PorcupineWakeWordProviderOptions) {
    this._accessKey = options.accessKey;
    this._keywords = options.keywords ?? ['porcupine'];
    this._sensitivities =
      options.sensitivities ?? this._keywords.map(() => 0.5);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Lazily initialise the Porcupine engine on first use.
   *
   * Dynamic import keeps the peer dep truly optional at module-load time.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async _getPorcupine(): Promise<any> {
    if (!this._porcupine) {
      const { Porcupine } = await import('@picovoice/porcupine-node');
      this._porcupine = new Porcupine(
        this._accessKey,
        this._keywords,
        this._sensitivities,
      );
    }
    return this._porcupine;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a single audio frame and detect any wake-word.
   *
   * Each frame must be exactly 512 samples of 16-bit PCM at 16 kHz (the
   * Porcupine frame length).  `sampleRate` is accepted for interface
   * compatibility but Porcupine always operates at 16 kHz.
   *
   * @param frame      - 16-bit PCM audio frame as an `Int16Array` (512 samples).
   * @param sampleRate - Sample rate (informational; must be 16000 for Porcupine).
   * @returns A {@link WakeWordDetection} when a keyword is detected, or `null`.
   */
  async detect(frame: Int16Array, _sampleRate: number): Promise<WakeWordDetection | null> {
    const porcupine = await this._getPorcupine();
    const keywordIndex: number = porcupine.process(frame);

    if (keywordIndex < 0) {
      // No detection.
      return null;
    }

    return {
      keyword: this._keywords[keywordIndex] ?? String(keywordIndex),
      confidence: 1.0,
      providerId: 'porcupine',
    };
  }

  /**
   * No-op reset.
   *
   * Porcupine processes frames statelessly; there is no internal buffer to
   * flush.  This method exists for interface compatibility.
   */
  reset(): void {
    // Intentional no-op — Porcupine is stateless per frame.
  }

  /**
   * Release the native Porcupine engine resources.
   *
   * Call this when the provider is no longer needed to free memory held by
   * the native addon.
   */
  async dispose(): Promise<void> {
    if (this._porcupine) {
      this._porcupine.release();
      this._porcupine = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing / diagnostics)
  // ---------------------------------------------------------------------------

  /** Returns the configured keyword list. */
  getKeywords(): string[] { return [...this._keywords]; }

  /** Returns the configured sensitivity list. */
  getSensitivities(): number[] { return [...this._sensitivities]; }
}
