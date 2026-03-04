/**
 * List Directory Tool
 * List directory contents.
 *
 * @module @framers/agentos-ext-cli-executor
 */
/**
 * Tool for listing directories
 */
export class ListDirectoryTool {
    shellService;
    id = 'cli-list-directory-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'list_directory';
    displayName = 'List Directory';
    description = 'List files and directories within a path.';
    category = 'system';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        required: ['path'],
        properties: {
            path: {
                type: 'string',
                description: 'Directory path to list',
            },
            showHidden: {
                type: 'boolean',
                default: false,
                description: 'Include hidden files',
            },
            recursive: {
                type: 'boolean',
                default: false,
                description: 'Recursive listing',
            },
            maxDepth: {
                type: 'number',
                default: 10,
                description: 'Maximum depth for recursive listing',
            },
            pattern: {
                type: 'string',
                description: 'Filter pattern (glob)',
            },
            includeStats: {
                type: 'boolean',
                default: false,
                description: 'Include file stats (size, dates)',
            },
        },
        additionalProperties: false,
    };
    constructor(shellService) {
        this.shellService = shellService;
    }
    /**
     * List directory
     */
    async execute(input, _context) {
        try {
            const result = await this.shellService.listDirectory(input.path, {
                showHidden: input.showHidden,
                recursive: input.recursive,
                maxDepth: input.maxDepth,
                pattern: input.pattern,
                includeStats: input.includeStats,
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
//# sourceMappingURL=listDir.js.map