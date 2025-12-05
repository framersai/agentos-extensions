/**
 * Screenshot Tool
 * Capture screenshots of the current page.
 *
 * @module @framers/agentos-research-web-browser
 */

import type { ITool } from '@framers/agentos';
import type { BrowserService } from '../services/browserService';
import type { ScreenshotResult } from '../types';

/**
 * Tool for taking screenshots
 */
export class ScreenshotTool implements ITool {
  public readonly id = 'browserScreenshot';
  public readonly name = 'Take Screenshot';
  public readonly description = 'Capture screenshot of current page or element';

  constructor(private browserService: BrowserService) {}

  /**
   * Execute screenshot capture
   */
  async execute(input: {
    fullPage?: boolean;
    selector?: string;
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number;
  }): Promise<{ success: boolean; output?: ScreenshotResult; error?: string }> {
    try {
      const result = await this.browserService.screenshot({
        fullPage: input.fullPage,
        selector: input.selector,
        format: input.format,
        quality: input.quality,
      });

      return { success: true, output: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (input.format && !['png', 'jpeg', 'webp'].includes(input.format)) {
      errors.push('Format must be png, jpeg, or webp');
    }

    if (input.quality !== undefined) {
      if (typeof input.quality !== 'number' || input.quality < 0 || input.quality > 100) {
        errors.push('Quality must be a number between 0 and 100');
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
      properties: {
        fullPage: {
          type: 'boolean',
          default: false,
          description: 'Capture full scrollable page',
        },
        selector: {
          type: 'string',
          description: 'CSS selector for specific element to capture',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
          description: 'Image format',
        },
        quality: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          default: 80,
          description: 'Quality for jpeg/webp (0-100)',
        },
      },
    };
  }
}

