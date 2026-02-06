/**
 * Type Tool
 * Type text into input fields.
 *
 * @module @framers/agentos-ext-web-browser
 */

import type { ITool } from '@framers/agentos';
import type { BrowserService } from '../services/browserService';
import type { TypeResult } from '../types';

/**
 * Tool for typing into inputs
 */
export class TypeTool implements ITool {
  public readonly id = 'browserType';
  public readonly name = 'Type Text';
  public readonly description = 'Type text into an input field';

  constructor(private browserService: BrowserService) {}

  /**
   * Execute typing
   */
  async execute(input: {
    selector: string;
    text: string;
    delay?: number;
    clear?: boolean;
  }): Promise<{ success: boolean; output?: TypeResult; error?: string }> {
    try {
      const result = await this.browserService.type(input.selector, input.text, {
        delay: input.delay,
        clear: input.clear,
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

    if (input.text === undefined || input.text === null) {
      errors.push('Text is required');
    } else if (typeof input.text !== 'string') {
      errors.push('Text must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['selector', 'text'],
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes (ms)',
          default: 0,
        },
        clear: {
          type: 'boolean',
          description: 'Clear existing text before typing',
          default: false,
        },
      },
    };
  }
}



