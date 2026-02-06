/**
 * AgentOS Web Browser Extension
 *
 * Provides browser automation capabilities for navigating pages, scraping content,
 * clicking elements, and capturing screenshots.
 *
 * @module @framers/agentos-ext-web-browser
 * @version 1.0.0
 * @license MIT
 */

import type { ExtensionContext, ExtensionPack } from '@framers/agentos';
import { BrowserService } from './services/browserService';
import { NavigateTool } from './tools/navigate';
import { ScrapeTool } from './tools/scrape';
import { ClickTool } from './tools/click';
import { TypeTool } from './tools/type';
import { ScreenshotTool } from './tools/screenshot';
import { SnapshotTool } from './tools/snapshot';
import type { BrowserConfig } from './types';

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
export function createExtensionPack(context: ExtensionContext): ExtensionPack {
  const options = (context.options as WebBrowserExtensionOptions) || {};

  // Initialize browser service with configuration
  const browserService = new BrowserService({
    headless: options.headless,
    timeout: options.timeout,
    userAgent: options.userAgent,
    viewport: options.viewport,
    executablePath: options.executablePath,
  });

  // Create tool instances
  const navigateTool = new NavigateTool(browserService);
  const scrapeTool = new ScrapeTool(browserService);
  const clickTool = new ClickTool(browserService);
  const typeTool = new TypeTool(browserService);
  const screenshotTool = new ScreenshotTool(browserService);
  const snapshotTool = new SnapshotTool(browserService);

  return {
    name: '@framers/agentos-ext-web-browser',
    version: '1.0.0',
    descriptors: [
      {
        id: 'browserNavigate',
        kind: 'tool',
        priority: options.priority || 50,
        payload: navigateTool,
      },
      {
        id: 'browserScrape',
        kind: 'tool',
        priority: options.priority || 50,
        payload: scrapeTool,
      },
      {
        id: 'browserClick',
        kind: 'tool',
        priority: options.priority || 50,
        payload: clickTool,
      },
      {
        id: 'browserType',
        kind: 'tool',
        priority: options.priority || 50,
        payload: typeTool,
      },
      {
        id: 'browserScreenshot',
        kind: 'tool',
        priority: options.priority || 50,
        payload: screenshotTool,
      },
      {
        id: 'browserSnapshot',
        kind: 'tool',
        priority: options.priority || 50,
        payload: snapshotTool,
      },
    ],

    /**
     * Called when extension is activated
     */
    onActivate: async () => {
      if (context.onActivate) {
        await context.onActivate();
      }
      context.logger?.info('Web Browser Extension activated');
    },

    /**
     * Called when extension is deactivated
     */
    onDeactivate: async () => {
      await browserService.close();
      if (context.onDeactivate) {
        await context.onDeactivate();
      }
      context.logger?.info('Web Browser Extension deactivated');
    },
  };
}

// Export types and classes for consumers
export { BrowserService } from './services/browserService';
export { NavigateTool } from './tools/navigate';
export { ScrapeTool } from './tools/scrape';
export { ClickTool } from './tools/click';
export { TypeTool } from './tools/type';
export { ScreenshotTool } from './tools/screenshot';
export { SnapshotTool } from './tools/snapshot';
export * from './types';

// Default export for convenience
export default createExtensionPack;



