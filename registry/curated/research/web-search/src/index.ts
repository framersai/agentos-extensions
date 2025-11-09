/**
 * AgentOS Web Search Extension
 * 
 * Provides web search capabilities through multiple providers with automatic fallback.
 * 
 * @module @framers/agentos-research-web-search
 * @version 1.0.0
 * @license MIT
 */

import { ExtensionContext, ExtensionPack } from '@agentos/core';
import { WebSearchTool } from './tools/webSearch';
import { ResearchAggregatorTool } from './tools/researchAggregator';
import { FactCheckTool } from './tools/factCheck';
import { SearchProviderService } from './services/searchProvider';

/**
 * Extension configuration options
 */
export interface WebSearchExtensionOptions {
  /** Serper.dev API key */
  serperApiKey?: string;
  /** SerpAPI API key */
  serpApiKey?: string;
  /** Brave Search API key */
  braveApiKey?: string;
  /** Default maximum results for searches */
  defaultMaxResults?: number;
  /** Rate limiting configuration */
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
  /** Extension priority in the stack */
  priority?: number;
}

/**
 * Creates the web search extension pack
 * 
 * @param {ExtensionContext} context - The extension context
 * @returns {ExtensionPack} The configured extension pack
 * 
 * @example
 * ```typescript
 * import { createExtensionPack } from '@framers/agentos-research-web-search';
 * 
 * const pack = createExtensionPack({
 *   options: {
 *     serperApiKey: process.env.SERPER_API_KEY,
 *     defaultMaxResults: 10
 *   },
 *   logger: console
 * });
 * ```
 */
export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const options = context.options as WebSearchExtensionOptions || {};
  
  // Initialize search service with configuration
  const searchService = new SearchProviderService({
    serperApiKey: options.serperApiKey,
    serpApiKey: options.serpApiKey,
    braveApiKey: options.braveApiKey,
    rateLimit: options.rateLimit
  });
  
  // Create tool instances
  const webSearchTool = new WebSearchTool(searchService);
  const researchAggregator = new ResearchAggregatorTool(searchService);
  const factCheckTool = new FactCheckTool(searchService);
  
  return {
    name: '@framers/agentos-research-web-search',
    version: '1.0.0',
    descriptors: [
      {
        id: 'webSearch',
        kind: 'tool',
        priority: options.priority || 50,
        payload: webSearchTool
      },
      {
        id: 'researchAggregator',
        kind: 'tool',
        priority: options.priority || 50,
        payload: researchAggregator
      },
      {
        id: 'factCheck',
        kind: 'tool',
        priority: options.priority || 50,
        payload: factCheckTool
      }
    ],
    /**
     * Called when extension is activated
     */
    onActivate: async () => {
      if (context.onActivate) {
        await context.onActivate();
      }
      context.logger?.info('Web Search Extension activated');
    },
    /**
     * Called when extension is deactivated
     */
    onDeactivate: async () => {
      if (context.onDeactivate) {
        await context.onDeactivate();
      }
      context.logger?.info('Web Search Extension deactivated');
    }
  };
}

// Export types for consumers
export { WebSearchTool, ResearchAggregatorTool, FactCheckTool };
export { SearchProviderService, SearchResult, ProviderResponse } from './services/searchProvider';
export type { SearchProviderConfig } from './services/searchProvider';

// Default export for convenience
export default createExtensionPack;