/**
 * @file PiperTTSProvider.ts
 * @description Offline text-to-speech provider that invokes the Piper binary.
 *
 * [Piper](https://github.com/rhasspy/piper) is a fast, local neural TTS
 * system.  This provider spawns the binary via `child_process.spawn`, writes
 * the input text to `stdin`, and collects the WAV audio written to `stdout`.
 *
 * No npm dependencies are required beyond Node's built-in `child_process`
 * module.  The Piper binary must be installed separately and be accessible
 * via the `binaryPath` option or the `PIPER_BIN` environment variable
 * (defaults to `piper`, which expects the binary to be on `PATH`).
 *
 * @module piper
 */

import { spawn } from 'child_process';
import os from 'os';
import path from 'path';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Constructor options for {@link PiperTTSProvider}.
 */
export interface PiperTTSProviderOptions {
  /**
   * Absolute path to the Piper executable, or just `'piper'` if it is on
   * `PATH`.  Resolved from `PIPER_BIN` env var when omitted.
   * @defaultValue `process.env.PIPER_BIN ?? 'piper'`
   */
  binaryPath?: string;

  /**
   * Absolute path to the ONNX voice model file.
   * Resolved from `PIPER_MODEL_PATH` env var when omitted.
   * @defaultValue `~/.agentos/models/piper/en_US-lessac-medium.onnx`
   */
  modelPath?: string;

  /**
   * Maximum number of bytes accepted from Piper's stdout.
   * Prevents runaway memory usage if the binary misbehaves.
   * @defaultValue `10485760` (10 MB)
   */
  maxBufferBytes?: number;

  /**
   * Milliseconds before the spawned process is killed with SIGTERM and the
   * promise is rejected.
   * @defaultValue `30000`
   */
  timeoutMs?: number;
}

/**
 * Synthesised audio returned by {@link PiperTTSProvider.synthesize}.
 */
export interface SynthesisResult {
  /** Raw WAV audio bytes produced by Piper. */
  audioBuffer: Buffer;
  /** MIME type of the audio data. Always `'audio/wav'` for this provider. */
  mimeType: 'audio/wav';
  /** Billable cost (always 0 — fully local). */
  cost: 0;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Piper offline text-to-speech provider.
 *
 * Implements the `TextToSpeechProvider` contract expected by the AgentOS voice
 * pipeline without taking a hard runtime dependency on the interface types.
 */
export class PiperTTSProvider {
  /** Stable provider identifier used by the AgentOS extension registry. */
  readonly id = 'piper';

  /**
   * Streaming is not supported — Piper outputs a complete WAV file.
   * Setting this to `false` signals the pipeline to use batch mode.
   */
  readonly supportsStreaming = false;

  private readonly _binaryPath: string;
  private readonly _modelPath: string;
  private readonly _maxBufferBytes: number;
  private readonly _timeoutMs: number;

  /**
   * Create a new {@link PiperTTSProvider}.
   *
   * @param options - Optional configuration.  All fields have sensible defaults
   *   or fall back to environment variables.
   */
  constructor(options: PiperTTSProviderOptions = {}) {
    this._binaryPath = options.binaryPath ?? process.env['PIPER_BIN'] ?? 'piper';
    this._modelPath =
      options.modelPath ??
      process.env['PIPER_MODEL_PATH'] ??
      path.join(os.homedir(), '.agentos', 'models', 'piper', 'en_US-lessac-medium.onnx');
    this._maxBufferBytes = options.maxBufferBytes ?? 10 * 1024 * 1024; // 10 MB
    this._timeoutMs = options.timeoutMs ?? 30_000;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Synthesise plain text to WAV audio using the local Piper binary.
   *
   * Piper is invoked as:
   * ```
   * piper --model <modelPath> --output_file -
   * ```
   * The text is written to `stdin`; WAV bytes are read from `stdout`.
   *
   * @param text - Plain text to synthesise.
   * @returns {@link SynthesisResult} containing the raw WAV buffer.
   * @throws If Piper exits with a non-zero code, times out, or the buffer
   *   limit is exceeded.
   */
  async synthesize(text: string): Promise<SynthesisResult> {
    return new Promise<SynthesisResult>((resolve, reject) => {
      const proc = spawn(this._binaryPath, [
        '--model', this._modelPath,
        '--output_file', '-',
      ]);

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      /** Settle the promise once, ignoring subsequent events. */
      const settle = (err: Error | null, result?: SynthesisResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          proc.kill('SIGTERM');
          reject(err);
        } else {
          resolve(result!);
        }
      };

      // Timeout guard.
      const timer = setTimeout(() => {
        settle(new Error(`Piper process timed out after ${this._timeoutMs} ms`));
      }, this._timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > this._maxBufferBytes) {
          settle(
            new Error(
              `Piper output exceeded maxBufferBytes limit (${this._maxBufferBytes} bytes)`,
            ),
          );
          return;
        }
        chunks.push(chunk);
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        // Piper writes progress/info to stderr; capture for error reporting.
        // We do NOT reject on stderr data alone — only on non-zero exit.
        void chunk; // intentionally unused unless exit code is non-zero
      });

      proc.on('error', (err: Error) => {
        settle(new Error(`Failed to spawn Piper binary "${this._binaryPath}": ${err.message}`));
      });

      proc.on('close', (code: number | null) => {
        if (code !== 0 && code !== null) {
          settle(new Error(`Piper exited with non-zero code ${code}`));
          return;
        }
        settle(null, {
          audioBuffer: Buffer.concat(chunks),
          mimeType: 'audio/wav',
          cost: 0,
        });
      });

      // Write text to stdin and close the stream so Piper knows input is done.
      proc.stdin.write(text);
      proc.stdin.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing / diagnostics)
  // ---------------------------------------------------------------------------

  /** Returns the resolved binary path. */
  getBinaryPath(): string { return this._binaryPath; }

  /** Returns the resolved model path. */
  getModelPath(): string { return this._modelPath; }

  /** Returns the configured max buffer size in bytes. */
  getMaxBufferBytes(): number { return this._maxBufferBytes; }

  /** Returns the configured timeout in milliseconds. */
  getTimeoutMs(): number { return this._timeoutMs; }
}
