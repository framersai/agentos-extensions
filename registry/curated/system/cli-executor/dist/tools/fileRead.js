/**
 * File Read Tool
 * Read file contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */
/**
 * Tool for reading files
 */
export class FileReadTool {
    shellService;
    id = 'cli-file-read-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'file_read';
    displayName = 'Read File';
    description = 'Read the contents of a file from disk.';
    category = 'system';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        required: ['path'],
        properties: {
            path: {
                type: 'string',
                description: 'File path to read',
            },
            encoding: {
                type: 'string',
                default: 'utf-8',
                description: 'File encoding',
            },
            maxBytes: {
                type: 'number',
                description: 'Maximum bytes to read',
            },
            lines: {
                type: 'number',
                description: 'Number of lines to read',
            },
            fromEnd: {
                type: 'boolean',
                default: false,
                description: 'Read lines from end of file',
            },
        },
        additionalProperties: false,
    };
    constructor(shellService) {
        this.shellService = shellService;
    }
    /**
     * Read file
     */
    async execute(input, _context) {
        try {
            const result = await this.shellService.readFile(input.path, {
                encoding: input.encoding,
                maxBytes: input.maxBytes,
                lines: input.lines,
                fromEnd: input.fromEnd,
            });
            return { success: true, output: result };
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
        if (!input.path) {
            errors.push('Path is required');
        }
        else if (typeof input.path !== 'string') {
            errors.push('Path must be a string');
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=fileRead.js.map