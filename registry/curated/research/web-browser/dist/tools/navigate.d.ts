/**
 * Navigate Tool
 * Navigate browser to a URL and retrieve page content.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { NavigationResult } from '../types.js';
/**
 * Tool for navigating to URLs
 */
export declare class NavigateTool implements ITool {
    private browserService;
    readonly id = "web-browser-navigate-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_navigate";
    readonly displayName = "Browser Navigate";
    readonly description = "Navigate the browser to a URL and return full page text, all links on the page, and optionally raw HTML. Use this to visit websites and extract specific information including footer links, navigation items, and page content.";
    readonly category = "research";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute navigation
     */
    execute(input: {
        url: string;
        waitFor?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
        returnHtml?: boolean;
        returnText?: boolean;
        returnLinks?: boolean;
        maxTextLength?: number;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<NavigationResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=navigate.d.ts.map