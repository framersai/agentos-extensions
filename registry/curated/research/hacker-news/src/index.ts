/**
 * Hacker News Extension Pack — HN story search and filtering for agents.
 *
 * No API key required. Uses the public Algolia HN Search API.
 * Categories are inferred from content keywords (16 categories + 'general').
 */

import { HackerNewsTool } from './tools/hackerNews.js';

export interface HackerNewsExtensionOptions {
  priority?: number;
}

export function createExtensionPack(context: any) {
  const options = (context.options || {}) as HackerNewsExtensionOptions;
  const tool = new HackerNewsTool();

  return {
    name: '@framers/agentos-ext-hacker-news',
    version: '1.0.0',
    descriptors: [
      {
        id: tool.name,
        kind: 'tool' as const,
        priority: options.priority || 50,
        payload: tool,
        requiredSecrets: [],
      },
    ],
    onActivate: async () => context.logger?.info('Hacker News Extension activated'),
    onDeactivate: async () => context.logger?.info('Hacker News Extension deactivated'),
  };
}

export { HackerNewsTool };
export type { HackerNewsInput, HackerNewsOutput, HackerNewsStory } from './tools/hackerNews.js';
export default createExtensionPack;
