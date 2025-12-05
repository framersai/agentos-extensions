/**
 * File Write Tool
 * Write content to files.
 *
 * @module @framers/agentos-system-cli-executor
 */

import type { ITool } from '@framers/agentos';
import type { ShellService } from '../services/shellService';
import type { FileWriteResult } from '../types';

/**
 * Tool for writing files
 */
export class FileWriteTool implements ITool {
  public readonly id = 'fileWrite';
  public readonly name = 'Write File';
  public readonly description = 'Write content to a file';

  constructor(private shellService: ShellService) {}

  /**
   * Write file
   */
  async execute(input: {
    path: string;
    content: string;
    encoding?: BufferEncoding;
    append?: boolean;
    createDirs?: boolean;
  }): Promise<{ success: boolean; output?: FileWriteResult; error?: string }> {
    try {
      const result = await this.shellService.writeFile(input.path, input.content, {
        encoding: input.encoding,
        append: input.append,
        createDirs: input.createDirs,
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

    if (input.content === undefined || input.content === null) {
      errors.push('Content is required');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get JSON schema for tool
   */
  getSchema(): any {
    return {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: {
          type: 'string',
          description: 'File path to write',
        },
        content: {
          type: 'string',
          description: 'Content to write',
        },
        encoding: {
          type: 'string',
          default: 'utf-8',
          description: 'File encoding',
        },
        append: {
          type: 'boolean',
          default: false,
          description: 'Append to file instead of overwriting',
        },
        createDirs: {
          type: 'boolean',
          default: true,
          description: 'Create parent directories if needed',
        },
      },
    };
  }
}



