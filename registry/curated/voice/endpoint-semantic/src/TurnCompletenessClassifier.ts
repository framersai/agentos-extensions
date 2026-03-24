/**
 * @file TurnCompletenessClassifier.ts
 * @description LLM-backed binary classifier that decides whether an utterance
 * is a complete conversational turn (COMPLETE) or likely to continue
 * (INCOMPLETE). Results are LRU-cached to avoid redundant LLM round-trips for
 * repeated short phrases.
 *
 * @module endpoint-semantic/TurnCompletenessClassifier
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The three possible results from {@link TurnCompletenessClassifier.classify}.
 *
 * - `COMPLETE`   — The utterance is a self-contained thought expecting a reply.
 * - `INCOMPLETE` — The speaker is likely to continue before yielding the floor.
 * - `TIMEOUT`    — The LLM did not respond within the configured time budget;
 *                  the caller should fall back to silence-timeout behaviour.
 */
export type ClassifyResult = 'COMPLETE' | 'INCOMPLETE' | 'TIMEOUT';

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Classifies a transcript as {@link ClassifyResult.COMPLETE} or
 * {@link ClassifyResult.INCOMPLETE} using an LLM prompt.
 *
 * ### Caching
 * Results are stored in a fixed-capacity LRU cache keyed on the first 100
 * characters of the transcript.  When the cache is full, the oldest entry is
 * evicted (insertion-order eviction via `Map` iteration order, which is
 * guaranteed by the ES2015 spec).
 *
 * ### Prompt format
 * The LLM is asked to respond with exactly `COMPLETE` or `INCOMPLETE` as the
 * first word, followed by one sentence of reasoning.  Only the first word is
 * examined — anything after the first space is treated as explanatory text and
 * discarded.
 *
 * @example
 * ```ts
 * const classifier = new TurnCompletenessClassifier(
 *   async (prompt) => openai.chat.completions.create({ ... }).then(r => r.choices[0].message.content ?? ''),
 *   400,
 * );
 * const result = await classifier.classify('Tell me about your', 'User: Hello\nAgent: Hi there!');
 * // → 'INCOMPLETE'  (sentence is unfinished)
 * ```
 */
export class TurnCompletenessClassifier {
  /**
   * LRU result cache. Keys are the first 100 chars of the transcript; values
   * are the cached classification.  `Map` preserves insertion order, so
   * eviction iterates from the oldest entry (`.keys().next().value`).
   */
  private readonly cache = new Map<string, 'COMPLETE' | 'INCOMPLETE'>();

  /**
   * Maximum number of entries to keep in {@link cache} before evicting the
   * oldest one.
   */
  private readonly maxCacheSize = 100;

  /**
   * @param llmCall   — Async function that sends a prompt string to an LLM and
   *                    resolves with the raw response text.
   * @param timeoutMs — Maximum milliseconds to wait for the LLM before
   *                    returning `TIMEOUT`. Defaults to 500 ms.
   */
  constructor(
    private readonly llmCall: (prompt: string) => Promise<string>,
    private readonly timeoutMs: number = 500,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Classify `transcript` as `COMPLETE`, `INCOMPLETE`, or `TIMEOUT`.
   *
   * The result is cached on the first 100 characters of `transcript` so that
   * repeated short phrases (common in voice interaction) never hit the LLM
   * twice.
   *
   * @param transcript — The utterance text to evaluate.
   * @param context    — Optional string containing the last 2 conversation turns,
   *                     formatted as `"Speaker: text\n..."`.  When omitted, the
   *                     prompt uses `'N/A'`.
   * @returns A {@link ClassifyResult} resolving to `COMPLETE`, `INCOMPLETE`,
   *          or `TIMEOUT`.
   */
  async classify(transcript: string, context?: string): Promise<ClassifyResult> {
    // -----------------------------------------------------------------------
    // Cache lookup
    // -----------------------------------------------------------------------
    const cacheKey = transcript.slice(0, 100);

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // -----------------------------------------------------------------------
    // Build prompt
    // -----------------------------------------------------------------------
    const prompt =
      `Is the following utterance a complete thought that expects a response, ` +
      `or is the speaker likely to continue?\n\n` +
      `Context (last 2 turns):\n${context ?? 'N/A'}\n\n` +
      `Current utterance: "${transcript}"\n\n` +
      `Respond with exactly COMPLETE or INCOMPLETE, then one sentence of reasoning.`;

    // -----------------------------------------------------------------------
    // LLM call with timeout race
    // -----------------------------------------------------------------------
    let rawResult: string;

    try {
      rawResult = await Promise.race([
        this.llmCall(prompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), this.timeoutMs),
        ),
      ]);
    } catch {
      // Either the LLM threw or the timeout won — return TIMEOUT without
      // caching so the next call re-attempts the LLM.
      return 'TIMEOUT';
    }

    // -----------------------------------------------------------------------
    // Parse response — only the first word matters
    // -----------------------------------------------------------------------
    const classification: 'COMPLETE' | 'INCOMPLETE' = rawResult.trim().startsWith('COMPLETE')
      ? 'COMPLETE'
      : 'INCOMPLETE';

    // -----------------------------------------------------------------------
    // LRU eviction + cache write
    // -----------------------------------------------------------------------
    if (this.cache.size >= this.maxCacheSize) {
      // Map.keys() returns an iterator in insertion order; the first key is the
      // oldest entry.
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }

    this.cache.set(cacheKey, classification);

    return classification;
  }
}
