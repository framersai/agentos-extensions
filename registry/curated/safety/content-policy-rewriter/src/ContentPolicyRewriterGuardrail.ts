// @ts-nocheck
/**
 * @fileoverview Main guardrail orchestrator for content policy rewriting.
 *
 * Implements IGuardrailService with a two-layer hybrid pipeline:
 * - Layer 1: KeywordPreFilter on streaming TEXT_DELTA chunks (zero-cost)
 * - Layer 2: LLM Policy Judge + LLM Rewriter on FINAL_RESPONSE
 *
 * Phase 1 sanitizer — sequential execution, can return SANITIZE with modifiedText.
 *
 * @module content-policy-rewriter/ContentPolicyRewriterGuardrail
 */

import type { ContentPolicyRewriterConfig, PolicyCategory, CategoryConfig, LlmInvoker } from './types.js';
import { resolveCategoryConfig } from './categories.js';
import { ALL_POLICY_CATEGORIES } from './types.js';
import { KeywordPreFilter } from './KeywordPreFilter.js';
import { LlmPolicyJudge } from './LlmPolicyJudge.js';
import { LlmRewriter } from './LlmRewriter.js';

/** GuardrailAction values (avoid import issues by inlining). */
const BLOCK = 'block';
const SANITIZE = 'sanitize';

export interface ContentPolicyRewriterOptions extends ContentPolicyRewriterConfig {
  llmInvoker: LlmInvoker;
}

export class ContentPolicyRewriterGuardrail {
  readonly config = {
    canSanitize: true,
    evaluateStreamingChunks: true,
    streamingMode: 'per-chunk' as const,
  };

  private enabledCategories: Partial<Record<PolicyCategory, CategoryConfig>>;
  private keywordFilter: KeywordPreFilter;
  private judge: LlmPolicyJudge;
  private rewriter: LlmRewriter;
  private customRules?: string;

  constructor(options: ContentPolicyRewriterOptions) {
    this.customRules = options.customRules;

    // Resolve enabled categories
    this.enabledCategories = {};
    for (const cat of ALL_POLICY_CATEGORIES) {
      const resolved = resolveCategoryConfig(cat, options.categories);
      if (resolved.enabled) {
        this.enabledCategories[cat] = { enabled: true, action: resolved.action };
      }
    }

    this.keywordFilter = new KeywordPreFilter(options.keywordLists);
    this.judge = new LlmPolicyJudge(options.llmInvoker);
    this.rewriter = new LlmRewriter(options.llmInvoker);

    if (options.streamingPreFilter === false) {
      this.config.evaluateStreamingChunks = false;
    }
  }

  async evaluateInput(_payload: any): Promise<any> {
    return null; // Content policy rewriter only evaluates output
  }

  async evaluateOutput(payload: any): Promise<any> {
    const chunk = payload?.chunk;
    if (!chunk) return null;

    const hasEnabledCategories = Object.keys(this.enabledCategories).length > 0;
    if (!hasEnabledCategories) return null;

    // Layer 1: Keyword pre-filter on streaming chunks
    if (chunk.type === 'TEXT_DELTA' && chunk.text) {
      const match = this.keywordFilter.scan(chunk.text, this.enabledCategories);
      if (match) {
        const action = this.enabledCategories[match.category]?.action ?? BLOCK;
        return {
          action,
          reasonCode: `KEYWORD_${match.category.toUpperCase()}`,
          ...(action === SANITIZE ? { modifiedText: '[Content removed by policy]' } : {}),
        };
      }
      return null;
    }

    // Layer 2: LLM judge + rewriter on final response
    if (chunk.type === 'FINAL_RESPONSE' && chunk.finalResponseText) {
      const text = chunk.finalResponseText;

      // Quick keyword check — BLOCK immediately if keyword match + action=block
      const kwMatch = this.keywordFilter.scan(text, this.enabledCategories);
      if (kwMatch && this.enabledCategories[kwMatch.category]?.action === BLOCK) {
        return {
          action: BLOCK,
          reasonCode: `KEYWORD_${kwMatch.category.toUpperCase()}`,
        };
      }

      // LLM classification
      const judgeResult = await this.judge.classify(text, this.enabledCategories, this.customRules);
      if (judgeResult.violations.length === 0) return null;

      // Check if all violations map to BLOCK
      const allBlock = judgeResult.violations.every(
        v => this.enabledCategories[v.category]?.action === BLOCK,
      );
      if (allBlock) {
        return {
          action: BLOCK,
          reasonCode: judgeResult.violations.map(v => v.category).join(','),
        };
      }

      // At least one SANITIZE — rewrite
      const rewritten = await this.rewriter.rewrite(text, judgeResult.violations, this.customRules);
      return {
        action: SANITIZE,
        modifiedText: rewritten,
        reasonCode: judgeResult.violations.map(v => v.category).join(','),
      };
    }

    return null;
  }
}
