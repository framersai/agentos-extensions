/**
 * Browser Service
 * Manages browser lifecycle and provides page interaction methods.
 *
 * @module @framers/agentos-ext-web-browser
 */
import type { BrowserConfig, NavigationResult, ScrapeResult, ClickResult, TypeResult, ScreenshotResult, ScreenshotOptions, PageSnapshot } from '../types.js';
/**
 * Browser service for managing browser automation
 */
export declare class BrowserService {
    private browser;
    private page;
    private config;
    private consoleMessages;
    constructor(config?: BrowserConfig);
    /**
     * Initialize browser instance
     */
    initialize(): Promise<void>;
    /**
     * Find Chrome executable path based on OS
     */
    private findChromePath;
    /**
     * Navigate to a URL
     */
    navigate(url: string, options?: {
        waitFor?: string;
    }): Promise<NavigationResult>;
    /**
     * Scrape content using CSS selector
     */
    scrape(selector: string): Promise<ScrapeResult>;
    /**
     * Click on an element
     */
    click(selector: string, options?: {
        waitForNavigation?: boolean;
    }): Promise<ClickResult>;
    /**
     * Type text into an input
     */
    type(selector: string, text: string, options?: {
        delay?: number;
        clear?: boolean;
    }): Promise<TypeResult>;
    /**
     * Take a screenshot
     */
    screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult>;
    /**
     * Get page snapshot with accessibility tree
     */
    getSnapshot(): Promise<PageSnapshot>;
    /**
     * Execute arbitrary JavaScript in page context
     */
    evaluate<T>(fn: string | (() => T)): Promise<T>;
    /**
     * Wait for selector to appear
     */
    waitForSelector(selector: string, timeout?: number): Promise<boolean>;
    /**
     * Get current URL
     */
    getCurrentUrl(): Promise<string>;
    /**
     * Go back in history
     */
    goBack(): Promise<void>;
    /**
     * Go forward in history
     */
    goForward(): Promise<void>;
    /**
     * Close browser
     */
    close(): Promise<void>;
}
//# sourceMappingURL=browserService.d.ts.map