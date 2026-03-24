/**
 * @file types.ts
 * @description OpenAI-specific configuration types for the streaming TTS extension pack.
 *
 * These types define provider configuration for the OpenAI TTS API and the
 * shared audio chunk shape emitted by the session.
 *
 * @module streaming-tts-openai/types
 */

/**
 * OpenAI-specific configuration for the streaming TTS session.
 *
 * All fields except `apiKey` are optional — sensible defaults are applied
 * when omitted.  The `apiKey` field is required and must be a valid
 * OpenAI API key.
 */
export interface OpenAIStreamingTTSConfig {
  /**
   * OpenAI API key.  Must be set to a non-empty string; the pack reads this
   * from the `OPENAI_API_KEY` secret when constructed via {@link createExtensionPack}.
   */
  apiKey: string;

  /**
   * Base URL for the OpenAI API endpoint.
   *
   * Override to point at a compatible proxy or local inference server.
   * @defaultValue 'https://api.openai.com'
   */
  baseUrl?: string;

  /**
   * TTS model name.
   *
   * `tts-1` optimises for low latency; `tts-1-hd` optimises for audio quality.
   * @defaultValue 'tts-1'
   * @see {@link https://platform.openai.com/docs/guides/text-to-speech}
   */
  model?: string;

  /**
   * Voice preset.  One of the six built-in OpenAI voices.
   *
   * Supported values: `'alloy'`, `'echo'`, `'fable'`, `'onyx'`, `'nova'`, `'shimmer'`.
   * @defaultValue 'nova'
   */
  voice?: string;

  /**
   * Audio output format returned by the API.
   *
   * `'opus'` is recommended for streaming; `'pcm'` is raw 24 kHz s16le.
   * Supported: `'opus'`, `'mp3'`, `'aac'`, `'flac'`, `'wav'`, `'pcm'`.
   * @defaultValue 'opus'
   */
  format?: string;

  /**
   * Maximum time in milliseconds to buffer LLM tokens before forcing a
   * flush to a TTS request, even without a sentence-boundary punctuation mark.
   *
   * Lower values reduce latency at the cost of more, shorter API calls.
   * @defaultValue 2000
   */
  maxBufferMs?: number;
}

/**
 * Generic streaming TTS session config forwarded from the voice pipeline.
 *
 * This is the provider-agnostic shape the AgentOS voice pipeline passes to
 * {@link OpenAIStreamingTTS.startSession}.
 */
export interface StreamingTTSConfig {
  /** Language / locale hint (e.g. `'en-US'`). Currently informational only for OpenAI. */
  language?: string;
  /** Provider-specific options forwarded verbatim to the adapter. */
  providerOptions?: Record<string, unknown>;
}

/**
 * A single chunk of synthesized audio emitted by {@link OpenAITTSSession}.
 *
 * The `audio` field holds the raw bytes returned by the OpenAI Speech API.
 * The `format` field identifies the codec so the caller can feed it to the
 * correct decoder.
 */
export interface EncodedAudioChunk {
  /** Raw audio bytes in the codec identified by {@link format}. */
  audio: Buffer;

  /**
   * Codec / container format, matching the `response_format` sent to the API
   * (e.g. `'opus'`, `'mp3'`, `'pcm'`).
   */
  format: string;

  /**
   * Nominal sample rate of the audio, in Hz.
   *
   * OpenAI TTS always returns 24 kHz output regardless of format.
   */
  sampleRate: number;

  /**
   * Rough estimated playback duration in milliseconds.
   *
   * Computed heuristically from word count (~150 WPM) rather than decoding the
   * audio, so callers should treat this as a hint rather than a precise value.
   */
  durationMs: number;

  /**
   * The input text sentence that produced this audio chunk.
   *
   * Useful for alignment, subtitle generation, or logging.
   */
  text: string;
}
