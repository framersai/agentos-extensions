// @ts-nocheck
/**
 * @file types.ts
 * @description Deepgram-specific configuration types for the streaming STT extension pack.
 *
 * These types augment the generic {@link StreamingSTTConfig} with Deepgram WebSocket
 * API options that have no counterpart in the core voice pipeline interface.
 *
 * @module streaming-stt-deepgram/types
 */

/**
 * Deepgram-specific configuration for the streaming STT session.
 *
 * All fields are optional — sensible defaults are applied when omitted.
 * The `apiKey` field is required and must be a valid Deepgram API key.
 */
export interface DeepgramStreamingConfig {
  /**
   * Deepgram API key.  Must be set to a non-empty string; the pack reads this
   * from the `DEEPGRAM_API_KEY` secret when constructed via {@link createExtensionPack}.
   */
  apiKey: string;

  /**
   * Deepgram model name.
   * @defaultValue 'nova-2'
   * @see {@link https://developers.deepgram.com/docs/models}
   */
  model?: string;

  /**
   * BCP-47 language code for recognition (e.g. `'en-US'`, `'fr-FR'`).
   * @defaultValue 'en-US'
   */
  language?: string;

  /**
   * Whether to insert punctuation into the transcript.
   * @defaultValue true
   */
  punctuate?: boolean;

  /**
   * Whether to emit interim (non-final) transcript events.
   * @defaultValue true
   */
  interimResults?: boolean;

  /**
   * Whether to enable speaker diarization (speaker turn segmentation).
   * When `true`, each {@link TranscriptWord} in the result carries a `speaker`
   * label populated by {@link extractSpeakerFromWords}.
   * @defaultValue false
   */
  diarize?: boolean;

  /**
   * Custom keyword boosting list.  Deepgram will upweight these terms during
   * recognition.  Format: `['keyword:boost']` where boost is an optional float.
   * @see {@link https://developers.deepgram.com/docs/keywords}
   */
  keywords?: string[];

  /**
   * Deepgram native endpointing duration in milliseconds.
   * Set to `false` to disable provider-side endpointing (the voice pipeline's
   * {@link IEndpointDetector} is then solely responsible for utterance segmentation).
   * @defaultValue false
   */
  endpointing?: number | false;
}
