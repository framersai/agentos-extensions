/**
 * Navigate Tool
 * Navigate browser to a URL and retrieve page content.
 *
 * @module @framers/agentos-ext-web-browser
 */
/**
 * Tool for navigating to URLs
 */
export class NavigateTool {
    browserService;
    id = 'web-browser-navigate-v1';
    /** Tool call name used by the LLM / ToolExecutor. */
    name = 'browser_navigate';
    displayName = 'Browser Navigate';
    description = 'Navigate the browser to a URL and return page text (and optionally HTML).';
    category = 'research';
    hasSideEffects = false;
    inputSchema = {
        type: 'object',
        required: ['url'],
        properties: {
            url: {
                type: 'string',
                description: 'The URL to navigate to',
            },
            waitFor: {
                type: 'string',
                enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
                default: 'networkidle2',
                description: 'When to consider navigation complete',
            },
            returnHtml: {
                type: 'boolean',
                default: false,
                description: 'Include full HTML in response',
            },
            returnText: {
                type: 'boolean',
                default: true,
                description: 'Include extracted text in response',
            },
        },
        additionalProperties: false,
    };
    constructor(browserService) {
        this.browserService = browserService;
    }
    /**
     * Execute navigation
     */
    async execute(input, _context) {
        try {
            const result = await this.browserService.navigate(input.url, {
                waitFor: input.waitFor,
            });
            // Optionally strip html/text to reduce response size
            const output = {
                url: result.url,
                status: result.status,
                title: result.title,
                loadTime: result.loadTime,
                consoleMessages: result.consoleMessages,
            };
            if (input.returnHtml) {
                output.html = result.html;
            }
            if (input.returnText !== false) {
                // Default to returning text
                output.text = result.text?.slice(0, 10000); // Limit text size
            }
            return { success: true, output };
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
        if (!input.url) {
            errors.push('URL is required');
        }
        else if (typeof input.url !== 'string') {
            errors.push('URL must be a string');
        }
        else {
            try {
                new URL(input.url);
            }
            catch {
                errors.push('Invalid URL format');
            }
        }
        return errors.length === 0 ? { isValid: true } : { isValid: false, errors };
    }
}
//# sourceMappingURL=navigate.js.map