/**
 * Click Tool
 * Click on elements in the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
/**
 * Tool for clicking elements
 */
export class ClickTool {
    browserService;
    id = 'web-browser-click-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'browser_click';
    displayName = 'Browser Click';
    description = 'Click an element in the current page using a CSS selector.';
    category = 'research';
    hasSideEffects = true;
    inputSchema = {
        type: 'object',
        required: ['selector'],
        properties: {
            selector: {
                type: 'string',
                description: 'CSS selector for the element to click',
            },
            waitForNavigation: {
                type: 'boolean',
                default: false,
                description: 'Wait for page navigation after click',
            },
        },
        additionalProperties: false,
    };
    constructor(browserService) {
        this.browserService = browserService;
    }
    /**
     * Execute click
     */
    async execute(input, _context) {
        try {
            const result = await this.browserService.click(input.selector, {
                waitForNavigation: input.waitForNavigation,
            });
            return { success: result.success, output: result, error: result.success ? undefined : 'Click failed' };
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
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=click.js.map