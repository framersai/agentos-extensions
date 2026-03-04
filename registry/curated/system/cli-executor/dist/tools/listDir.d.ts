/**
 * List Directory Tool
 * List directory contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ShellService } from '../services/shellService.js';
import type { ListDirectoryResult } from '../types.js';
/**
 * Tool for listing directories
 */
export declare class ListDirectoryTool implements ITool {
    private shellService;
    readonly id = "cli-list-directory-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "list_directory";
    readonly displayName = "List Directory";
    readonly description = "List files and directories within a path.";
    readonly category = "system";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(shellService: ShellService);
    /**
     * List directory
     */
    execute(input: {
        path: string;
        showHidden?: boolean;
        recursive?: boolean;
        maxDepth?: number;
        pattern?: string;
        includeStats?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<ListDirectoryResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=listDir.d.ts.map