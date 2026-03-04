/**
 * Type Tool
 * Type text into input fields.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { ITool, JSONSchemaObject, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { BrowserService } from '../services/browserService.js';
import type { TypeResult } from '../types.js';
/**
 * Tool for typing into inputs
 */
export declare class TypeTool implements ITool {
    private browserService;
    readonly id = "web-browser-type-v1";
    /** Tool call name used by the LLM / ToolExecutor. */
    readonly name = "browser_type";
    readonly displayName = "Browser Type";
    readonly description = "Type text into an input field using a CSS selector.";
    readonly category = "research";
    readonly hasSideEffects = true;
    readonly inputSchema: JSONSchemaObject;
    constructor(browserService: BrowserService);
    /**
     * Execute typing
     */
    execute(input: {
        selector: string;
        text: string;
        delay?: number;
        clear?: boolean;
    }, _context: ToolExecutionContext): Promise<ToolExecutionResult<TypeResult>>;
    /**
     * Validate input
     */
    validateArgs(input: Record<string, any>): {
        isValid: boolean;
        errors?: any[];
    };
}
//# sourceMappingURL=type.d.ts.map