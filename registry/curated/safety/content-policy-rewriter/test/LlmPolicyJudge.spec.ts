import { describe, it, expect, vi } from 'vitest';
import { LlmPolicyJudge } from '../src/LlmPolicyJudge.js';
import type { LlmInvoker } from '../src/types.js';

describe('LlmPolicyJudge', () => {
  const mockLlm: LlmInvoker = vi.fn();

  it('returns empty violations for clean content', async () => {
    (mockLlm as any).mockResolvedValueOnce('{ "violations": [] }');
    const judge = new LlmPolicyJudge(mockLlm);
    const result = await judge.classify('Hello world', {
      profanity: { enabled: true, action: 'sanitize' },
    });
    expect(result.violations).toEqual([]);
  });

  it('parses violation response correctly', async () => {
    (mockLlm as any).mockResolvedValueOnce(JSON.stringify({
      violations: [{ category: 'profanity', severity: 'medium', spans: ['bad word'] }],
    }));
    const judge = new LlmPolicyJudge(mockLlm);
    const result = await judge.classify('text with bad word', {
      profanity: { enabled: true, action: 'sanitize' },
    });
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].category).toBe('profanity');
  });

  it('handles malformed LLM response gracefully', async () => {
    (mockLlm as any).mockResolvedValueOnce('not json at all');
    const judge = new LlmPolicyJudge(mockLlm);
    const result = await judge.classify('some text', {
      profanity: { enabled: true, action: 'sanitize' },
    });
    expect(result.violations).toEqual([]);
  });

  it('includes custom rules in prompt', async () => {
    (mockLlm as any).mockResolvedValueOnce('{ "violations": [] }');
    const judge = new LlmPolicyJudge(mockLlm);
    await judge.classify('text', {
      custom: { enabled: true, action: 'sanitize' },
    }, 'Never mention competitor X');
    const call = (mockLlm as any).mock.calls[0];
    expect(call[1]).toContain('Never mention competitor X');
  });
});
