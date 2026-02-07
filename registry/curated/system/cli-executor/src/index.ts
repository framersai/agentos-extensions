/**
 * AgentOS CLI Executor Extension
 *
 * Provides shell command execution, script running, and file management
 * capabilities for AgentOS agents.
 *
 * @module @framers/agentos-ext-cli-executor
 * @version 1.1.0
 * @license MIT
 */

import type { ExtensionContext, ExtensionPack } from '@framers/agentos';
import { ShellService } from './services/shellService.js';
import { ExecuteTool } from './tools/execute.js';
import { FileReadTool } from './tools/fileRead.js';
import { FileWriteTool } from './tools/fileWrite.js';
import { ListDirectoryTool } from './tools/listDir.js';
import type { ShellConfig } from './types.js';

/**
 * Extension configuration options
 */
export interface CLIExecutorExtensionOptions extends ShellConfig {
  /** Extension priority in the stack */
  priority?: number;
}

/**
 * Creates the CLI executor extension pack
 *
 * @param context - The extension context
 * @returns The configured extension pack
 *
 * @example
 * ```typescript
 * import { createExtensionPack } from '@framers/agentos-ext-cli-executor';
 *
 * const pack = createExtensionPack({
 *   options: {
 *     defaultShell: 'bash',
 *     timeout: 60000,
 *     blockedCommands: ['rm -rf /']
 *   },
 *   logger: console
 * });
 * ```
 */
export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const options = (context.options as CLIExecutorExtensionOptions) || {};

  // Initialize shell service with configuration
  const shellService = new ShellService({
    defaultShell: options.defaultShell,
    timeout: options.timeout,
    workingDirectory: options.workingDirectory,
    allowedCommands: options.allowedCommands,
    blockedCommands: options.blockedCommands,
    env: options.env,
  });

  // Create tool instances
  const executeTool = new ExecuteTool(shellService);
  const fileReadTool = new FileReadTool(shellService);
  const fileWriteTool = new FileWriteTool(shellService);
  const listDirectoryTool = new ListDirectoryTool(shellService);

  return {
    name: '@framers/agentos-ext-cli-executor',
    version: '1.1.0',
    descriptors: [
      {
        id: executeTool.name,
        kind: 'tool',
        priority: options.priority || 50,
        payload: executeTool,
      },
      {
        id: fileReadTool.name,
        kind: 'tool',
        priority: options.priority || 50,
        payload: fileReadTool,
      },
      {
        id: fileWriteTool.name,
        kind: 'tool',
        priority: options.priority || 50,
        payload: fileWriteTool,
      },
      {
        id: listDirectoryTool.name,
        kind: 'tool',
        priority: options.priority || 50,
        payload: listDirectoryTool,
      },
    ],

    /**
     * Called when extension is activated
     */
    onActivate: async () => {
      if (context.onActivate) {
        await context.onActivate();
      }
      context.logger?.info('CLI Executor Extension activated');
    },

    /**
     * Called when extension is deactivated
     */
    onDeactivate: async () => {
      if (context.onDeactivate) {
        await context.onDeactivate();
      }
      context.logger?.info('CLI Executor Extension deactivated');
    },
  };
}

// Export types and classes for consumers
export { ShellService } from './services/shellService.js';
export { ExecuteTool } from './tools/execute.js';
export { FileReadTool } from './tools/fileRead.js';
export { FileWriteTool } from './tools/fileWrite.js';
export { ListDirectoryTool } from './tools/listDir.js';
export * from './types.js';

// Default export for convenience
export default createExtensionPack;
