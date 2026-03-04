/**
 * Scrape Tool
 * Extract content from web pages using CSS selectors.
 *
 * @module @framers/agentos-ext-web-browser
 */
/**
 * Tool for scraping page content
 */
export class ScrapeTool {
    browserService;
    id = 'web-browser-scrape-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'browser_scrape';
    displayName = 'Browser Scrape';
    description = 'Extract content from the current page using a CSS selector.';
    category = 'research';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        required: ['selector'],
        properties: {
            selector: {
                type: 'string',
                description: 'CSS selector to match elements',
            },
            limit: {
                type: 'number',
                description: 'Maximum number of elements to return',
                minimum: 1,
            },
            attributes: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific attributes to extract',
            },
        },
        additionalProperties: false,
    };
    constructor(browserService) {
        this.browserService = browserService;
    }
    /**
     * Execute scraping
     */
    async execute(input, _context) {
        try {
            const result = await this.browserService.scrape(input.selector);
            // Apply limit if specified
            if (input.limit && result.elements.length > input.limit) {
                result.elements = result.elements.slice(0, input.limit);
                result.count = result.elements.length;
            }
            // Filter attributes if specified
            if (input.attributes) {
                result.elements = result.elements.map((el) => ({
                    ...el,
                    attributes: Object.fromEntries(Object.entries(el.attributes).filter(([key]) => input.attributes.includes(key))),
                }));
            }
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
        if (!input.selector) {
            errors.push('Selector is required');
        }
        else if (typeof input.selector !== 'string') {
            errors.push('Selector must be a string');
        }
        if (input.limit !== undefined) {
            if (typeof input.limit !== 'number' || input.limit <= 0) {
                errors.push('Limit must be a positive number');
            }
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=scrape.js.map