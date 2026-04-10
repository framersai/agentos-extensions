// @ts-nocheck
/**
 * File Read Tool
 * Read file contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */

import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ShellService } from '../services/shellService.js';
import type { FileReadResult } from '../types.js';

/**
 * Tool for reading files
 */
export class FileReadTool implements ITool {
  public readonly id = 'cli-file-read-v1';
  /** Tool call name used by the LLM / ToolExecutor. */
  public readonly name = 'file_read';
  public readonly displayName = 'Read File';
  public readonly description = 'Read the contents of a file from disk.';
  public readonly category = 'system';
  public readonly hasSideEffects = false;

  public readonly inputSchema: JSONSchemaObject = {
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
    additionalProperties: false,
  };

  constructor(private shellService: ShellService) {}

  /**
   * Read file
   */
  async execute(
    input: {
    path: string;
    encoding?: BufferEncoding;
    maxBytes?: number;
    lines?: number;
    fromEnd?: boolean;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<FileReadResult>> {
    try {
      // Redirect binary document formats to read_document tool
      if (input.path && /\.(xlsx?|docx|pdf)$/i.test(input.path)) {
        const ext = input.path.match(/\.[^.]+$/)?.[0] || '';
        return {
          success: false,
          error: `Cannot read binary document "${input.path}" with file_read — this will return garbled content. Use the read_document tool instead to parse ${ext} files and extract their text content.`,
        };
      }

      // Fail-fast: detect directories before requesting any permissions or doing I/O
      try {
        const resolved = resolve(input.path);
        const stats = await stat(resolved);
        if (stats.isDirectory()) {
          return {
            success: false,
            error: `"${input.path}" is a directory, not a file. Use list_directory to view directory contents.`,
          };
        }
      } catch {
        // Path doesn't exist or can't be stat'd — let readFile handle it
      }

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
  validateArgs(input: Record<string, any>): { isValid: boolean; errors?: any[] } {
    const errors: string[] = [];

    if (!input.path) {
      errors.push('Path is required');
    } else if (typeof input.path !== 'string') {
      errors.push('Path must be a string');
    }

    return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
  }
}

