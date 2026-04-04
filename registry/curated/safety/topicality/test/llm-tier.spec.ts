// @ts-nocheck
/**
 * @file llm-tier.spec.ts
 * @description Tests for the LLM-as-judge (Tier 2) evaluation strategy of the
 * TopicalityGuardrail.
 *
 * Forces embeddings to be unavailable so the guardrail falls back to the LLM
 * invoker. Validates prompt construction, JSON parsing, and markdown-fence
 * handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @huggingface/transformers to FAIL — forces LLM fallback
// ---------------------------------------------------------------------------

vi.mock('@huggingface/transformers', () => {
  throw new Error('transformers not installed');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TopicalityGuardrail — LLM tier (fallback)', () => {
  let createExtensionPack: typeof import('../src/index').createExtensionPack;

  beforeEach(async () => {
    vi.resetModules();

    const mod = await import('../src/index');
    createExtensionPack = mod.createExtensionPack;
    mod.clearEmbeddingCache();
  });

  /**
   * Helper: build a guardrail with a controlled llmInvoker mock.
   */
  function getGuardrail(
    allowed: string[],
    blocked: string[],
    llmInvoker: (prompt: string) => Promise<string>
  ) {
    const pack = createExtensionPack({
      options: {
        allowedTopics: allowed,
        blockedTopics: blocked,
        llmInvoker,
      },
    } as any);
    const desc = pack.descriptors.find((d) => d.kind === 'guardrail');
    return desc!.payload as any;
  }

  // -------------------------------------------------------------------------
  // Falls back to LLM when embeddings are unavailable
  // -------------------------------------------------------------------------

  it('calls the llmInvoker when embeddings are unavailable', async () => {
    const llmInvoker = vi.fn(async () =>
      JSON.stringify({ onTopic: true, confidence: 0.95, detectedTopic: 'billing' })
    );

    const guardrail = getGuardrail(['billing'], ['violence'], llmInvoker);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'I need help with my invoice' },
    });

    expect(llmInvoker).toHaveBeenCalledOnce();
    // LLM said on-topic, so the guardrail allows it
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Parses plain JSON response
  // -------------------------------------------------------------------------

  it('parses a plain JSON response from the LLM invoker', async () => {
    const llmInvoker = vi.fn(async () =>
      JSON.stringify({ onTopic: false, confidence: 0.2, detectedTopic: 'quantum physics' })
    );

    const guardrail = getGuardrail(['billing', 'support'], ['violence'], llmInvoker);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'Tell me about quantum physics' },
    });

    expect(result).not.toBeNull();
    expect(result!.action).toBe('flag');
    expect(result!.reasonCode).toBe('OFF_TOPIC');
    expect(result!.metadata.confidence).toBe(0.2);
  });

  // -------------------------------------------------------------------------
  // Handles markdown-wrapped JSON
  // -------------------------------------------------------------------------

  it('extracts JSON from a markdown-fenced LLM response', async () => {
    const fencedResponse = [
      '```json',
      '{ "onTopic": false, "confidence": 0.85, "detectedTopic": "violence" }',
      '```',
    ].join('\n');

    const llmInvoker = vi.fn(async () => fencedResponse);

    const guardrail = getGuardrail(['billing'], ['violence'], llmInvoker);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'How to cause destruction' },
    });

    expect(result).not.toBeNull();
    expect(result!.action).toBe('block');
    expect(result!.reasonCode).toBe('BLOCKED_TOPIC');
    expect(result!.metadata.detectedTopic).toBe('violence');
  });

  // -------------------------------------------------------------------------
  // LLM returns on-topic for blocked topic label but onTopic: true
  // -------------------------------------------------------------------------

  it('allows when LLM classifies as on-topic even if detectedTopic matches a topic name', async () => {
    const llmInvoker = vi.fn(async () =>
      JSON.stringify({ onTopic: true, confidence: 0.9, detectedTopic: 'billing' })
    );

    const guardrail = getGuardrail(['billing'], ['violence'], llmInvoker);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'What is my current balance?' },
    });

    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Falls through to keywords when LLM returns garbage
  // -------------------------------------------------------------------------

  it('falls through to keyword matching when LLM returns unparseable text', async () => {
    const llmInvoker = vi.fn(async () => 'I cannot determine the topic of this message.');

    const guardrail = getGuardrail(['billing'], ['violence'], llmInvoker);
    const result = await guardrail.evaluateInput({
      input: { textInput: 'Tell me about billing' },
    });

    // LLM response has no JSON, so keyword matching kicks in.
    // "billing" appears as a substring, so keyword tier says on-topic.
    expect(llmInvoker).toHaveBeenCalledOnce();
    expect(result).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Prompt includes allowed and blocked topics
  // -------------------------------------------------------------------------

  it('sends a prompt containing the allowed and blocked topic lists', async () => {
    const llmInvoker = vi.fn(async () =>
      JSON.stringify({ onTopic: true, confidence: 0.8, detectedTopic: 'support' })
    );

    const guardrail = getGuardrail(['billing', 'support'], ['violence', 'gambling'], llmInvoker);
    await guardrail.evaluateInput({
      input: { textInput: 'How do I upgrade my plan?' },
    });

    const prompt = llmInvoker.mock.calls[0][0] as string;
    expect(prompt).toContain('billing');
    expect(prompt).toContain('support');
    expect(prompt).toContain('violence');
    expect(prompt).toContain('gambling');
    expect(prompt).toContain('How do I upgrade my plan?');
  });
});
