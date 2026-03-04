/**
 * AgentOS Web Browser Extension
 *
 * Provides browser automation capabilities for navigating pages, scraping content,
 * clicking elements, and capturing screenshots.
 *
 * @module @framers/agentos-ext-web-browser
 * @version 1.1.0
 * @license MIT
 */
import { NavigateTool } from './tools/navigate.js';
import { ScrapeTool } from './tools/scrape.js';
import { ClickTool } from './tools/click.js';
import { TypeTool } from './tools/type.js';
import { ScreenshotTool } from './tools/screenshot.js';
import { SnapshotTool } from './tools/snapshot.js';
import type { BrowserConfig } from './types.js';
/**
 * Extension configuration options
 */
export interface WebBrowserExtensionOptions extends BrowserConfig {
    /** Extension priority in the stack */
    priority?: number;
}
/**
 * Creates the web browser extension pack
 *
 * @param context - The extension context
 * @returns The configured extension pack
 *
 * @example
 * ```typescript
 * import { createExtensionPack } from '@framers/agentos-ext-web-browser';
 *
 * const pack = createExtensionPack({
 *   options: {
 *     headless: true,
 *     timeout: 30000,
 *     viewport: { width: 1920, height: 1080 }
 *   },
 *   logger: console
 * });
 * ```
 */
export declare function createExtensionPack(context: {
    options?: Record<string, unknown>;
    secrets?: Record<string, string>;
    logger?: {
        info: (...args: unknown[]) => void;
    };
    onActivate?: () => Promise<void>;
    onDeactivate?: () => Promise<void>;
    [key: string]: unknown;
}): {
    name: string;
    version: string;
    descriptors: ({
        id: string;
        kind: string;
        priority: number;
        payload: NavigateTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: ScrapeTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: ClickTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: TypeTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: ScreenshotTool;
    } | {
        id: string;
        kind: string;
        priority: number;
        payload: SnapshotTool;
    })[];
    /**
     * Called when extension is activated
     */
    onActivate: () => Promise<void>;
    /**
     * Called when extension is deactivated
     */
    onDeactivate: () => Promise<void>;
};
export { BrowserService } from './services/browserService.js';
export { NavigateTool } from './tools/navigate.js';
export { ScrapeTool } from './tools/scrape.js';
export { ClickTool } from './tools/click.js';
export { TypeTool } from './tools/type.js';
export { ScreenshotTool } from './tools/screenshot.js';
export { SnapshotTool } from './tools/snapshot.js';
export * from './types.js';
export default createExtensionPack;
//# sourceMappingURL=index.d.ts.map