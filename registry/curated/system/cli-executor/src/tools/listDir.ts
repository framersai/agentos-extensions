/**
 * List Directory Tool
 * List directory contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */

import type { ITool } from '@framers/agentos';
import type { ShellService } from '../services/shellService';
import type { ListDirectoryResult } from '../types';

/**
 * Tool for listing directories
 */
export class ListDirectoryTool implements ITool {
  public readonly id = 'listDirectory';
  public readonly name = 'List Directory';
  public readonly description = 'List files and directories';

  constructor(private shellService: ShellService) {}

  /**
   * List directory
   */
  async execute(input: {
    path: string;
    showHidden?: boolean;
    recursive?: boolean;
    maxDepth?: number;
    pattern?: string;
    includeStats?: boolean;
  }): Promise<{ success: boolean; output?: ListDirectoryResult; error?: string }> {
    try {
      const result = await this.shellService.listDirectory(input.path, {
        showHidden: input.showHidden,
        recursive: input.recursive,
        maxDepth: input.maxDepth,
        pattern: input.pattern,
        includeStats: input.includeStats,
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

    if (!input.path) {
      errors.push('Path is required');
    } else if (typeof input.path !== 'string') {
      errors.push('Path must be a string');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list',
        },
        showHidden: {
          type: 'boolean',
          default: false,
          description: 'Include hidden files',
        },
        recursive: {
          type: 'boolean',
          default: false,
          description: 'Recursive listing',
        },
        maxDepth: {
          type: 'number',
          default: 10,
          description: 'Maximum depth for recursive listing',
        },
        pattern: {
          type: 'string',
          description: 'Filter pattern (glob)',
        },
        includeStats: {
          type: 'boolean',
          default: false,
          description: 'Include file stats (size, dates)',
        },
      },
    };
  }
}



