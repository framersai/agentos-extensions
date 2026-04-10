// @ts-nocheck
/**
 * @fileoverview Preset configurations for common content policy scenarios.
 * @module content-policy-rewriter/presets
 */

import type { ContentPolicyRewriterConfig, ContentPolicyPreset, PolicyCategory, CategoryConfig } from './types.js';

const ALL_ENABLED_SANITIZE: Partial<Record<PolicyCategory, CategoryConfig>> = {
  illegal_harmful: { enabled: true, action: 'block' },
  adult: { enabled: true, action: 'sanitize' },
  profanity: { enabled: true, action: 'sanitize' },
  violence: { enabled: true, action: 'sanitize' },
  self_harm: { enabled: true, action: 'block' },
  hate_speech: { enabled: true, action: 'sanitize' },
  illegal_activity: { enabled: true, action: 'block' },
};

const PRESET_CONFIGS: Record<ContentPolicyPreset, Partial<ContentPolicyRewriterConfig>> = {
  uncensored: {
    categories: {
      illegal_harmful: { enabled: false },
      adult: { enabled: false },
      profanity: { enabled: false },
      violence: { enabled: false },
      self_harm: { enabled: false },
      hate_speech: { enabled: false },
      illegal_activity: { enabled: false },
    },
  },
  'uncensored-safe': {
    categories: {
      illegal_harmful: { enabled: true, action: 'block' },
    },
  },
  'family-friendly': {
    categories: ALL_ENABLED_SANITIZE,
  },
  enterprise: {
    categories: ALL_ENABLED_SANITIZE,
  },
};

/** Resolve a preset string or config object into a full config. */
export function resolvePreset(
  input: ContentPolicyPreset | ContentPolicyRewriterConfig,
): ContentPolicyRewriterConfig {
  if (typeof input === 'string') {
    const preset = PRESET_CONFIGS[input];
    if (!preset) return {};
    return { ...preset };
  }
  return input;
}
