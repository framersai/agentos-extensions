/**
 * @file DeepgramDiarizationAdapter.ts
 * @description Utilities for extracting speaker labels from Deepgram word-level
 * diarization results.
 *
 * Deepgram's `diarize: true` option annotates each word in the transcript with
 * a zero-indexed integer `speaker` field.  This module converts that raw
 * numeric label into the string format expected by {@link TranscriptWord.speaker}
 * (`'Speaker_0'`, `'Speaker_1'`, …) and determines the majority speaker for
 * an utterance.
 *
 * @module streaming-stt-deepgram/DeepgramDiarizationAdapter
 */

/**
 * A single Deepgram word object as returned by the WebSocket API when
 * `diarize: true` is passed in the connection query string.
 *
 * Only the fields used by this adapter are declared; the raw JSON may contain
 * additional fields that are ignored.
 */
export interface DeepgramWord {
  /** Recognised word token. */
  word: string;
  /** Start time relative to the stream start in seconds. */
  start: number;
  /** End time relative to the stream start in seconds. */
  end: number;
  /** Recognition confidence in [0, 1]. */
  confidence: number;
  /**
   * Zero-indexed speaker index assigned by Deepgram's diarization model.
   * Present only when the session was opened with `diarize=true`.
   */
  speaker?: number;
  /** Punctuated variant of {@link word} when `punctuate=true`. */
  punctuated_word?: string;
}

/**
 * Extract the majority speaker label from an array of Deepgram word objects.
 *
 * The function tallies votes by `speaker` index and returns the label for the
 * speaker with the most words.  Ties are broken by lowest index (i.e. the
 * earliest-assigned speaker wins).
 *
 * Returns `undefined` when the array is empty or no word carries a `speaker`
 * field (i.e. diarization was not requested for this session).
 *
 * @param words - Raw Deepgram word objects from `channel.alternatives[0].words`.
 * @returns A string label such as `'Speaker_0'`, or `undefined`.
 *
 * @example
 * ```ts
 * const words = [
 *   { word: 'Hello', speaker: 0, start: 0, end: 0.3, confidence: 0.99 },
 *   { word: 'world', speaker: 1, start: 0.4, end: 0.7, confidence: 0.97 },
 *   { word: 'today', speaker: 0, start: 0.8, end: 1.1, confidence: 0.95 },
 * ];
 * extractSpeakerFromWords(words); // → 'Speaker_0'
 * ```
 */
export function extractSpeakerFromWords(words: DeepgramWord[]): string | undefined {
  if (words.length === 0) return undefined;

  /** Vote counts keyed by speaker index. */
  const votes = new Map<number, number>();

  for (const w of words) {
    if (w.speaker === undefined) continue;
    votes.set(w.speaker, (votes.get(w.speaker) ?? 0) + 1);
  }

  if (votes.size === 0) return undefined;

  // Find the speaker index with the highest vote count; ties broken by lowest index.
  let majorityIndex = -1;
  let majorityCount = -1;

  for (const [index, count] of votes) {
    if (count > majorityCount || (count === majorityCount && index < majorityIndex)) {
      majorityCount = count;
      majorityIndex = index;
    }
  }

  return majorityIndex >= 0 ? `Speaker_${majorityIndex}` : undefined;
}

/**
 * Map a Deepgram word object to the canonical `TranscriptWord`-compatible shape.
 *
 * Seconds are converted to milliseconds to match the voice pipeline convention.
 * The `word` field prefers the punctuated variant when available.
 *
 * @param dw - Raw Deepgram word object.
 * @returns A plain object matching the {@link TranscriptWord} interface.
 */
export function mapDeepgramWord(dw: DeepgramWord): {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string;
} {
  return {
    word: dw.punctuated_word ?? dw.word,
    start: Math.round(dw.start * 1000),
    end: Math.round(dw.end * 1000),
    confidence: dw.confidence,
    speaker: dw.speaker !== undefined ? `Speaker_${dw.speaker}` : undefined,
  };
}
