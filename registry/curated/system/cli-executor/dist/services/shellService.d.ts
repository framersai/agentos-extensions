/**
 * Shell Service
 * Manages command execution with security validation.
 *
 * @module @framers/agentos-ext-cli-executor
 */
import type { ShellConfig, ExecutionResult, ScriptOptions, ScriptResult, FileReadOptions, FileReadResult, FileWriteOptions, FileWriteResult, ListDirectoryOptions, ListDirectoryResult, SecurityCheckResult } from '../types.js';
/**
 * Shell service for executing commands
 */
export declare class ShellService {
    private config;
    constructor(config?: ShellConfig);
    /**
     * Dynamically grant read access to an additional root directory.
     * Used by the runtime when folder access is approved at the guardrails layer.
     */
    addReadRoot(rootPath: string): void;
    /**
     * Dynamically grant write access to an additional root directory.
     * Used by the runtime when folder access is approved at the guardrails layer.
     */
    addWriteRoot(rootPath: string): void;
    private resolveAbsolutePath;
    private isFilesystemPolicyEnabled;
    private isWithinRoot;
    private resolvePathForAuthorization;
    private assertFilesystemAllowed;
    /**
     * Detect the appropriate shell for the current platform
     */
    private detectShell;
    /**
     * Check if a command is safe to execute
     */
    checkSecurity(command: string): SecurityCheckResult;
    /**
     * Execute a shell command
     */
    execute(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<ExecutionResult>;
    /**
     * Run a script file
     */
    runScript(scriptPath: string, options?: ScriptOptions): Promise<ScriptResult>;
    /**
     * Read a file
     */
    readFile(filePath: string, options?: FileReadOptions): Promise<FileReadResult>;
    /**
     * Read a file as a raw Buffer (for binary document formats).
     * Enforces the same filesystem security policy as readFile.
     */
    readFileBuffer(filePath: string): Promise<{
        buffer: Buffer;
        path: string;
        size: number;
    }>;
    /**
     * Write to a file
     */
    writeFile(filePath: string, content: string, options?: FileWriteOptions): Promise<FileWriteResult>;
    /**
     * List directory contents
     */
    listDirectory(dirPath: string, options?: ListDirectoryOptions): Promise<ListDirectoryResult>;
}
//# sourceMappingURL=shellService.d.ts.map