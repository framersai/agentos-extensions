/**
 * File Write Tool
 * Write content to files.
 *
 * @module @framers/agentos-ext-cli-executor
 */
/**
 * Tool for writing files
 */
export class FileWriteTool {
    shellService;
    id = 'cli-file-write-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'file_write';
    displayName = 'Write File';
    description = 'Write or append content to a file on disk.';
    category = 'system';
    hasSideEffects = true;
    inputSchema = {
        type: 'object',
        required: ['path', 'content'],
        properties: {
            path: {
                type: 'string',
                description: 'File path to write',
            },
            content: {
                type: 'string',
                description: 'Content to write',
            },
            encoding: {
                type: 'string',
                default: 'utf-8',
                description: 'File encoding',
            },
            append: {
                type: 'boolean',
                default: false,
                description: 'Append to file instead of overwriting',
            },
            createDirs: {
                type: 'boolean',
                default: true,
                description: 'Create parent directories if needed',
            },
        },
        additionalProperties: false,
    };
    constructor(shellService) {
        this.shellService = shellService;
    }
    /**
     * Write file
     */
    async execute(input, _context) {
        try {
            const result = await this.shellService.writeFile(input.path, input.content, {
                encoding: input.encoding,
                append: input.append,
                createDirs: input.createDirs,
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
        if (input.content === undefined || input.content === null) {
            errors.push('Content is required');
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=fileWrite.js.map