/**
 * @file types.ts
 * @description Whisper-specific configuration types for the chunked streaming STT extension pack.
 *
 * These types define the configuration for the sliding-window Whisper adapter that
 * accumulates audio into 1-second chunks and sends them to the Whisper HTTP API.
 *
 * @module streaming-stt-whisper/types
 */

/**
 * Configuration for the Whisper chunked streaming STT session.
 *
 * All fields except `apiKey` are optional — sensible defaults are applied.
 */
export interface WhisperChunkedConfig {
  /**
   * OpenAI API key (or compatible provider key).
   * Read from `OPENAI_API_KEY` when constructed via {@link createExtensionPack}.
   */
  apiKey: string;

  /**
   * Base URL for the Whisper API endpoint.
   * Override to use a self-hosted or compatible provider (e.g. Groq, local Faster-Whisper).
   * @defaultValue 'https://api.openai.com'
   */
  baseUrl?: string;

  /**
   * Whisper model name.
   * @defaultValue 'whisper-1'
   * @see {@link https://platform.openai.com/docs/models/whisper}
   */
  model?: string;

  /**
   * BCP-47 language hint (e.g. `'en'`, `'fr'`, `'de'`).
   * When omitted Whisper auto-detects the language.
   */
  language?: string;

  /**
   * Optional initial prompt to bias the first chunk's transcription.
   * Subsequent chunks automatically receive the previous chunk's transcript as prompt.
   * @see {@link https://platform.openai.com/docs/guides/speech-to-text/prompting}
   */
  prompt?: string;

  /**
   * Size of each audio chunk in samples (at 16 kHz).
   * @defaultValue 16000 (1 second at 16 kHz)
   */
  chunkSizeSamples?: number;

  /**
   * Number of samples to carry forward from each chunk as overlap.
   * Prevents words at chunk boundaries from being silently dropped.
   * @defaultValue 3200 (200 ms at 16 kHz)
   */
  overlapSamples?: number;
}

// ---------------------------------------------------------------------------
// Voice pipeline shape mirrors (no runtime dep on @framers/agentos at test time)
// ---------------------------------------------------------------------------

/** Minimal AudioFrame shape — mirrors packages/agentos/src/voice-pipeline/types.ts */
export interface AudioFrame {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
  speakerHint?: string;
}

/** A single recognised word with timing metadata. */
export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
}

/** A transcription result emitted by the session. */
export interface TranscriptEvent {
  text: string;
  confidence: number;
  words: TranscriptWord[];
  isFinal: boolean;
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Whisper verbose_json response shape
// ---------------------------------------------------------------------------

/** A single segment from Whisper's verbose_json response. */
export interface WhisperSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  avg_logprob?: number;
  words?: WhisperWord[];
}

/** A word-level entry from Whisper's verbose_json response (requires word timestamps). */
export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/** Top-level shape of the Whisper verbose_json transcription response. */
export interface WhisperTranscriptionResponse {
  task?: string;
  language?: string;
  duration?: number;
  text: string;
  segments?: WhisperSegment[];
}
