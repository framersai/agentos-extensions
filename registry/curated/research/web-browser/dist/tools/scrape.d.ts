/**
 * Scrape Tool
 * Extract content from web pages using CSS selectors.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { ScrapeResult } from '../types.js';
/**
 * Tool for scraping page content
 */
export declare class ScrapeTool implements ITool {
    private browserService;
    readonly id = "web-browser-scrape-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_scrape";
    readonly displayName = "Browser Scrape";
    readonly description = "Extract content from the current page using a CSS selector.";
    readonly category = "research";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute scraping
     */
    execute(input: {
        selector: string;
        limit?: number;
        attributes?: string[];
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<ScrapeResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=scrape.d.ts.map