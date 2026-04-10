// @ts-nocheck
/**
 * Stealth Scrape Tool
 * Extract content from bot-protected pages using CSS selectors with stealth browser.
 *
 * @module @framers/agentos-ext-stealth-browser
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { StealthBrowserService } from '../StealthBrowserService.js';
import type { ScrapeResult } from '../types.js';

/**
 * Tool for scraping content from bot-protected pages
 */
export class StealthScrapeTool implements ITool {
  public readonly id = 'stealth-browser-scrape-v1';
  /** Tool call name used by the LLM / ToolExecutor. */
  public readonly name = 'stealth_scrape';
  public readonly displayName = 'Stealth Scrape';
  public readonly description =
    'Extract content from the current page using a CSS selector via the stealth browser. ' +
    'Use this for bot-protected sites where browser_scrape would be blocked.';
  public readonly category = 'research';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    required: ['selector'],
    properties: {
      selector: {
        type: 'string',
        description: 'CSS selector to match elements',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of elements to return',
        minimum: 1,
      },
      attributes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific attributes to extract',
      },
    },
    additionalProperties: false,
  };

  constructor(private browserService: StealthBrowserService) {}

  /**
   * Execute stealth scraping
   */
  async execute(
    input: { selector: string; limit?: number; attributes?: string[] },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ScrapeResult>> {
    try {
      const result = await this.browserService.scrape(input.selector);

      // Apply limit if specified
      if (input.limit && result.elements.length > input.limit) {
        result.elements = result.elements.slice(0, input.limit);
        result.count = result.elements.length;
      }

      // Filter attributes if specified
      if (input.attributes) {
        result.elements = result.elements.map((el) => ({
          ...el,
          attributes: Object.fromEntries(
            Object.entries(el.attributes).filter(([key]) =>
              input.attributes!.includes(key),
            ),
          ),
        }));
      }

      return { success: true, output: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!input.selector) {
      errors.push('Selector is required');
    } else if (typeof input.selector !== 'string') {
      errors.push('Selector must be a string');
    }

    if (input.limit !== undefined) {
      if (typeof input.limit !== 'number' || input.limit <= 0) {
        errors.push('Limit must be a positive number');
      }
    }

    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}
