/**
 * File Read Tool
 * Read file contents.
 *
 * @module @framers/agentos-system-cli-executor
 */

import type { ITool } from '@framers/agentos';
import type { ShellService } from '../services/shellService';
import type { FileReadResult } from '../types';

/**
 * Tool for reading files
 */
export class FileReadTool implements ITool {
  public readonly id = 'fileRead';
  public readonly name = 'Read File';
  public readonly description = 'Read contents of a file';

  constructor(private shellService: ShellService) {}

  /**
   * Read file
   */
  async execute(input: {
    path: string;
    encoding?: BufferEncoding;
    maxBytes?: number;
    lines?: number;
    fromEnd?: boolean;
  }): Promise<{ success: boolean; output?: FileReadResult; error?: string }> {
    try {
      const result = await this.shellService.readFile(input.path, {
        encoding: input.encoding,
        maxBytes: input.maxBytes,
        lines: input.lines,
        fromEnd: input.fromEnd,
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
          description: 'File path to read',
        },
        encoding: {
          type: 'string',
          default: 'utf-8',
          description: 'File encoding',
        },
        maxBytes: {
          type: 'number',
          description: 'Maximum bytes to read',
        },
        lines: {
          type: 'number',
          description: 'Number of lines to read',
        },
        fromEnd: {
          type: 'boolean',
          default: false,
          description: 'Read lines from end of file',
        },
      },
    };
  }
}



