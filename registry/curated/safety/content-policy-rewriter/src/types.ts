// @ts-nocheck
/**
 * @fileoverview Types for the content policy rewriter guardrail.
 * @module content-policy-rewriter/types
 */

/** Policy categories that can be individually enabled/disabled. */
export type PolicyCategory =
  | 'illegal_harmful'
  | 'adult'
  | 'profanity'
  | 'violence'
  | 'self_harm'
  | 'hate_speech'
  | 'illegal_activity'
  | 'custom';

export const ALL_POLICY_CATEGORIES: PolicyCategory[] = [
  'illegal_harmful', 'adult', 'profanity', 'violence',
  'self_harm', 'hate_speech', 'illegal_activity', 'custom',
];

/** Per-category configuration. */
export interface CategoryConfig {
  enabled?: boolean;
  action?: 'block' | 'sanitize';
}

/** A detected policy violation. */
export interface PolicyViolation {
  category: PolicyCategory;
  severity: 'low' | 'medium' | 'high';
  spans: string[];
}

/** Result from the LLM policy judge. */
export interface JudgeResult {
  violations: PolicyViolation[];
}

/** LLM invoker callback — matches the pattern used by ml-classifiers. */
export type LlmInvoker = (systemPrompt: string, userPrompt: string) => Promise<string>;

/** Full configuration for the content policy rewriter. */
export interface ContentPolicyRewriterConfig {
  categories?: Partial<Record<PolicyCategory, CategoryConfig>>;
  customRules?: string;
  llm?: {
    provider?: string;
    model?: string;
  };
  /** Override built-in keyword lists per category. */
  keywordLists?: Partial<Record<PolicyCategory, string[]>>;
  /** Enable keyword pre-filter on streaming chunks. Default: true. */
  streamingPreFilter?: boolean;
  /** LLM invoker callback. If not provided, uses a default fetch-based invoker. */
  llmInvoker?: LlmInvoker;
}

/** Preset names for shorthand configuration. */
export type ContentPolicyPreset = 'uncensored' | 'uncensored-safe' | 'family-friendly' | 'enterprise';
