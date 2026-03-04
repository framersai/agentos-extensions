/**
 * Execute Tool
 * Execute shell commands.
 *
 * @module @framers/agentos-ext-cli-executor
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { ShellService } from '../services/shellService.js';
import type { ExecutionResult } from '../types.js';
/**
 * Tool for executing shell commands
 */
export declare class ExecuteTool implements ITool {
    private shellService;
    readonly id = "cli-shell-execute-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "shell_execute";
    readonly displayName = "Execute Shell Command";
    readonly description = "Execute a shell command and return stdout/stderr/exit code.";
    readonly category = "system";
    readonly hasSideEffects = true;
    readonly inputSchema: JSONSchemaObject;
    constructor(shellService: ShellService);
    /**
     * Execute command
     */
    execute(input: {
        command: string;
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<ExecutionResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=execute.d.ts.map