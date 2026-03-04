/**
 * File Read Tool
 * Read file contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ShellService } from '../services/shellService.js';
import type { FileReadResult } from '../types.js';
/**
 * Tool for reading files
 */
export declare class FileReadTool implements ITool {
    private shellService;
    readonly id = "cli-file-read-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "file_read";
    readonly displayName = "Read File";
    readonly description = "Read the contents of a file from disk.";
    readonly category = "system";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(shellService: ShellService);
    /**
     * Read file
     */
    execute(input: {
        path: string;
        encoding?: BufferEncoding;
        maxBytes?: number;
        lines?: number;
        fromEnd?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<FileReadResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=fileRead.d.ts.map