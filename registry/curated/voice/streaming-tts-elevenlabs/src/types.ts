// @ts-nocheck
/**
 * @file types.ts
 * @description ElevenLabs-specific configuration types for the streaming TTS extension pack.
 *
 * These types define provider configuration for the ElevenLabs WebSocket Streaming API and
 * the shared audio chunk shape emitted by the session.
 *
 * @module streaming-tts-elevenlabs/types
 */

/**
 * ElevenLabs-specific configuration for the streaming TTS session.
 *
 * All fields except `apiKey` are optional — sensible defaults are applied when omitted.
 * The `apiKey` field is required and must be a valid ElevenLabs API key (xi-api-key).
 */
export interface ElevenLabsStreamingTTSConfig {
  /**
   * ElevenLabs API key (xi-api-key).  Must be set to a non-empty string; the pack reads
   * this from the `ELEVENLABS_API_KEY` secret when constructed via {@link createExtensionPack}.
   */
  apiKey: string;

  /**
   * ElevenLabs voice ID to use for synthesis.
   *
   * Find voice IDs in the ElevenLabs voice library or via the Voices API.
   * @defaultValue '21m00Tcm4TlvDq8ikWAM' (Rachel — a neutral English voice)
   * @see {@link https://elevenlabs.io/voice-library}
   */
  voiceId?: string;

  /**
   * ElevenLabs model ID to use for synthesis.
   *
   * - `eleven_turbo_v2` — optimized for low latency (~250 ms to first chunk).
   * - `eleven_multilingual_v2` — highest quality, supports 29 languages.
   * - `eleven_monolingual_v1` — English-only, balanced latency/quality.
   *
   * @defaultValue 'eleven_turbo_v2'
   * @see {@link https://elevenlabs.io/docs/speech-synthesis/models}
   */
  modelId?: string;

  /**
   * Voice stability (0.0 – 1.0).
   *
   * Lower values produce more expressive and varied speech; higher values are more
   * consistent and monotone.
   * @defaultValue 0.5
   */
  stability?: number;

  /**
   * Similarity boost (0.0 – 1.0).
   *
   * Higher values cause the output to sound more similar to the original voice clone.
   * Too high a value can introduce artefacts.
   * @defaultValue 0.75
   */
  similarityBoost?: number;

  /**
   * Style exaggeration (0.0 – 1.0).
   *
   * Amplifies the style of the original speaker.  Increasing this setting may reduce
   * overall generation speed.  Only available for v2 models.
   * @defaultValue 0.0
   */
  style?: number;

  /**
   * Speaker boost.
   *
   * Boosts similarity to the original speaker.  Recommended when a cloned voice is
   * used and maximum fidelity is needed.
   * @defaultValue true
   */
  useSpeakerBoost?: boolean;
}

/**
 * Generic streaming TTS session config forwarded from the voice pipeline.
 *
 * This is the provider-agnostic shape the AgentOS voice pipeline passes to
 * {@link ElevenLabsStreamingTTS.startSession}.
 */
export interface StreamingTTSConfig {
  /** Language / locale hint (e.g. `'en-US'`). Currently informational only for ElevenLabs. */
  language?: string;
  /** Provider-specific options forwarded verbatim to the adapter. */
  providerOptions?: Record<string, unknown>;
}

/**
 * A single chunk of synthesized audio emitted by {@link ElevenLabsTTSSession}.
 *
 * The `audio` field holds raw MP3 bytes returned by the ElevenLabs WebSocket stream.
 * The `format` field is always `'mp3'` for this provider.
 */
export interface EncodedAudioChunk {
  /** Raw audio bytes encoded as MP3. */
  audio: Buffer;

  /**
   * Codec / container format.  Always `'mp3'` for ElevenLabs streaming output.
   */
  format: string;

  /**
   * Nominal sample rate of the audio, in Hz.
   *
   * ElevenLabs streaming returns 44.1 kHz MP3 audio when `output_format=mp3_44100_128`.
   */
  sampleRate: number;

  /**
   * Rough estimated playback duration in milliseconds.
   *
   * Computed heuristically from the current text buffer word count (~150 WPM) rather than
   * decoding the audio, so callers should treat this as a hint rather than a precise value.
   */
  durationMs: number;

  /**
   * The input text associated with this audio chunk.
   *
   * For mid-stream binary chunks this is an empty string; ElevenLabs does not embed
   * alignment data in the binary WebSocket messages.
   */
  text: string;
}
