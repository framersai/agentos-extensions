/**
 * @file TurnCompletenessClassifier.spec.ts
 * @description Unit tests for {@link TurnCompletenessClassifier}.
 *
 * All tests are fully synchronous or use controlled async stubs — no real LLM
 * calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TurnCompletenessClassifier } from '../src/TurnCompletenessClassifier.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock `llmCall` that resolves after `delayMs` with `response`.
 */
function makeLlmCall(response: string, delayMs = 0): (prompt: string) => Promise<string> {
  return vi.fn((_prompt: string) =>
    new Promise<string>((resolve) => setTimeout(() => resolve(response), delayMs)),
  );
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('TurnCompletenessClassifier', () => {
  // -------------------------------------------------------------------------
  // COMPLETE classification
  // -------------------------------------------------------------------------

  it('returns COMPLETE for a complete thought', async () => {
    const llmCall = makeLlmCall('COMPLETE The sentence ends here.');
    const classifier = new TurnCompletenessClassifier(llmCall, 500);

    const result = await classifier.classify('What time is the meeting tomorrow?');

    expect(result).toBe('COMPLETE');
  });

  // -------------------------------------------------------------------------
  // INCOMPLETE classification
  // -------------------------------------------------------------------------

  it('returns INCOMPLETE for an incomplete thought', async () => {
    const llmCall = makeLlmCall('INCOMPLETE The speaker appears to be mid-sentence.');
    const classifier = new TurnCompletenessClassifier(llmCall, 500);

    const result = await classifier.classify('I was thinking that maybe we could');

    expect(result).toBe('INCOMPLETE');
  });

  // -------------------------------------------------------------------------
  // TIMEOUT
  // -------------------------------------------------------------------------

  it('returns TIMEOUT when the LLM call exceeds the timeout budget', async () => {
    // LLM responds after 300 ms; timeout is 100 ms — should time out.
    const llmCall = makeLlmCall('COMPLETE Too late.', 300);
    const classifier = new TurnCompletenessClassifier(llmCall, 100);

    const result = await classifier.classify('Are you there?');

    expect(result).toBe('TIMEOUT');
  });

  // -------------------------------------------------------------------------
  // LRU caching — same transcript returns cached value; LLM not called again
  // -------------------------------------------------------------------------

  it('caches results and does not invoke the LLM for the same transcript', async () => {
    const llmCall = makeLlmCall('COMPLETE Fully formed thought.');
    const classifier = new TurnCompletenessClassifier(llmCall, 500);

    const firstResult = await classifier.classify('Hello there, how are you?');
    const secondResult = await classifier.classify('Hello there, how are you?');

    expect(firstResult).toBe('COMPLETE');
    expect(secondResult).toBe('COMPLETE');

    // LLM must have been called exactly once.
    expect(llmCall).toHaveBeenCalledOnce();
  });

  it('uses only the first 100 characters as the cache key', async () => {
    const llmCall = makeLlmCall('COMPLETE Short.',);
    const classifier = new TurnCompletenessClassifier(llmCall, 500);

    const base = 'a'.repeat(100);
    const transcriptA = base + ' suffix A';
    const transcriptB = base + ' suffix B';

    // Both transcripts share the same 100-char prefix — should hit cache on second call.
    await classifier.classify(transcriptA);
    await classifier.classify(transcriptB);

    expect(llmCall).toHaveBeenCalledOnce();
  });

  // -------------------------------------------------------------------------
  // LRU eviction
  // -------------------------------------------------------------------------

  it('evicts the oldest entry when the cache reaches maxCacheSize (100)', async () => {
    const llmCall = makeLlmCall('COMPLETE Yes.');
    // Use default timeoutMs (500 ms).
    const classifier = new TurnCompletenessClassifier(llmCall, 500);

    // Fill the cache with 100 distinct transcripts (each is a unique 100-char key).
    for (let i = 0; i < 100; i++) {
      await classifier.classify(`Transcript number ${String(i).padStart(5, '0')} ${'x'.repeat(80)}`);
    }

    // LLM called 100 times so far.
    expect(llmCall).toHaveBeenCalledTimes(100);

    // Adding entry #101 evicts the oldest entry (i=0).
    await classifier.classify('Brand new transcript that will push out the oldest');

    // LLM called once more for the new entry.
    expect(llmCall).toHaveBeenCalledTimes(101);

    // Re-classifying the evicted entry (i=0) must call the LLM again.
    await classifier.classify(`Transcript number ${String(0).padStart(5, '0')} ${'x'.repeat(80)}`);

    expect(llmCall).toHaveBeenCalledTimes(102);
  });
});
