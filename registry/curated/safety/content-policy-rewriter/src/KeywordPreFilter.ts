/**
 * @fileoverview Layer 1: Zero-cost keyword/regex pre-filter for streaming chunks.
 * Scans text against per-category keyword lists. No LLM calls.
 * @module content-policy-rewriter/KeywordPreFilter
 */

import type { PolicyCategory, CategoryConfig } from './types.js';
import { DEFAULT_KEYWORD_LISTS } from './categories.js';

export interface KeywordMatch {
  category: PolicyCategory;
  keyword: string;
}

export class KeywordPreFilter {
  private patterns: Map<PolicyCategory, RegExp[]>;

  constructor(customLists?: Partial<Record<PolicyCategory, string[]>>) {
    this.patterns = new Map();
    const merged = { ...DEFAULT_KEYWORD_LISTS, ...customLists };
    for (const [cat, keywords] of Object.entries(merged)) {
      if (keywords?.length) {
        this.patterns.set(
          cat as PolicyCategory,
          keywords.map(kw => new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')),
        );
      }
    }
  }

  /**
   * Scan text against enabled category keyword lists.
   * @returns First match found, or null if clean.
   */
  scan(
    text: string,
    enabledCategories: Partial<Record<PolicyCategory, CategoryConfig>>,
  ): KeywordMatch | null {
    for (const [cat, patterns] of this.patterns) {
      const cfg = enabledCategories[cat];
      if (!cfg?.enabled) continue;
      for (const re of patterns) {
        const match = text.match(re);
        if (match) return { category: cat, keyword: match[0] };
      }
    }
    return null;
  }
}
