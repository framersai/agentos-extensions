/**
 * AgentOS CLI Executor Extension
 *
 * Provides shell command execution, script running, and file management
 * capabilities for AgentOS agents.
 *
 * @module @framers/agentos-system-cli-executor
 * @version 1.0.0
 * @license MIT
 */

import type { ExtensionContext, ExtensionPack } from '@framers/agentos';
import { ShellService } from './services/shellService';
import { ExecuteTool } from './tools/execute';
import { FileReadTool } from './tools/fileRead';
import { FileWriteTool } from './tools/fileWrite';
import { ListDirectoryTool } from './tools/listDir';
import type { ShellConfig } from './types';

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
 * import { createExtensionPack } from '@framers/agentos-system-cli-executor';
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
    name: '@framers/agentos-system-cli-executor',
    version: '1.0.0',
    descriptors: [
      {
        id: 'shellExecute',
        kind: 'tool',
        priority: options.priority || 50,
        payload: executeTool,
      },
      {
        id: 'fileRead',
        kind: 'tool',
        priority: options.priority || 50,
        payload: fileReadTool,
      },
      {
        id: 'fileWrite',
        kind: 'tool',
        priority: options.priority || 50,
        payload: fileWriteTool,
      },
      {
        id: 'listDirectory',
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
export { ShellService } from './services/shellService';
export { ExecuteTool } from './tools/execute';
export { FileReadTool } from './tools/fileRead';
export { FileWriteTool } from './tools/fileWrite';
export { ListDirectoryTool } from './tools/listDir';
export * from './types';

// Default export for convenience
export default createExtensionPack;



