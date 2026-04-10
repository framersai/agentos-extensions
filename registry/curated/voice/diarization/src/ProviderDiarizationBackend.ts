// @ts-nocheck
/**
 * @file ProviderDiarizationBackend.ts
 * @description Thin adapter that extracts speaker labels from STT provider
 * transcript events containing word-level speaker annotations.
 *
 * Many cloud STT providers (Deepgram, AssemblyAI, …) support native
 * diarization that produces a `speaker` label on each word in the transcript.
 * This backend consumes those events and re-emits them as
 * {@link DiarizedSegment} objects without any additional compute.
 *
 * @module diarization/ProviderDiarizationBackend
 */

import type { TranscriptEvent, DiarizedSegment, TranscriptWord } from './types.js';

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

/**
 * Extracts speaker labels from word-level STT results.
 *
 * Stateless — each call to {@link pushTranscriptEvent} is independent.  The
 * caller is responsible for any session-level bookkeeping.
 *
 * @example
 * ```ts
 * const backend = new ProviderDiarizationBackend();
 * sttSession.on('transcript', (event) => {
 *   const segment = backend.pushTranscriptEvent(event);
 *   if (segment) console.log(segment.speakerId, segment.text);
 * });
 * ```
 */
export class ProviderDiarizationBackend {
  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Process a transcript event and extract the dominant speaker label.
   *
   * The dominant speaker is determined by majority vote across the word-level
   * `speaker` annotations.  If no words carry speaker labels, `null` is
   * returned.
   *
   * For final transcripts (`isFinal: true`) the returned segment covers the
   * full utterance.  For interim transcripts the segment is a best-effort
   * approximation based on the current words.
   *
   * @param event - Transcript event from an STT provider session.
   * @returns A {@link DiarizedSegment} if speaker information is available,
   *   or `null` if the event lacks word-level speaker labels.
   */
  pushTranscriptEvent(event: TranscriptEvent): DiarizedSegment | null {
    const words = event.words;

    if (!words || words.length === 0) {
      return null;
    }

    // Collect all words that have a speaker label.
    const labelledWords = words.filter((w) => w.speaker !== undefined && w.speaker !== '');

    if (labelledWords.length === 0) {
      return null;
    }

    // Majority-vote for the dominant speaker in this transcript event.
    const speakerId = this.dominantSpeaker(labelledWords);

    // Derive segment boundaries from word timestamps (seconds → milliseconds).
    const firstWord = labelledWords[0]!;
    const lastWord = labelledWords[labelledWords.length - 1]!;

    // Average per-word confidence (default 1 if not present).
    const avgConfidence =
      labelledWords.reduce((sum, w) => sum + (w.confidence ?? 1), 0) / labelledWords.length;

    return {
      speakerId,
      text: event.text,
      startMs: Math.round(firstWord.start * 1000),
      endMs: Math.round(lastWord.end * 1000),
      confidence: avgConfidence,
    };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Determine the most-frequently-occurring speaker label among a set of words.
   *
   * @param words - Words that all have a defined `speaker` property.
   * @returns The dominant `speaker` label.
   */
  private dominantSpeaker(words: TranscriptWord[]): string {
    const counts = new Map<string, number>();

    for (const word of words) {
      const label = word.speaker!;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }

    let best = words[0]!.speaker!;
    let bestCount = 0;

    for (const [label, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        best = label;
      }
    }

    return best;
  }
}
