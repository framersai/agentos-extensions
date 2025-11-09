import { ITool } from '@agentos/core';
import { SearchProviderService } from '../services/searchProvider';

/**
 * Web search tool that queries multiple search providers
 * 
 * @class WebSearchTool
 * @implements {ITool}
 * 
 * @example
 * ```typescript
 * const tool = new WebSearchTool(searchService);
 * const result = await tool.execute({
 *   query: 'AgentOS extensions',
 *   maxResults: 10,
 *   provider: 'serper'
 * });
 * ```
 */
export class WebSearchTool implements ITool {
  public readonly id = 'webSearch';
  public readonly name = 'Web Search';
  public readonly description = 'Search the web using multiple providers';
  
  /**
   * Creates an instance of WebSearchTool
   * @param {SearchProviderService} searchService - The search provider service
   */
  constructor(private searchService: SearchProviderService) {}
  
  /**
   * Executes a web search query
   * 
   * @param {Object} input - The search parameters
   * @param {string} input.query - The search query string
   * @param {number} [input.maxResults=10] - Maximum number of results to return
   * @param {string} [input.provider] - Specific provider to use (serper, serpapi, brave, duckduckgo)
   * @returns {Promise<{success: boolean, output?: any, error?: string}>} The search results
   * 
   * @throws {Error} Throws if all providers fail
   */
  async execute(input: {
    query: string;
    maxResults?: number;
    provider?: 'serper' | 'serpapi' | 'brave' | 'duckduckgo';
  }): Promise<{ success: boolean; output?: any; error?: string }> {
    try {
      const results = await this.searchService.search(input.query, {
        maxResults: input.maxResults || 10,
        provider: input.provider
      });
      
      return {
        success: true,
        output: results
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Validates input parameters for the web search
   * 
   * @param {any} input - The input to validate
   * @returns {{valid: boolean, errors: string[]}} Validation result
   */
  validate(input: any): { valid: boolean; errors: string[] } {
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
      const validProviders = ['serper', 'serpapi', 'brave', 'duckduckgo'];
      if (!validProviders.includes(input.provider)) {
        errors.push('Invalid provider');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Returns the JSON schema for the tool's input
   * 
   * @returns {Object} JSON Schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return',
          default: 10,
          minimum: 1,
          maximum: 50
        },
        provider: {
          type: 'string',
          description: 'Specific search provider to use',
          enum: ['serper', 'serpapi', 'brave', 'duckduckgo']
        }
      }
    };
  }
}