/**
 * Snapshot Tool
 * Get accessibility snapshot of the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
/**
 * Tool for getting page snapshot
 */
export class SnapshotTool {
    browserService;
    id = 'web-browser-snapshot-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'browser_snapshot';
    displayName = 'Browser Snapshot';
    description = 'Get an accessibility-like snapshot of the current page (interactive elements, links, forms).';
    category = 'research';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        properties: {
            includeLinks: {
                type: 'boolean',
                default: true,
                description: 'Include links in snapshot',
            },
            includeForms: {
                type: 'boolean',
                default: true,
                description: 'Include forms in snapshot',
            },
        },
        additionalProperties: false,
    };
    constructor(browserService) {
        this.browserService = browserService;
    }
    /**
     * Execute snapshot capture
     */
    async execute(input, _context) {
        try {
            const snapshot = await this.browserService.getSnapshot();
            const includeLinks = input.includeLinks !== false;
            const includeForms = input.includeForms !== false;
            return {
                success: true,
                output: {
                    ...snapshot,
                    links: includeLinks ? snapshot.links : [],
                    forms: includeForms ? snapshot.forms : [],
                },
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    /**
     * Validate input
     */
    validateArgs(_input) {
        return { isValid: true };
    }
}
//# sourceMappingURL=snapshot.js.map