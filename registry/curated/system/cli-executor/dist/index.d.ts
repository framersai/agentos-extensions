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
import { ExecuteTool } from './tools/execute.js';
import { FileReadTool } from './tools/fileRead.js';
import { FileWriteTool } from './tools/fileWrite.js';
import { ListDirectoryTool } from './tools/listDir.js';
import { CreatePdfTool } from './tools/createPdf.js';
import { CreateSpreadsheetTool } from './tools/createSpreadsheet.js';
import { CreateDocumentTool } from './tools/createDocument.js';
import { ReadDocumentTool } from './tools/readDocument.js';
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
export declare function createExtensionPack(context: {
    options?: Record<string, unknown>;
    secrets?: Record<string, string>;
    logger?: {
        info: (...args: unknown[]) => void;
    };
    onActivate?: () => Promise<void>;
    onDeactivate?: () => Promise<void>;
    [key: string]: unknown;
}): {
    name: string;
    version: string;
    descriptors: ({
        id: string;
        kind: string;
        priority: number;
        payload: ExecuteTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: FileReadTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: FileWriteTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: ListDirectoryTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: CreatePdfTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: CreateSpreadsheetTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: CreateDocumentTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: ReadDocumentTool;
    })[];
    /**
     * Called when extension is activated
     */
    onActivate: () => Promise<void>;
    /**
     * Called when extension is deactivated
     */
    onDeactivate: () => Promise<void>;
};
export { ShellService } from './services/shellService.js';
export { ExecuteTool } from './tools/execute.js';
export { FileReadTool } from './tools/fileRead.js';
export { FileWriteTool } from './tools/fileWrite.js';
export { ListDirectoryTool } from './tools/listDir.js';
export { CreatePdfTool } from './tools/createPdf.js';
export { CreateSpreadsheetTool } from './tools/createSpreadsheet.js';
export { CreateDocumentTool } from './tools/createDocument.js';
export { ReadDocumentTool } from './tools/readDocument.js';
export * from './types.js';
export default createExtensionPack;
//# sourceMappingURL=index.d.ts.map