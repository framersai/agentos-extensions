import { describe, it, expect } from 'vitest';
import { VerifyCitationsTool } from '../src/VerifyCitationsTool.js';

function mockEmbedFn(texts: string[]): Promise<number[][]> {
  return Promise.resolve(texts.map(t => {
    const vec = new Array(8).fill(0);
    for (let i = 0; i < t.length; i++) vec[i % 8] += t.charCodeAt(i) / 1000;
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return mag > 0 ? vec.map(v => v / mag) : vec;
  }));
}

describe('VerifyCitationsTool', () => {
  it('has correct metadata', () => {
    const tool = new VerifyCitationsTool();
    expect(tool.id).toBe('verify_citations');
    expect(tool.parameters.required).toContain('text');
  });

  it('returns empty when no embed function', async () => {
    const tool = new VerifyCitationsTool();
    const result = await tool.execute({ text: 'Some claim.' });
    expect(result.totalClaims).toBe(0);
    expect(result.summary).toContain('No embedding');
  });

  it('verifies claims against sources', async () => {
    const tool = new VerifyCitationsTool({ embedFn: mockEmbedFn });
    const result = await tool.execute({
      text: 'The sky appears blue during the daytime hours.',
      sources: [{ content: 'The sky appears blue due to Rayleigh scattering of light.' }],
    });
    expect(result.totalClaims).toBeGreaterThanOrEqual(1);
    expect(result.summary).toMatch(/claims verified/);
  });

  it('returns proper counts that add up', async () => {
    const tool = new VerifyCitationsTool({ embedFn: mockEmbedFn });
    const result = await tool.execute({
      text: 'Cats are domesticated mammals that purr loudly. Fish can fly through the upper atmosphere.',
      sources: [{ content: 'Cats are domesticated mammals known for purring.' }],
    });
    // weakCount not in output type — count weak claims from array
    const weakCount = result.claims.filter(c => c.verdict === 'weak').length;
    expect(result.supportedCount + result.unverifiableCount + weakCount + result.contradictedCount)
      .toBe(result.totalClaims);
  });
});
