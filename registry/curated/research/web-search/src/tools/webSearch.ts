/**
 * Web Search Tool — multi-provider search via SearchProviderService.
 *
 * Updated to conform to AgentOS `ITool` (inputSchema + ToolExecutionContext).
 *
 * @module @framers/agentos-ext-web-search
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ProviderResponse, MultiSearchResponse } from '../services/searchProvider.js';
import { SearchProviderService } from '../services/searchProvider.js';

export interface WebSearchInput {
  query: string;
  maxResults?: number;
  provider?: 'serper' | 'serpapi' | 'brave' | 'searxng' | 'duckduckgo';
  multiSearch?: boolean;
  category?: string;
}

export type WebSearchOutput = ProviderResponse | MultiSearchResponse;

export class WebSearchTool implements ITool<WebSearchInput, WebSearchOutput> {
  public readonly id = 'web-search-v1';
  /** Tool call name used by the LLM / ToolExecutor. */
  public readonly name = 'web_search';
  public readonly displayName = 'Web Search';
  public readonly description =
    'Search the web using multiple providers (Serper, SerpAPI, Brave, SearXNG, DuckDuckGo fallback). Set multiSearch=true to query ALL providers in parallel for higher-confidence, deduplicated results.';
  public readonly category = 'research';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['query'],
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      maxResults: {
        type: 'integer',
        description: 'Maximum number of results to return',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
      provider: {
        type: 'string',
        description: 'Specific search provider to use (ignored when multiSearch is true)',
        enum: ['serper', 'serpapi', 'brave', 'searxng', 'duckduckgo'],
      },
      multiSearch: {
        type: 'boolean',
        description:
          'When true, searches ALL available providers in parallel and returns merged, deduplicated results ranked by cross-provider agreement. Useful for deep research or fact verification.',
        default: false,
      },
      category: {
        type: 'string',
        description: 'Search category (SearXNG only). Options: general, news, images, videos, it, science, files, social_media',
        enum: ['general', 'news', 'images', 'videos', 'it', 'science', 'files', 'social_media'],
      },
    },
    additionalProperties: false,
  };

  public readonly requiredCapabilities = ['capability:web_search'];

  constructor(
    private readonly searchService: SearchProviderService,
    private readonly defaultMultiSearch: boolean = false,
  ) {}

  async execute(input: WebSearchInput, _context: ToolExecutionContext): Promise<ToolExecutionResult<WebSearchOutput>> {
    try {
      const useMultiSearch = input.multiSearch ?? this.defaultMultiSearch;

      if (useMultiSearch && !input.provider) {
        const results = await this.searchService.multiSearch(input.query, {
          maxResults: input.maxResults || 10,
        });
        return { success: true, output: results };
      }

      const results = await this.searchService.search(input.query, {
        maxResults: input.maxResults || 10,
        provider: input.provider,
        category: input.category,
      });
      return { success: true, output: results };
    } catch (error: any) {
      return { success: false, error: error?.message || String(error) };
    }
  }

  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!input.query) {
      errors.push('Query is required');
    } else if (typeof input.query !== 'string') {
      errors.push('Query must be a string');
    }

    if (input.maxResults !== undefined) {
      if (typeof input.maxResults !== 'number' || input.maxResults <= 0) {
        errors.push('maxResults must be a positive number');
      }
    }

    if (input.provider !== undefined) {
      const validProviders = ['serper', 'serpapi', 'brave', 'searxng', 'duckduckgo'];
      if (!validProviders.includes(input.provider)) {
        errors.push('Invalid provider');
      }
    }

    if (input.multiSearch !== undefined && typeof input.multiSearch !== 'boolean') {
      errors.push('multiSearch must be a boolean');
    }

    if (input.multiSearch && input.provider) {
      errors.push('Cannot specify both multiSearch and a specific provider');
    }

    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
