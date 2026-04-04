// @ts-nocheck
/**
 * @file embedding-tier.spec.ts
 * @description Tests for the embedding-based (Tier 1) evaluation strategy of
 * the TopicalityGuardrail.
 *
 * Mocks `@huggingface/transformers` to return controlled embedding vectors so
 * cosine similarity outcomes are deterministic without downloading models.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Embedding vector factory
// ---------------------------------------------------------------------------

/**
 * Build a unit-length vector pointing in a chosen direction.
 * Dimension 0 = billing, 1 = support, 2 = violence, 3 = unrelated.
 * Using 4-dimensional vectors keeps the math transparent.
 */
function unitVec(dim: number, dims = 4): number[] {
  const v = Array(dims).fill(0);
  v[dim] = 1;
  return v;
}

/**
 * Build a vector with a blend of two dimensions — useful for partial overlap.
 * Returns a normalized vector.
 */
function blendVec(dimA: number, dimB: number, weightA: number, dims = 4): number[] {
  const v = Array(dims).fill(0);
  v[dimA] = weightA;
  v[dimB] = 1 - weightA;
  const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map((x) => x / mag);
}

// ---------------------------------------------------------------------------
// Embedding lookup — maps text to a controlled vector
// ---------------------------------------------------------------------------

const EMBEDDING_MAP: Record<string, number[]> = {
  billing: unitVec(0),
  support: unitVec(1),
  violence: unitVec(2),
  'I need help with my invoice': unitVec(0), // high similarity to "billing"
  'Tell me about quantum physics': unitVec(3), // unrelated to any topic
  'How to commit violent acts': unitVec(2), // high similarity to "violence"
  'My subscription billing is wrong': blendVec(0, 1, 0.9), // mostly billing
};

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers
// ---------------------------------------------------------------------------

/**
 * The mock extractor function: receives an array of texts and returns
 * vectors from EMBEDDING_MAP. Falls back to a zero vector for unknown text.
 */
const mockExtractor = vi.fn(
  async (texts: string[], _opts: { pooling: string; normalize: boolean }) => ({
    tolist: () =>
      texts.map((t) => EMBEDDING_MAP[t] ?? Array(4).fill(0)),
  })
);

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => mockExtractor),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicalityGuardrail — Embedding tier', () => {
  let createExtensionPack: typeof import('../src/index').createExtensionPack;

  beforeEach(async () => {
    // Reset module cache so each test gets fresh module-level state
    // (_pipelineFn, _extractor, topicEmbeddingCache).
    vi.resetModules();

    const mod = await import('../src/index');
    createExtensionPack = mod.createExtensionPack;

    // Clear embedding cache between tests
    mod.clearEmbeddingCache();

    mockExtractor.mockClear();
  });

  /**
   * Helper: extract the guardrail payload from a freshly-built extension pack.
   */
  function getGuardrail(allowed: string[], blocked: string[]) {
    const pack = createExtensionPack({
      options: { allowedTopics: allowed, blockedTopics: blocked },
    } as any);
    const desc = pack.descriptors.find((d) => d.kind === 'guardrail');
    return desc!.payload as any;
  }

  // -------------------------------------------------------------------------
  // Allowed-topic similarity
  // -------------------------------------------------------------------------

  it('returns null (allow) when input embedding is similar to an allowed topic', async () => {
    const guardrail = getGuardrail(['billing', 'support'], ['violence']);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'I need help with my invoice' },
    });

    // The input vector matches "billing" exactly (cosine sim = 1.0),
    // which exceeds the default minSimilarity of 0.3.
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Off-topic detection
  // -------------------------------------------------------------------------

  it('flags input that is dissimilar to all allowed topics', async () => {
    const guardrail = getGuardrail(['billing', 'support'], ['violence']);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'Tell me about quantum physics' },
    });

    // The input vector is orthogonal to both "billing" and "support"
    // (cosine sim = 0.0), so it falls below minSimilarity.
    expect(result).not.toBeNull();
    expect(result!.action).toBe('flag');
    expect(result!.reasonCode).toBe('OFF_TOPIC');
  });

  // -------------------------------------------------------------------------
  // Blocked-topic detection
  // -------------------------------------------------------------------------

  it('blocks input that matches a blocked topic by high similarity', async () => {
    const guardrail = getGuardrail(['billing', 'support'], ['violence']);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'How to commit violent acts' },
    });

    // The input vector matches "violence" exactly (cosine sim = 1.0),
    // which exceeds the default maxBlockedSimilarity of 0.5.
    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.reasonCode).toBe('BLOCKED_TOPIC');
  });

  // -------------------------------------------------------------------------
  // Edge case: partial overlap still allowed
  // -------------------------------------------------------------------------

  it('allows input with partial but sufficient similarity to an allowed topic', async () => {
    const guardrail = getGuardrail(['billing', 'support'], ['violence']);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'My subscription billing is wrong' },
    });

    // blendVec(0, 1, 0.9) has cosine sim ~0.9 with unitVec(0) "billing"
    // — well above the 0.3 threshold.
    expect(result).toBeNull();
  });
});
