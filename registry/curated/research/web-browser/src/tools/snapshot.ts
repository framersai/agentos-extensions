/**
 * Snapshot Tool
 * Get accessibility snapshot of the current page.
 *
 * @module @framers/agentos-research-web-browser
 */

import type { ITool } from '@framers/agentos';
import type { BrowserService } from '../services/browserService';
import type { PageSnapshot } from '../types';

/**
 * Tool for getting page snapshot
 */
export class SnapshotTool implements ITool {
  public readonly id = 'browserSnapshot';
  public readonly name = 'Page Snapshot';
  public readonly description = 'Get accessibility snapshot of current page with interactive elements';

  constructor(private browserService: BrowserService) {}

  /**
   * Execute snapshot capture
   */
  async execute(_input: {
    includeLinks?: boolean;
    includeForms?: boolean;
  }): Promise<{ success: boolean; output?: PageSnapshot; error?: string }> {
    try {
      const snapshot = await this.browserService.getSnapshot();

      return { success: true, output: snapshot };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validate(_input: any): { valid: boolean; errors: string[] } {
    return { valid: true, errors: [] };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        includeLinks: {
          type: 'boolean',
          default: true,
          description: 'Include links in snapshot',
        },
        includeForms: {
          type: 'boolean',
          default: true,
          description: 'Include forms in snapshot',
        },
      },
    };
  }
}



