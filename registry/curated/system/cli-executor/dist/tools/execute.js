/**
 * Execute Tool
 * Execute shell commands.
 *
 * @module @framers/agentos-ext-cli-executor
 */
/**
 * Tool for executing shell commands
 */
export class ExecuteTool {
    shellService;
    id = 'cli-shell-execute-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'shell_execute';
    displayName = 'Execute Shell Command';
    description = 'Execute a shell command and return stdout/stderr/exit code.';
    category = 'system';
    hasSideEffects = true;
    inputSchema = {
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
        additionalProperties: false,
    };
    constructor(shellService) {
        this.shellService = shellService;
    }
    /**
     * Execute command
     */
    async execute(input, _context) {
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
                error: result.success ? undefined : result.stderr || 'Command failed',
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Validate input
     */
    validateArgs(input) {
        const errors = [];
        if (!input.command) {
            errors.push('Command is required');
        }
        else if (typeof input.command !== 'string') {
            errors.push('Command must be a string');
        }
        if (input.timeout !== undefined) {
            if (typeof input.timeout !== 'number' || input.timeout <= 0) {
                errors.push('Timeout must be a positive number');
            }
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=execute.js.map