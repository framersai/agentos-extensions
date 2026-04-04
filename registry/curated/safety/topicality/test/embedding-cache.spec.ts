// @ts-nocheck
/**
 * @file embedding-cache.spec.ts
 * @description Tests that the TopicalityGuardrail caches topic embeddings
 * across multiple evaluate() calls, avoiding redundant re-embedding of the
 * same topic strings.
 *
 * Uses a counting spy on the mock extractor to verify that each unique topic
 * string is embedded exactly once regardless of how many evaluations run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Controlled embedding vectors
// ---------------------------------------------------------------------------

function unitVec(dim: number, dims = 4): number[] {
  const v = Array(dims).fill(0);
  v[dim] = 1;
  return v;
}

const EMBEDDING_MAP: Record<string, number[]> = {
  billing: unitVec(0),
  support: unitVec(1),
  violence: unitVec(2),
  'invoice question one': unitVec(0),
  'invoice question two': unitVec(0),
  'invoice question three': unitVec(0),
};

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers with a counting extractor
// ---------------------------------------------------------------------------

/**
 * Tracks every text string passed to the extractor so we can assert how many
 * times each string was embedded.
 */
const embeddedTexts: string[] = [];

const mockExtractor = vi.fn(
  async (texts: string[], _opts: { pooling: string; normalize: boolean }) => {
    for (const t of texts) {
      embeddedTexts.push(t);
    }
    return {
      tolist: () =>
        texts.map((t) => EMBEDDING_MAP[t] ?? Array(4).fill(0)),
    };
  }
);

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => mockExtractor),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicalityGuardrail — Embedding cache', () => {
  let createExtensionPack: typeof import('../src/index').createExtensionPack;
  let clearEmbeddingCache: typeof import('../src/index').clearEmbeddingCache;

  beforeEach(async () => {
    vi.resetModules();

    const mod = await import('../src/index');
    createExtensionPack = mod.createExtensionPack;
    clearEmbeddingCache = mod.clearEmbeddingCache;

    clearEmbeddingCache();
    embeddedTexts.length = 0;
    mockExtractor.mockClear();
  });

  /**
   * Helper: build a guardrail from the extension pack factory.
   */
  function getGuardrail(allowed: string[], blocked: string[]) {
    const pack = createExtensionPack({
      options: { allowedTopics: allowed, blockedTopics: blocked },
    } as any);
    const desc = pack.descriptors.find((d) => d.kind === 'guardrail');
    return desc!.payload as any;
  }

  // -------------------------------------------------------------------------
  // Core cache behaviour
  // -------------------------------------------------------------------------

  it('embeds each topic string only once across multiple evaluations', async () => {
    const guardrail = getGuardrail(['billing', 'support'], ['violence']);

    // Run three separate evaluations with different input texts
    await guardrail.evaluateInput({ input: { textInput: 'invoice question one' } });
    await guardrail.evaluateInput({ input: { textInput: 'invoice question two' } });
    await guardrail.evaluateInput({ input: { textInput: 'invoice question three' } });

    // Count how many times each topic was embedded
    const billingCount = embeddedTexts.filter((t) => t === 'billing').length;
    const supportCount = embeddedTexts.filter((t) => t === 'support').length;
    const violenceCount = embeddedTexts.filter((t) => t === 'violence').length;

    // Each topic should be embedded exactly once — cached for subsequent calls
    expect(billingCount).toBe(1);
    expect(supportCount).toBe(1);
    expect(violenceCount).toBe(1);

    // But each unique input text should be embedded once as well
    const inputCount = embeddedTexts.filter((t) => t.startsWith('invoice question')).length;
    expect(inputCount).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Cache is per-text, not per-evaluation
  // -------------------------------------------------------------------------

  it('caches input text that appears in multiple evaluations', async () => {
    const guardrail = getGuardrail(['billing'], []);
    const sameInput = 'invoice question one';

    await guardrail.evaluateInput({ input: { textInput: sameInput } });
    await guardrail.evaluateInput({ input: { textInput: sameInput } });
    await guardrail.evaluateInput({ input: { textInput: sameInput } });

    // The input text should be embedded only once
    const inputEmbedCount = embeddedTexts.filter((t) => t === sameInput).length;
    expect(inputEmbedCount).toBe(1);

    // The topic "billing" should also be embedded only once
    const topicEmbedCount = embeddedTexts.filter((t) => t === 'billing').length;
    expect(topicEmbedCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // clearEmbeddingCache forces re-embedding
  // -------------------------------------------------------------------------

  it('re-embeds topics after clearEmbeddingCache is called', async () => {
    const guardrail = getGuardrail(['billing'], []);

    await guardrail.evaluateInput({ input: { textInput: 'invoice question one' } });
    const countBefore = embeddedTexts.filter((t) => t === 'billing').length;
    expect(countBefore).toBe(1);

    // Clear the cache
    clearEmbeddingCache();

    await guardrail.evaluateInput({ input: { textInput: 'invoice question two' } });
    const countAfter = embeddedTexts.filter((t) => t === 'billing').length;

    // "billing" should have been re-embedded after cache was cleared
    expect(countAfter).toBe(2);
  });
});
