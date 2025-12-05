/**
 * Click Tool
 * Click on elements in the current page.
 *
 * @module @framers/agentos-research-web-browser
 */

import type { ITool } from '@framers/agentos';
import type { BrowserService } from '../services/browserService';
import type { ClickResult } from '../types';

/**
 * Tool for clicking elements
 */
export class ClickTool implements ITool {
  public readonly id = 'browserClick';
  public readonly name = 'Click Element';
  public readonly description = 'Click on an element in the current page';

  constructor(private browserService: BrowserService) {}

  /**
   * Execute click
   */
  async execute(input: {
    selector: string;
    waitForNavigation?: boolean;
  }): Promise<{ success: boolean; output?: ClickResult; error?: string }> {
    try {
      const result = await this.browserService.click(input.selector, {
        waitForNavigation: input.waitForNavigation,
      });

      return { success: result.success, output: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.selector) {
      errors.push('Selector is required');
    } else if (typeof input.selector !== 'string') {
      errors.push('Selector must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['selector'],
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click',
        },
        waitForNavigation: {
          type: 'boolean',
          default: false,
          description: 'Wait for page navigation after click',
        },
      },
    };
  }
}



