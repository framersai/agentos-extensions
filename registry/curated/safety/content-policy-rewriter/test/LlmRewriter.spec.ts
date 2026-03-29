import { describe, it, expect, vi } from 'vitest';
import { LlmRewriter } from '../src/LlmRewriter.js';
import type { LlmInvoker, PolicyViolation } from '../src/types.js';

describe('LlmRewriter', () => {
  const mockLlm: LlmInvoker = vi.fn();

  it('returns rewritten text from LLM', async () => {
    (mockLlm as any).mockResolvedValueOnce('The person expressed frustration.');
    const rewriter = new LlmRewriter(mockLlm);
    const violations: PolicyViolation[] = [
      { category: 'profanity', severity: 'medium', spans: ['bad word'] },
    ];
    const result = await rewriter.rewrite('The person said bad word in anger.', violations);
    expect(result).toBe('The person expressed frustration.');
  });

  it('returns original text on LLM failure', async () => {
    (mockLlm as any).mockRejectedValueOnce(new Error('LLM unavailable'));
    const rewriter = new LlmRewriter(mockLlm);
    const violations = [{ category: 'profanity' as const, severity: 'low' as const, spans: ['x'] }];
    const result = await rewriter.rewrite('original text', violations);
    expect(result).toBe('original text');
  });

  it('strips markdown fences from LLM response', async () => {
    (mockLlm as any).mockResolvedValueOnce('```\nClean version of the text.\n```');
    const rewriter = new LlmRewriter(mockLlm);
    const result = await rewriter.rewrite('dirty text', [
      { category: 'profanity', severity: 'low', spans: ['dirty'] },
    ]);
    expect(result).toBe('Clean version of the text.');
  });
});
