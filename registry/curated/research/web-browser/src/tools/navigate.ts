/**
 * Navigate Tool
 * Navigate browser to a URL and retrieve page content.
 *
 * @module @framers/agentos-research-web-browser
 */

import type { ITool } from '@framers/agentos';
import type { BrowserService } from '../services/browserService';
import type { NavigationResult } from '../types';

/**
 * Tool for navigating to URLs
 */
export class NavigateTool implements ITool {
  public readonly id = 'browserNavigate';
  public readonly name = 'Navigate to URL';
  public readonly description = 'Navigate browser to a URL and get page content';

  constructor(private browserService: BrowserService) {}

  /**
   * Execute navigation
   */
  async execute(input: {
    url: string;
    waitFor?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
    returnHtml?: boolean;
    returnText?: boolean;
  }): Promise<{ success: boolean; output?: NavigationResult; error?: string }> {
    try {
      const result = await this.browserService.navigate(input.url, {
        waitFor: input.waitFor,
      });

      // Optionally strip html/text to reduce response size
      const output: NavigationResult = {
        url: result.url,
        status: result.status,
        title: result.title,
        loadTime: result.loadTime,
        consoleMessages: result.consoleMessages,
      };

      if (input.returnHtml) {
        output.html = result.html;
      }
      if (input.returnText !== false) {
        // Default to returning text
        output.text = result.text?.slice(0, 10000); // Limit text size
      }

      return { success: true, output };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.url) {
      errors.push('URL is required');
    } else if (typeof input.url !== 'string') {
      errors.push('URL must be a string');
    } else {
      try {
        new URL(input.url);
      } catch {
        errors.push('Invalid URL format');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        waitFor: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
          default: 'networkidle2',
          description: 'When to consider navigation complete',
        },
        returnHtml: {
          type: 'boolean',
          default: false,
          description: 'Include full HTML in response',
        },
        returnText: {
          type: 'boolean',
          default: true,
          description: 'Include extracted text in response',
        },
      },
    };
  }
}



