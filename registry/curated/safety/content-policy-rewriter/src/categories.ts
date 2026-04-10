// @ts-nocheck
/**
 * @fileoverview Built-in keyword lists per policy category.
 * @module content-policy-rewriter/categories
 */

import type { PolicyCategory, CategoryConfig } from './types.js';

/** Default category descriptions used in LLM judge prompts. */
export const CATEGORY_DESCRIPTIONS: Record<PolicyCategory, string> = {
  illegal_harmful: 'Child sexual abuse material (CSAM), sexual assault, bestiality, non-consensual acts, exploitation of minors, graphic torture',
  adult: 'Consensual sexually explicit content, pornographic descriptions',
  profanity: 'Slurs, vulgar language, obscenity, crude insults',
  violence: 'Graphic violence, gore, detailed injury descriptions',
  self_harm: 'Self-harm instructions, suicide methods, pro-anorexia content',
  hate_speech: 'Discriminatory language, bigotry, slurs targeting protected groups',
  illegal_activity: 'Drug synthesis instructions, weapons manufacturing, hacking tutorials',
  custom: 'User-defined policy rules',
};

/** Default actions per category. */
export const DEFAULT_CATEGORY_ACTIONS: Record<PolicyCategory, 'block' | 'sanitize'> = {
  illegal_harmful: 'block',
  adult: 'sanitize',
  profanity: 'sanitize',
  violence: 'sanitize',
  self_harm: 'block',
  hate_speech: 'sanitize',
  illegal_activity: 'block',
  custom: 'sanitize',
};

/** Default enabled state — only illegal_harmful is on by default. */
export const DEFAULT_CATEGORY_ENABLED: Record<PolicyCategory, boolean> = {
  illegal_harmful: true,
  adult: false,
  profanity: false,
  violence: false,
  self_harm: false,
  hate_speech: false,
  illegal_activity: false,
  custom: false,
};

/**
 * Built-in keyword lists for the streaming pre-filter.
 * Intentionally broad — false positives acceptable because the LLM judge
 * runs on the final response for accuracy.
 */
export const DEFAULT_KEYWORD_LISTS: Partial<Record<PolicyCategory, string[]>> = {
  profanity: [
    'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'bastard',
    'damn', 'nigger', 'faggot', 'retard', 'slut', 'whore',
  ],
  illegal_harmful: [
    'child porn', 'cp links', 'lolicon', 'underage sex', 'rape fantasy',
    'snuff film', 'crush video',
  ],
  self_harm: [
    'how to kill yourself', 'suicide method', 'cut yourself', 'end it all',
  ],
  hate_speech: [
    'kill all', 'gas the', 'ethnic cleansing', 'race war', 'white power',
    'heil hitler', 'death to',
  ],
};

/** Resolve effective config for a category. */
export function resolveCategoryConfig(
  category: PolicyCategory,
  userConfig?: Partial<Record<PolicyCategory, CategoryConfig>>,
): { enabled: boolean; action: 'block' | 'sanitize' } {
  const cfg = userConfig?.[category];
  return {
    enabled: cfg?.enabled ?? DEFAULT_CATEGORY_ENABLED[category],
    action: cfg?.action ?? DEFAULT_CATEGORY_ACTIONS[category],
  };
}
