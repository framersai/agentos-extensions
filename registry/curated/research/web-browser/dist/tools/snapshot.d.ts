/**
 * Snapshot Tool
 * Get accessibility snapshot of the current page.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { PageSnapshot } from '../types.js';
/**
 * Tool for getting page snapshot
 */
export declare class SnapshotTool implements ITool {
    private browserService;
    readonly id = "web-browser-snapshot-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_snapshot";
    readonly displayName = "Browser Snapshot";
    readonly description = "Get an accessibility-like snapshot of the current page (interactive elements, links, forms).";
    readonly category = "research";
    readonly hasSideEffects = false;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute snapshot capture
     */
    execute(input: {
        includeLinks?: boolean;
        includeForms?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<PageSnapshot>>;
    /**
     * Validate input
     */
    validateArgs(_input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=snapshot.d.ts.map