// @ts-nocheck
/**
 * @file types.ts
 * @description Core types for the diarization extension pack.
 *
 * These types define the public contract shared between the engine, session
 * implementations, and calling code.  They intentionally avoid importing from
 * `@framers/agentos` so the pack can boot in environments where the core
 * package is not yet available.
 *
 * @module diarization/types
 */

import type { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Audio primitive
// ---------------------------------------------------------------------------

/**
 * Minimal audio frame type used by the diarization pipeline.
 *
 * Matches the `AudioFrame` shape from `@framers/agentos` voice types so that
 * frames can be forwarded without conversion.
 */
export interface AudioFrame {
  /** Raw 32-bit float PCM samples, normalised to the range `[-1, 1]`. */
  samples: Float32Array;
  /** Sample rate in Hz (e.g. 16000). */
  sampleRate: number;
  /** Wall-clock timestamp in milliseconds when the frame was captured. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Transcript primitive
// ---------------------------------------------------------------------------

/**
 * A single word or token produced by an STT provider, optionally annotated
 * with a speaker label.
 */
export interface TranscriptWord {
  /** The recognised word text. */
  word: string;
  /** Start time of the word in seconds (relative to session start). */
  start: number;
  /** End time of the word in seconds (relative to session start). */
  end: number;
  /** Provider-assigned speaker label, e.g. `'0'` or `'Speaker_1'`. */
  speaker?: string;
  /** Per-word confidence in the range `[0, 1]`. */
  confidence?: number;
}

/**
 * A transcript event as emitted by an STT provider session.
 *
 * Diarization operates on these events when running in provider-delegated
 * mode; the `words` array carries word-level speaker annotations.
 */
export interface TranscriptEvent {
  /** Full transcript text for this event. */
  text: string;
  /** Whether this is a finalised (stable) transcript hypothesis. */
  isFinal: boolean;
  /** Word-level tokens with optional speaker labels. */
  words?: TranscriptWord[];
  /** Session-relative timestamp in milliseconds. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Diarized segment
// ---------------------------------------------------------------------------

/**
 * A contiguous audio or text segment attributed to a single speaker.
 */
export interface DiarizedSegment {
  /** Resolved speaker identifier (e.g. `'Alice'` or `'Speaker_0'`). */
  speakerId: string;
  /** Transcript text for this segment, if available. */
  text?: string;
  /** Segment start time in milliseconds (wall clock). */
  startMs: number;
  /** Segment end time in milliseconds (wall clock). */
  endMs: number;
  /** Confidence score for the speaker attribution in the range `[0, 1]`. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Speaker identified event
// ---------------------------------------------------------------------------

/**
 * Payload for the `speaker_identified` event emitted by a
 * {@link IDiarizationSession}.
 */
export interface SpeakerIdentified {
  /** Resolved speaker identifier. */
  speakerId: string;
  /** Confidence in the range `[0, 1]`. */
  confidence: number;
  /** Wall-clock timestamp in milliseconds when this identification was made. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Session configuration
// ---------------------------------------------------------------------------

/**
 * Configuration object for {@link IDiarizationEngine.startSession}.
 */
export interface DiarizationConfig {
  /**
   * Backend to use.
   * - `'provider'` — extract speaker labels from STT provider word results.
   * - `'local'` — use the built-in spectral-centroid sliding-window backend.
   * @defaultValue 'local'
   */
  backend?: 'provider' | 'local';

  /**
   * Cosine similarity threshold for speaker matching.
   * Embeddings with similarity above this value are attributed to the same
   * speaker.
   * @defaultValue 0.7
   */
  similarityThreshold?: number;

  /**
   * Hint for the clustering strategy — how many distinct speakers are expected
   * in this session.  When set, the engine will try to merge centroids until
   * this count is reached.
   */
  expectedSpeakers?: number;

  /**
   * Chunk duration in milliseconds for the sliding-window extractor.
   * @defaultValue 1500
   */
  chunkSizeMs?: number;

  /**
   * Overlap between consecutive chunks in milliseconds.
   * @defaultValue 500
   */
  overlapMs?: number;

  /**
   * Audio sample rate in Hz.
   * @defaultValue 16000
   */
  sampleRate?: number;
}

// ---------------------------------------------------------------------------
// Session interface
// ---------------------------------------------------------------------------

/**
 * A live diarization session.
 *
 * Extends `EventEmitter` so callers can subscribe to `speaker_identified`,
 * `segment_ready`, `error`, and `close` events.
 */
export interface IDiarizationSession extends EventEmitter {
  /**
   * Push a raw audio frame into the diarization pipeline.
   *
   * In local mode, frames are accumulated in a sliding window and processed
   * when a full chunk is ready.  In provider mode, this is a no-op (speaker
   * labels come from {@link labelTranscript}).
   */
  pushAudio(frame: AudioFrame): void;

  /**
   * Attach provider-supplied speaker labels to a transcript event and return
   * the resulting {@link DiarizedSegment} (if enough information is present).
   *
   * In provider mode this is the primary data path.  In local mode, the engine
   * merges the text with the most recent speaker identification.
   */
  labelTranscript(event: TranscriptEvent): DiarizedSegment | null;

  /**
   * Pre-register a known speaker voiceprint so the engine can label them by
   * name rather than an auto-generated `Speaker_N` identifier.
   *
   * @param id - Human-readable speaker name or identifier.
   * @param voiceprint - 32-bit float embedding vector representing the
   *   speaker's vocal characteristics.
   */
  enrollSpeaker(id: string, voiceprint: Float32Array): void;

  /**
   * Terminate the session and release all resources.
   *
   * After `close()` is called, no further events will be emitted.
   */
  close(): void;
}

// ---------------------------------------------------------------------------
// Engine interface
// ---------------------------------------------------------------------------

/**
 * Factory interface for creating diarization sessions.
 */
export interface IDiarizationEngine {
  /**
   * Create and start a new {@link IDiarizationSession}.
   *
   * @param config - Optional session configuration.
   * @returns A ready-to-use diarization session.
   */
  startSession(config?: DiarizationConfig): IDiarizationSession;
}
