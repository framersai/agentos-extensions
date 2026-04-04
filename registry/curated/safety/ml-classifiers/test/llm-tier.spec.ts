/**
 * @file llm-tier.spec.ts
 * @description Tests for the LLM-as-judge (Tier 2) classification path.
 *
 * Exercises `classifyByLlm()` directly — verifying that the structured
 * classification prompt is sent to the invoker, JSON and markdown-wrapped JSON
 * are parsed correctly, and failures produce zero-confidence scores.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Force ONNX unavailable so classify() falls through to LLM tier
vi.mock('@huggingface/transformers', () => {
  throw new Error('ONNX not available');
});

import { classifyByLlm } from '../src/llm-classifier';
import type { LlmInvoker, ClassifierCategory } from '../src/types';
import { MLClassifierGuardrail } from '../src/MLClassifierGuardrail';

// ---------------------------------------------------------------------------
// Tests — classifyByLlm directly
// ---------------------------------------------------------------------------

describe('LLM tier — classifyByLlm()', () => {
  // -----------------------------------------------------------------------
  // Prompt verification
  // -----------------------------------------------------------------------

  describe('prompt sent to invoker', () => {
    it('sends a system prompt and the user text to the invoker', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue(
        JSON.stringify({
          toxic: false,
          injection: false,
          nsfw: false,
          threat: false,
          confidence: 0.9,
        })
      );

      await classifyByLlm('Hello world', invoker);

      expect(invoker).toHaveBeenCalledTimes(1);

      const [systemPrompt, userMessage] = (invoker as any).mock.calls[0];
      expect(typeof systemPrompt).toBe('string');
      expect(systemPrompt).toContain('content safety classifier');
      expect(userMessage).toBe('Hello world');
    });
  });

  // -----------------------------------------------------------------------
  // JSON parsing
  // -----------------------------------------------------------------------

  describe('JSON response parsing', () => {
    it('parses a clean JSON response into category scores', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue(
        JSON.stringify({
          toxic: true,
          injection: false,
          nsfw: false,
          threat: true,
          confidence: 0.85,
        })
      );

      const scores = await classifyByLlm('some bad text', invoker);

      expect(scores).toHaveLength(4);

      const toxic = scores.find((s) => s.name === 'toxic');
      expect(toxic?.confidence).toBe(0.85);

      const injection = scores.find((s) => s.name === 'injection');
      expect(injection?.confidence).toBe(0);

      const nsfw = scores.find((s) => s.name === 'nsfw');
      expect(nsfw?.confidence).toBe(0);

      const threat = scores.find((s) => s.name === 'threat');
      expect(threat?.confidence).toBe(0.85);
    });

    it('uses default confidence (0.7) when confidence is omitted', async () => {
      const invoker: LlmInvoker = vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ toxic: true, injection: false, nsfw: false, threat: false })
        );

      const scores = await classifyByLlm('abusive text', invoker);

      const toxic = scores.find((s) => s.name === 'toxic');
      expect(toxic?.confidence).toBe(0.7);
    });

    it('clamps confidence to [0, 1]', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue(
        JSON.stringify({
          toxic: true,
          injection: false,
          nsfw: false,
          threat: false,
          confidence: 5.0,
        })
      );

      const scores = await classifyByLlm('test', invoker);
      const toxic = scores.find((s) => s.name === 'toxic');
      expect(toxic?.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // -----------------------------------------------------------------------
  // Markdown-wrapped JSON
  // -----------------------------------------------------------------------

  describe('markdown-wrapped JSON handling', () => {
    it('strips ```json fences before parsing', async () => {
      const invoker: LlmInvoker = vi
        .fn()
        .mockResolvedValue(
          '```json\n{"toxic": true, "injection": false, "nsfw": false, "threat": false, "confidence": 0.9}\n```'
        );

      const scores = await classifyByLlm('wrapped response', invoker);
      const toxic = scores.find((s) => s.name === 'toxic');
      expect(toxic?.confidence).toBe(0.9);
    });

    it('strips bare ``` fences (no language tag)', async () => {
      const invoker: LlmInvoker = vi
        .fn()
        .mockResolvedValue(
          '```\n{"toxic": false, "injection": true, "nsfw": false, "threat": false, "confidence": 0.75}\n```'
        );

      const scores = await classifyByLlm('injection attempt', invoker);
      const injection = scores.find((s) => s.name === 'injection');
      expect(injection?.confidence).toBe(0.75);
    });

    it('handles trailing commas in LLM output', async () => {
      const invoker: LlmInvoker = vi
        .fn()
        .mockResolvedValue(
          '{"toxic": true, "injection": false, "nsfw": false, "threat": false, "confidence": 0.8,}'
        );

      const scores = await classifyByLlm('trailing comma', invoker);
      const toxic = scores.find((s) => s.name === 'toxic');
      expect(toxic?.confidence).toBe(0.8);
    });
  });

  // -----------------------------------------------------------------------
  // Failure modes
  // -----------------------------------------------------------------------

  describe('failure handling', () => {
    it('returns zero scores when invoker throws', async () => {
      const invoker: LlmInvoker = vi.fn().mockRejectedValue(new Error('LLM unavailable'));

      const scores = await classifyByLlm('test', invoker);

      expect(scores).toHaveLength(4);
      for (const score of scores) {
        expect(score.confidence).toBe(0);
      }
    });

    it('returns zero scores when invoker returns unparseable text', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue('I cannot classify this content.');

      const scores = await classifyByLlm('test', invoker);

      for (const score of scores) {
        expect(score.confidence).toBe(0);
      }
    });

    it('returns zero scores when invoker returns an array instead of object', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue('[1, 2, 3]');

      const scores = await classifyByLlm('test', invoker);

      for (const score of scores) {
        expect(score.confidence).toBe(0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Category filtering
  // -----------------------------------------------------------------------

  describe('category filtering', () => {
    it('returns scores only for requested categories', async () => {
      const invoker: LlmInvoker = vi.fn().mockResolvedValue(
        JSON.stringify({
          toxic: true,
          injection: true,
          nsfw: false,
          threat: false,
          confidence: 0.9,
        })
      );

      const subset: ClassifierCategory[] = ['toxic', 'injection'];
      const scores = await classifyByLlm('targeted', invoker, subset);

      expect(scores).toHaveLength(2);
      expect(scores.map((s) => s.name)).toEqual(['toxic', 'injection']);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — LLM tier via MLClassifierGuardrail.classify()
// ---------------------------------------------------------------------------

describe('LLM tier — via guardrail classify()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls through to LLM when ONNX is unavailable', async () => {
    const invoker: LlmInvoker = vi.fn().mockResolvedValue(
      JSON.stringify({
        toxic: true,
        injection: false,
        nsfw: false,
        threat: false,
        confidence: 0.9,
      })
    );

    const guardrail = new MLClassifierGuardrail({ llmInvoker: invoker });
    const result = await guardrail.classify('test');

    expect(result.source).toBe('llm');
    expect(invoker).toHaveBeenCalledTimes(1);
  });

  it('result.flagged is true when LLM detects a category above threshold', async () => {
    const invoker: LlmInvoker = vi.fn().mockResolvedValue(
      JSON.stringify({
        toxic: true,
        injection: false,
        nsfw: false,
        threat: false,
        confidence: 0.85,
      })
    );

    const guardrail = new MLClassifierGuardrail({ llmInvoker: invoker });
    const result = await guardrail.classify('abusive text');

    expect(result.flagged).toBe(true);
    expect(result.source).toBe('llm');

    const toxic = result.categories.find((c) => c.name === 'toxic');
    expect(toxic?.confidence).toBe(0.85);
  });
});
