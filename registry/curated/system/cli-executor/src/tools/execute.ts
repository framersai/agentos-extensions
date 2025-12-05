/**
 * Execute Tool
 * Execute shell commands.
 *
 * @module @framers/agentos-system-cli-executor
 */

import type { ITool } from '@framers/agentos';
import type { ShellService } from '../services/shellService';
import type { ExecutionResult } from '../types';

/**
 * Tool for executing shell commands
 */
export class ExecuteTool implements ITool {
  public readonly id = 'shellExecute';
  public readonly name = 'Execute Shell Command';
  public readonly description = 'Execute a shell command and return output';

  constructor(private shellService: ShellService) {}

  /**
   * Execute command
   */
  async execute(input: {
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Promise<{ success: boolean; output?: ExecutionResult; error?: string }> {
    try {
      // Security check first
      const securityCheck = this.shellService.checkSecurity(input.command);
      if (!securityCheck.allowed) {
        return {
          success: false,
          error: `Security violation: ${securityCheck.reason}`,
        };
      }

      const result = await this.shellService.execute(input.command, {
        cwd: input.cwd,
        env: input.env,
        timeout: input.timeout,
      });

      return {
        success: result.success,
        output: result,
        error: result.success ? undefined : result.stderr,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Validate input
   */
  validate(input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!input.command) {
      errors.push('Command is required');
    } else if (typeof input.command !== 'string') {
      errors.push('Command must be a string');
    }

    if (input.timeout !== undefined) {
      if (typeof input.timeout !== 'number' || input.timeout <= 0) {
        errors.push('Timeout must be a positive number');
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
      required: ['command'],
      properties: {
        command: {
          type: 'string',
          description: 'Shell command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory for command',
        },
        env: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Environment variables',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds',
          default: 60000,
        },
      },
    };
  }
}



