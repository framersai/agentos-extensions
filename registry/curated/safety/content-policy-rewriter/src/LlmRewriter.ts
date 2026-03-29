/**
 * @fileoverview Layer 2b: LLM-based content rewriter.
 * Takes text with identified violations and rewrites it to remove them.
 * @module content-policy-rewriter/LlmRewriter
 */

import type { LlmInvoker, PolicyViolation } from './types.js';

const SYSTEM_PROMPT = `Rewrite the following text to remove policy violations while preserving the original meaning, tone, and information content. Do not add disclaimers or commentary — just output the clean version.`;

export class LlmRewriter {
  constructor(private llmInvoker: LlmInvoker) {}

  async rewrite(text: string, violations: PolicyViolation[], customRules?: string): Promise<string> {
    if (violations.length === 0) return text;

    const violationList = violations
      .map(v => `- ${v.category}: ${v.spans.map(s => `"${s}"`).join(', ')}`)
      .join('\n');

    let userPrompt = `Violations to remove:\n${violationList}\n`;
    if (customRules) userPrompt += `\nAdditional rules: ${customRules}\n`;
    userPrompt += `\nOriginal text:\n"""\n${text}\n"""\n\nRewritten text:`;

    try {
      const raw = await this.llmInvoker(SYSTEM_PROMPT, userPrompt);
      return raw.replace(/^```\w*\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim() || text;
    } catch {
      return text;
    }
  }
}
