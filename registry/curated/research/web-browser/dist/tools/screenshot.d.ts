/**
 * Screenshot Tool
 * Capture screenshots of the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { ScreenshotResult } from '../types.js';
/**
 * Tool for taking screenshots
 */
export declare class ScreenshotTool implements ITool {
    private browserService;
    readonly id = "web-browser-screenshot-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_screenshot";
    readonly displayName = "Browser Screenshot";
    readonly description = "Capture a screenshot of the current page or a specific element.";
    readonly category = "research";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute screenshot capture
     */
    execute(input: {
        fullPage?: boolean;
        selector?: string;
        format?: 'png' | 'jpeg' | 'webp';
        quality?: number;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<ScreenshotResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=screenshot.d.ts.map