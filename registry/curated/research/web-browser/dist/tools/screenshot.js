// @ts-nocheck
/**
 * Screenshot Tool
 * Capture screenshots of the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
/**
 * Tool for taking screenshots
 */
export class ScreenshotTool {
    browserService;
    id = 'web-browser-screenshot-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'browser_screenshot';
    displayName = 'Browser Screenshot';
    description = 'Capture a screenshot of the current page or a specific element.';
    category = 'research';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        properties: {
            fullPage: {
                type: 'boolean',
                default: false,
                description: 'Capture full scrollable page',
            },
            selector: {
                type: 'string',
                description: 'CSS selector for specific element to capture',
            },
            format: {
                type: 'string',
                enum: ['png', 'jpeg', 'webp'],
                default: 'png',
                description: 'Image format',
            },
            quality: {
                type: 'number',
                minimum: 0,
                maximum: 100,
                default: 80,
                description: 'Quality for jpeg/webp (0-100)',
            },
        },
        additionalProperties: false,
    };
    constructor(browserService) {
        this.browserService = browserService;
    }
    /**
     * Execute screenshot capture
     */
    async execute(input, _context) {
        try {
            const result = await this.browserService.screenshot({
                fullPage: input.fullPage,
                selector: input.selector,
                format: input.format,
                quality: input.quality,
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
        if (input.format && !['png', 'jpeg', 'webp'].includes(input.format)) {
            errors.push('Format must be png, jpeg, or webp');
        }
        if (input.quality !== undefined) {
            if (typeof input.quality !== 'number' || input.quality < 0 || input.quality > 100) {
                errors.push('Quality must be a number between 0 and 100');
            }
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=screenshot.js.map