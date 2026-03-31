/**
 * @fileoverview verify_citations tool — on-demand claim verification with web fallback.
 *
 * Self-contained: includes inline cosine similarity and claim extraction
 * so the extension works without depending on @framers/agentos at runtime.
 *
 * @module agentos-ext-citation-verifier/VerifyCitationsTool
 */

import type { VerifyCitationsInput, VerifyCitationsOutput } from './types.js';

/** Cosine similarity between two vectors. */
function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const d = Math.sqrt(magA) * Math.sqrt(magB);
  return d === 0 ? 0 : dot / d;
}

/** Simple sentence splitting for claim extraction. */
function extractClaims(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15)
    .filter(s => !s.startsWith('I think') && !s.startsWith('Maybe'))
    .filter(s => !s.endsWith('?'))
    .filter(s => !s.startsWith('I hope') && !s.startsWith('Let me know'));
}

export class VerifyCitationsTool {
  readonly id = 'verify_citations';
  readonly name = 'verify_citations';
  readonly displayName = 'Verify Citations';
  readonly description = 'Verify claims in text against provided sources using semantic similarity. Optionally falls back to web search for unverifiable claims.';
  readonly parameters = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Text containing claims to verify' },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, content: { type: 'string' }, url: { type: 'string' } },
        },
        description: 'Sources to verify against',
      },
      webFallback: { type: 'boolean', description: 'Search web for unverifiable claims' },
    },
    required: ['text'],
  };

  private embedFn?: (texts: string[]) => Promise<number[][]>;

  constructor(config?: { embedFn?: (texts: string[]) => Promise<number[][]> }) {
    this.embedFn = config?.embedFn;
  }

  setEmbedFn(fn: (texts: string[]) => Promise<number[][]>): void {
    this.embedFn = fn;
  }

  async execute(input: VerifyCitationsInput): Promise<VerifyCitationsOutput> {
    if (!this.embedFn) {
      return {
        claims: [], totalClaims: 0, supportedCount: 0,
        contradictedCount: 0, unverifiableCount: 0, supportedRatio: 0,
        summary: 'No embedding function available. Configure an embedding provider.',
      };
    }

    const claims = extractClaims(input.text);
    if (claims.length === 0) {
      return {
        claims: [], totalClaims: 0, supportedCount: 0,
        contradictedCount: 0, unverifiableCount: 0, supportedRatio: 1,
        summary: 'No verifiable claims found.',
      };
    }

    const sources = input.sources ?? [];
    const allTexts = [...claims, ...sources.map(s => s.content)];
    const allEmbeddings = await this.embedFn(allTexts);
    const claimEmbeddings = allEmbeddings.slice(0, claims.length);
    const sourceEmbeddings = allEmbeddings.slice(claims.length);

    const SUPPORT = 0.6;
    const UNVERIFIABLE = 0.3;

    const verdicts = claims.map((claim, i) => {
      let bestSim = 0, bestIdx = -1;
      for (let j = 0; j < sources.length; j++) {
        const sim = cosine(claimEmbeddings[i], sourceEmbeddings[j]);
        if (sim > bestSim) { bestSim = sim; bestIdx = j; }
      }

      const verdict = bestSim >= SUPPORT ? 'supported' as const
        : bestSim < UNVERIFIABLE ? 'unverifiable' as const
        : 'weak' as const;

      return {
        text: claim,
        verdict,
        confidence: bestSim,
        source: bestIdx >= 0 ? {
          title: sources[bestIdx]?.title,
          snippet: sources[bestIdx]?.content.slice(0, 200),
          url: sources[bestIdx]?.url,
        } : undefined,
        webVerified: false,
      };
    });

    // Web fallback
    if (input.webFallback) {
      for (const v of verdicts) {
        if (v.verdict === 'unverifiable') {
          try {
            const webMod = await import('@framers/agentos-ext-web-search');
            const fc = new (webMod as any).FactCheckTool({});
            const r = await fc.execute({ statement: v.text });
            if (r?.verdict === 'TRUE') { v.verdict = 'supported'; v.webVerified = true; }
            else if (r?.verdict === 'FALSE') { v.verdict = 'contradicted'; v.webVerified = true; }
          } catch { /* unavailable */ }
        }
      }
    }

    const supported = verdicts.filter(v => v.verdict === 'supported').length;
    const contradicted = verdicts.filter(v => v.verdict === 'contradicted').length;
    const unverifiable = verdicts.filter(v => v.verdict === 'unverifiable').length;

    return {
      claims: verdicts,
      totalClaims: verdicts.length,
      supportedCount: supported,
      contradictedCount: contradicted,
      unverifiableCount: unverifiable,
      supportedRatio: verdicts.length > 0 ? supported / verdicts.length : 1,
      summary: `${supported}/${verdicts.length} claims verified (${Math.round((supported / verdicts.length) * 100)}%)`,
    };
  }
}
