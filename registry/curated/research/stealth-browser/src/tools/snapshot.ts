// @ts-nocheck
/**
 * Stealth Snapshot Tool
 * Extract structured DOM snapshot from bot-protected pages via stealth browser.
 *
 * @module @framers/agentos-ext-stealth-browser
 */

import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { StealthBrowserService } from '../StealthBrowserService.js';
import type { PageSnapshot } from '../types.js';

/**
 * Tool for getting page snapshot via stealth browser
 */
export class StealthSnapshotTool implements ITool {
  public readonly id = 'stealth-browser-snapshot-v1';
  /** Tool call name used by the LLM / ToolExecutor. */
  public readonly name = 'stealth_snapshot';
  public readonly displayName = 'Stealth Snapshot';
  public readonly description =
    'Get an accessibility-like snapshot of the current page (interactive elements, links, forms) ' +
    'via the stealth browser. Use for bot-protected sites.';
  public readonly category = 'research';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
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
    additionalProperties: false,
  };

  constructor(private browserService: StealthBrowserService) {}

  /**
   * Execute stealth snapshot capture
   */
  async execute(
    input: { includeLinks?: boolean; includeForms?: boolean },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<PageSnapshot>> {
    try {
      const snapshot = await this.browserService.getSnapshot();

      const includeLinks = input.includeLinks !== false;
      const includeForms = input.includeForms !== false;

      return {
        success: true,
        output: {
          ...snapshot,
          links: includeLinks ? snapshot.links : [],
          forms: includeForms ? snapshot.forms : [],
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validateArgs(_input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    return { isValid: true };
  }
}
