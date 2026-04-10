// @ts-nocheck
/**
 * @file types.ts
 * @description Public configuration types for the Semantic Endpoint Detector
 * extension pack.
 *
 * @module endpoint-semantic/types
 */

/**
 * Configuration options for the {@link SemanticEndpointDetector}.
 *
 * All fields are optional — reasonable defaults are applied when omitted.
 */
export interface SemanticEndpointConfig {
  /**
   * LLM model identifier forwarded to the runtime LLM provider when performing
   * turn-completeness classification. The exact string is passed through
   * verbatim; its meaning is determined by whichever provider the caller
   * supplies via the `llmCall` constructor argument.
   *
   * @example 'gpt-4o-mini'
   * @example 'claude-haiku-3-5'
   */
  model?: string;

  /**
   * Maximum number of milliseconds to wait for the LLM to return a
   * classification before treating the result as a {@link ClassifyResult.TIMEOUT}.
   * On timeout the detector falls back to the normal silence timeout behaviour.
   *
   * @defaultValue 500
   */
  timeoutMs?: number;

  /**
   * Duration of silence (in ms) after a `speech_end` VAD event before the
   * LLM classifier is invoked. Introducing a small delay avoids calling the
   * LLM on micro-pauses that are immediately followed by resumed speech.
   *
   * @defaultValue 500
   */
  minSilenceBeforeCheckMs?: number;

  /**
   * Duration (in ms) of silence after `speech_end` before the detector emits
   * `turn_complete` with reason `'silence_timeout'` regardless of classifier
   * output. Acts as a hard fallback when the LLM returns `INCOMPLETE` or times
   * out.
   *
   * @defaultValue 1500
   */
  silenceTimeoutMs?: number;
}
