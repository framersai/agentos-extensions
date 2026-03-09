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
    description = 'Navigate the browser to a URL and return full page text, all links on the page, and optionally raw HTML. Use this to visit websites and extract specific information including footer links, navigation items, and page content.';
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
            returnLinks: {
                type: 'boolean',
                default: true,
                description: 'Include all links found on the page (text + href)',
            },
            maxTextLength: {
                type: 'number',
                default: 50000,
                description: 'Maximum characters of page text to return (default 50000)',
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
            const maxLen = typeof input.maxTextLength === 'number' && input.maxTextLength > 0
                ? input.maxTextLength
                : 50000;
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
                const fullLen = result.text?.length || 0;
                if (fullLen > maxLen) {
                    output.text = result.text.slice(0, maxLen);
                    output.textTruncated = true;
                    output.fullTextLength = fullLen;
                    output.truncationNote =
                        `Page text was ${fullLen.toLocaleString()} characters, truncated to ${maxLen.toLocaleString()}. `
                            + `To get content from specific sections, use browser_scrape with a CSS selector (e.g. 'footer', 'main', '#content'). `
                            + `Or increase maxTextLength parameter.`;
                }
                else {
                    output.text = result.text;
                }
            }
            // Extract and return all links from the page (default: on)
            if (input.returnLinks !== false) {
                try {
                    const links = await this.browserService.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map(a => ({
                        text: (a.textContent || '').trim().slice(0, 200),
                        href: a.href,
                    })).filter(l => l.href && l.text));
                    output.links = links;
                }
                catch {
                    // Non-fatal — page may have restrictive CSP
                }
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