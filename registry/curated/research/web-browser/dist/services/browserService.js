// @ts-nocheck
/**
 * Browser Service
 * Manages browser lifecycle and provides page interaction methods.
 *
 * @module @framers/agentos-ext-web-browser
 */
// Dynamic import for puppeteer to support environments where it's not available
let puppeteer = null;
let cheerio = null;
/**
 * Lazy load puppeteer-core
 */
async function getPuppeteer() {
    if (!puppeteer) {
        puppeteer = await import('puppeteer-core');
    }
    return puppeteer;
}
/**
 * Lazy load cheerio for HTML parsing
 */
async function getCheerio() {
    if (!cheerio) {
        cheerio = await import('cheerio');
    }
    return cheerio;
}
/**
 * Browser service for managing browser automation
 */
export class BrowserService {
    browser = null;
    page = null;
    config;
    consoleMessages = [];
    constructor(config = {}) {
        this.config = {
            headless: true,
            timeout: 30000,
            viewport: { width: 1920, height: 1080 },
            ...config,
        };
    }
    /**
     * Initialize browser instance
     */
    async initialize() {
        if (this.browser)
            return;
        const pptr = await getPuppeteer();
        // Try to find Chrome/Chromium executable
        const executablePath = this.config.executablePath || this.findChromePath();
        this.browser = await pptr.launch({
            headless: this.config.headless,
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
            ],
        });
        this.page = await this.browser.newPage();
        // Set viewport
        if (this.config.viewport) {
            await this.page.setViewport(this.config.viewport);
        }
        // Set user agent
        if (this.config.userAgent) {
            await this.page.setUserAgent(this.config.userAgent);
        }
        // Capture console messages
        this.page.on('console', (msg) => {
            this.consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
            // Keep only last 100 messages
            if (this.consoleMessages.length > 100) {
                this.consoleMessages.shift();
            }
        });
    }
    /**
     * Find Chrome executable path based on OS
     */
    findChromePath() {
        const platform = process.platform;
        if (platform === 'win32') {
            return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        }
        else if (platform === 'darwin') {
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        }
        else {
            // Linux
            return '/usr/bin/google-chrome';
        }
    }
    /**
     * Navigate to a URL
     */
    async navigate(url, options) {
        await this.initialize();
        const startTime = Date.now();
        this.consoleMessages = []; // Reset console messages
        const response = await this.page.goto(url, {
            waitUntil: options?.waitFor || 'networkidle2',
            timeout: this.config.timeout,
        });
        const loadTime = Date.now() - startTime;
        const [title, html, text] = await Promise.all([
            this.page.title(),
            this.page.content(),
            this.page.evaluate(() => document.body?.innerText || ''),
        ]);
        return {
            url: this.page.url(),
            status: response?.status() || 200,
            title,
            html,
            text,
            loadTime,
            consoleMessages: [...this.consoleMessages],
        };
    }
    /**
     * Scrape content using CSS selector
     */
    async scrape(selector) {
        await this.initialize();
        const $ = (await getCheerio()).load(await this.page.content());
        const elements = [];
        $(selector).each((_, el) => {
            const $el = $(el);
            const attributes = {};
            // Extract all attributes
            const attribs = el.attribs || {};
            for (const [key, value] of Object.entries(attribs)) {
                attributes[key] = String(value);
            }
            elements.push({
                tag: el.tagName || 'unknown',
                text: $el.text().trim(),
                html: $el.html() || '',
                attributes,
                href: $el.attr('href'),
                src: $el.attr('src'),
            });
        });
        return {
            selector,
            count: elements.length,
            elements,
        };
    }
    /**
     * Click on an element
     */
    async click(selector, options) {
        await this.initialize();
        try {
            const beforeUrl = this.page.url();
            if (options?.waitForNavigation) {
                await Promise.all([
                    this.page.waitForNavigation({ timeout: this.config.timeout }),
                    this.page.click(selector),
                ]);
            }
            else {
                await this.page.click(selector);
            }
            const afterUrl = this.page.url();
            return {
                success: true,
                element: selector,
                newUrl: beforeUrl !== afterUrl ? afterUrl : undefined,
                contentChanged: beforeUrl !== afterUrl,
            };
        }
        catch (error) {
            return {
                success: false,
                element: selector,
                contentChanged: false,
            };
        }
    }
    /**
     * Type text into an input
     */
    async type(selector, text, options) {
        await this.initialize();
        try {
            if (options?.clear) {
                await this.page.click(selector, { clickCount: 3 }); // Select all
                await this.page.keyboard.press('Backspace');
            }
            await this.page.type(selector, text, { delay: options?.delay || 0 });
            return {
                success: true,
                element: selector,
                text,
            };
        }
        catch (error) {
            return {
                success: false,
                element: selector,
                text,
            };
        }
    }
    /**
     * Take a screenshot
     */
    async screenshot(options) {
        await this.initialize();
        const format = options?.format || 'png';
        const screenshotOptions = {
            type: format,
            encoding: 'base64',
            fullPage: options?.fullPage || false,
        };
        if (format === 'jpeg' || format === 'webp') {
            screenshotOptions.quality = options?.quality || 80;
        }
        let data;
        if (options?.selector) {
            const element = await this.page.$(options.selector);
            if (!element) {
                throw new Error(`Element not found: ${options.selector}`);
            }
            data = await element.screenshot(screenshotOptions);
        }
        else {
            data = await this.page.screenshot(screenshotOptions);
        }
        // Get dimensions
        const viewport = this.page.viewport();
        return {
            data,
            format,
            width: viewport?.width || 1920,
            height: viewport?.height || 1080,
            size: Math.ceil((data.length * 3) / 4), // Approximate decoded size
        };
    }
    /**
     * Get page snapshot with accessibility tree
     */
    async getSnapshot() {
        await this.initialize();
        const [url, title, accessibilityTree] = await Promise.all([
            this.page.url(),
            this.page.title(),
            this.page.evaluate(() => {
                const elements = [];
                const links = [];
                const forms = [];
                const interactable = [];
                let refCounter = 0;
                function generateRef() {
                    return `e${refCounter++}`;
                }
                // Get all interactive elements
                const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]');
                interactiveElements.forEach((el) => {
                    const ref = generateRef();
                    const rect = el.getBoundingClientRect();
                    const visible = rect.width > 0 && rect.height > 0;
                    const label = el.innerText?.slice(0, 100) ||
                        el.getAttribute('aria-label') ||
                        el.getAttribute('title') ||
                        el.getAttribute('placeholder') ||
                        el.getAttribute('name') ||
                        '';
                    const element = {
                        ref,
                        type: el.tagName.toLowerCase(),
                        label: label.trim(),
                        role: el.getAttribute('role') || undefined,
                        visible,
                    };
                    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                        element.value = el.value;
                    }
                    elements.push(element);
                    // Track links
                    if (el.tagName === 'A') {
                        links.push({
                            text: label.trim().slice(0, 100),
                            href: el.href,
                            ref,
                        });
                    }
                    // Track interactable
                    if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) {
                        interactable.push({
                            ref,
                            type: el.tagName.toLowerCase(),
                            label: label.trim().slice(0, 50),
                        });
                    }
                });
                // Get forms
                document.querySelectorAll('form').forEach((form) => {
                    const fields = [];
                    form.querySelectorAll('input, select, textarea').forEach((field) => {
                        fields.push(field.getAttribute('name') ||
                            field.getAttribute('id') ||
                            field.tagName.toLowerCase());
                    });
                    forms.push({
                        id: form.id || undefined,
                        action: form.action || undefined,
                        fields,
                    });
                });
                return { elements, links, forms, interactable };
            }),
        ]);
        return {
            url,
            title,
            elements: accessibilityTree.elements,
            links: accessibilityTree.links,
            forms: accessibilityTree.forms,
            interactable: accessibilityTree.interactable,
        };
    }
    /**
     * Execute arbitrary JavaScript in page context
     */
    async evaluate(fn) {
        await this.initialize();
        return this.page.evaluate(fn);
    }
    /**
     * Wait for selector to appear
     */
    async waitForSelector(selector, timeout) {
        await this.initialize();
        try {
            await this.page.waitForSelector(selector, { timeout: timeout || this.config.timeout });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get current URL
     */
    async getCurrentUrl() {
        await this.initialize();
        return this.page.url();
    }
    /**
     * Go back in history
     */
    async goBack() {
        await this.initialize();
        await this.page.goBack({ waitUntil: 'networkidle2' });
    }
    /**
     * Go forward in history
     */
    async goForward() {
        await this.initialize();
        await this.page.goForward({ waitUntil: 'networkidle2' });
    }
    /**
     * Close browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}
//# sourceMappingURL=browserService.js.map