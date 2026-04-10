// @ts-nocheck
/**
 * @fileoverview Layer 2a: LLM-based policy violation classifier.
 * Sends the full response text to an LLM with a structured classification prompt.
 * @module content-policy-rewriter/LlmPolicyJudge
 */

import type { LlmInvoker, PolicyCategory, CategoryConfig, JudgeResult } from './types.js';
import { CATEGORY_DESCRIPTIONS } from './categories.js';

const SYSTEM_PROMPT = `You are a content policy classifier. Analyze the provided text and identify any violations of the enabled policy categories. Respond with JSON only. If no violations, respond: { "violations": [] }`;

export class LlmPolicyJudge {
  constructor(private llmInvoker: LlmInvoker) {}

  async classify(
    text: string,
    enabledCategories: Partial<Record<PolicyCategory, CategoryConfig>>,
    customRules?: string,
  ): Promise<JudgeResult> {
    const categoryList = Object.entries(enabledCategories)
      .filter(([, cfg]) => cfg?.enabled)
      .map(([cat]) => `- ${cat}: ${CATEGORY_DESCRIPTIONS[cat as PolicyCategory]}`)
      .join('\n');

    if (!categoryList) return { violations: [] };

    let userPrompt = `Enabled categories:\n${categoryList}\n`;
    if (customRules) userPrompt += `\nCustom rules: ${customRules}\n`;
    userPrompt += `\nText to analyze:\n"""\n${text}\n"""\n\nRespond with JSON: { "violations": [{ "category": "...", "severity": "low|medium|high", "spans": ["offending phrase"] }] }`;

    try {
      const raw = await this.llmInvoker(SYSTEM_PROMPT, userPrompt);
      const cleaned = raw.replace(/```json\n?|```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as JudgeResult;
      if (!Array.isArray(parsed.violations)) return { violations: [] };
      return parsed;
    } catch {
      return { violations: [] };
    }
  }
}
