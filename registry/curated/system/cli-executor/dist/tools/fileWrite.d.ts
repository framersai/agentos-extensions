/**
 * File Write Tool
 * Write content to files.
 *
 * @module @framers/agentos-ext-cli-executor
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ShellService } from '../services/shellService.js';
import type { FileWriteResult } from '../types.js';
/**
 * Tool for writing files
 */
export declare class FileWriteTool implements ITool {
    private shellService;
    readonly id = "cli-file-write-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "file_write";
    readonly displayName = "Write File";
    readonly description = "Write or append content to a file on disk.";
    readonly category = "system";
    readonly hasSideEffects = true;
    readonly inputSchema: JSONSchemaObject;
    constructor(shellService: ShellService);
    /**
     * Write file
     */
    execute(input: {
        path: string;
        content: string;
        encoding?: BufferEncoding;
        append?: boolean;
        createDirs?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<FileWriteResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=fileWrite.d.ts.map