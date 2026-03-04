/**
 * Click Tool
 * Click on elements in the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { ClickResult } from '../types.js';
/**
 * Tool for clicking elements
 */
export declare class ClickTool implements ITool {
    private browserService;
    readonly id = "web-browser-click-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_click";
    readonly displayName = "Browser Click";
    readonly description = "Click an element in the current page using a CSS selector.";
    readonly category = "research";
    readonly hasSideEffects = true;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute click
     */
    execute(input: {
        selector: string;
        waitForNavigation?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<ClickResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=click.d.ts.map