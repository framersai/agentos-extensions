/**
 * Stealth Browser Service
 *
 * Manages browser lifecycle using puppeteer-extra with the stealth plugin
 * to bypass anti-bot detection on protected sites (Amazon, eBay, LinkedIn, etc.).
 *
 * The stealth plugin handles:
 * - navigator.webdriver removal
 * - chrome.runtime injection
 * - iframe contentWindow proxy
 * - media codecs spoofing
 * - navigator.plugins injection
 * - WebGL vendor spoofing
 * - navigator.languages injection
 * - window.chrome injection
 * - Permission API spoofing
 *
 * @module @framers/agentos-ext-stealth-browser
 */

import type {
  StealthBrowserConfig,
  NavigationResult,
  ScrapeResult,
  ScrapeElement,
  ClickResult,
  TypeResult,
  ScreenshotResult,
  ScreenshotOptions,
  PageSnapshot,
} from './types.js';

// Dynamic imports for puppeteer-extra and plugins
let puppeteerExtra: any = null;
let StealthPlugin: any = null;
let cheerio: any = null;

/**
 * Lazy load puppeteer-extra
 */
async function getPuppeteerExtra() {
  if (!puppeteerExtra) {
    puppeteerExtra = (await import('puppeteer-extra')).default;
  }
  return puppeteerExtra;
}

/**
 * Lazy load stealth plugin
 */
async function getStealthPlugin() {
  if (!StealthPlugin) {
    const mod = await import('puppeteer-extra-plugin-stealth');
    StealthPlugin = mod.default || mod;
  }
  return StealthPlugin;
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
 * Realistic user agents for rotation.
 * Chrome 120+ on macOS and Windows to match common browser fingerprints.
 */
const USER_AGENTS = [
  // Chrome 120 on macOS Sonoma
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Chrome 121 on macOS Sonoma
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  // Chrome 122 on macOS Sonoma
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Chrome 120 on Windows 11
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Chrome 121 on Windows 11
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  // Chrome 122 on Windows 11
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  // Chrome 123 on macOS
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  // Chrome 123 on Windows
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
];

/**
 * Select a random user agent from the pool
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Stealth browser service for managing anti-detection browser automation.
 *
 * Uses puppeteer-extra with the stealth plugin for comprehensive
 * anti-fingerprinting and bot-detection bypass.
 */
export class StealthBrowserService {
  private browser: any = null;
  private page: any = null;
  private config: StealthBrowserConfig;
  private consoleMessages: string[] = [];
  private stealthInitialized = false;

  constructor(config: StealthBrowserConfig = {}) {
    this.config = {
      headless: true,
      timeout: 30000,
      viewport: { width: 1920, height: 1080 },
      enableEvasions: true,
      ...config,
    };
  }

  /**
   * Initialize stealth browser instance.
   *
   * Applies the stealth plugin to puppeteer-extra, then launches with
   * extra anti-detection Chromium flags and a realistic user agent.
   */
  async initialize(): Promise<void> {
    if (this.browser) return;

    const pptr = await getPuppeteerExtra();
    const StealthPluginFactory = await getStealthPlugin();

    // Apply stealth plugin once
    if (!this.stealthInitialized && this.config.enableEvasions !== false) {
      pptr.use(StealthPluginFactory());
      this.stealthInitialized = true;
    }

    // Find Chrome/Chromium executable
    const executablePath = this.config.executablePath || this.findChromePath();

    // Select user agent (custom or random from pool)
    const userAgent = this.config.userAgent || getRandomUserAgent();

    this.browser = await pptr.launch({
      headless: this.config.headless ? 'new' : false,
      executablePath,
      args: [
        // Sandbox / stability
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',

        // Anti-detection flags
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',

        // Realistic window size
        '--window-size=1920,1080',

        // Reduce fingerprint surface
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-web-security',
        '--allow-running-insecure-content',

        // GPU / rendering
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    });

    this.page = await this.browser.newPage();

    // Set viewport
    if (this.config.viewport) {
      await this.page.setViewport(this.config.viewport);
    }

    // Set realistic user agent
    await this.page.setUserAgent(userAgent);

    // Remove webdriver property via page evaluate
    await this.page.evaluateOnNewDocument(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Override navigator.plugins to report realistic plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });

      // Override navigator.languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Ensure chrome runtime exists (some detectors check for it)
      if (!(window as any).chrome) {
        (window as any).chrome = {
          runtime: {
            onMessage: { addListener: () => {}, removeListener: () => {} },
            sendMessage: () => {},
            connect: () => {},
          },
        };
      }

      // Override permissions API to report realistic values
      const originalQuery = (window as any).navigator.permissions?.query;
      if (originalQuery) {
        (window as any).navigator.permissions.query = (parameters: any) => {
          if (parameters.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission });
          }
          return originalQuery(parameters);
        };
      }
    });

    // Set extra HTTP headers for stealth
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    });

    // Capture console messages
    this.page.on('console', (msg: any) => {
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
  private findChromePath(): string | undefined {
    const platform = process.platform;

    if (platform === 'win32') {
      return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    } else if (platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    } else {
      // Linux
      return '/usr/bin/google-chrome';
    }
  }

  /**
   * Navigate to a URL with stealth protections active.
   */
  async navigate(url: string, options?: { waitFor?: string }): Promise<NavigationResult> {
    await this.initialize();

    const startTime = Date.now();
    this.consoleMessages = [];

    try {
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
    } catch (error: any) {
      const loadTime = Date.now() - startTime;

      // Try to get whatever loaded before the timeout
      let title = '';
      let text = '';
      try {
        title = await this.page.title();
        text = await this.page.evaluate(() => document.body?.innerText || '');
      } catch {
        // Page may be in a broken state
      }

      return {
        url: this.page.url() || url,
        status: 0,
        title,
        text,
        loadTime,
        consoleMessages: [
          ...this.consoleMessages,
          `[error] Navigation failed: ${error.message}`,
        ],
      };
    }
  }

  /**
   * Scrape content using CSS selector
   */
  async scrape(selector: string): Promise<ScrapeResult> {
    await this.initialize();

    try {
      const $ = (await getCheerio()).load(await this.page.content());
      const elements: ScrapeElement[] = [];

      $(selector).each((_: any, el: any) => {
        const $el = $(el);
        const attributes: Record<string, string> = {};

        const attribs = (el as any).attribs || {};
        for (const [key, value] of Object.entries(attribs)) {
          attributes[key] = String(value);
        }

        elements.push({
          tag: (el as any).tagName || 'unknown',
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
    } catch (error: any) {
      return {
        selector,
        count: 0,
        elements: [],
      };
    }
  }

  /**
   * Click on an element with optional human-like delay
   */
  async click(selector: string, options?: { waitForNavigation?: boolean }): Promise<ClickResult> {
    await this.initialize();

    try {
      // Wait for element to be visible before clicking
      await this.page.waitForSelector(selector, {
        visible: true,
        timeout: this.config.timeout,
      });

      const beforeUrl = this.page.url();

      if (options?.waitForNavigation) {
        await Promise.all([
          this.page.waitForNavigation({ timeout: this.config.timeout }),
          this.page.click(selector),
        ]);
      } else {
        await this.page.click(selector);
      }

      const afterUrl = this.page.url();

      return {
        success: true,
        element: selector,
        newUrl: beforeUrl !== afterUrl ? afterUrl : undefined,
        contentChanged: beforeUrl !== afterUrl,
      };
    } catch (error: any) {
      return {
        success: false,
        element: selector,
        contentChanged: false,
      };
    }
  }

  /**
   * Type text into an input with optional human-like keystroke delay
   */
  async type(
    selector: string,
    text: string,
    options?: { delay?: number; clear?: boolean },
  ): Promise<TypeResult> {
    await this.initialize();

    try {
      // Wait for element to be visible
      await this.page.waitForSelector(selector, {
        visible: true,
        timeout: this.config.timeout,
      });

      if (options?.clear) {
        await this.page.click(selector, { clickCount: 3 }); // Select all
        await this.page.keyboard.press('Backspace');
      }

      // Default to a small human-like delay between keystrokes if none specified
      const delay = options?.delay ?? 50;
      await this.page.type(selector, text, { delay });

      return {
        success: true,
        element: selector,
        text,
      };
    } catch (error: any) {
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
  async screenshot(options?: ScreenshotOptions): Promise<ScreenshotResult> {
    await this.initialize();

    const format = options?.format || 'png';

    const screenshotOptions: any = {
      type: format,
      encoding: 'base64',
      fullPage: options?.fullPage || false,
    };

    if (format === 'jpeg' || format === 'webp') {
      screenshotOptions.quality = options?.quality || 80;
    }

    let data: string;

    if (options?.selector) {
      const element = await this.page.$(options.selector);
      if (!element) {
        throw new Error(`Element not found: ${options.selector}`);
      }
      data = await element.screenshot(screenshotOptions);
    } else {
      data = await this.page.screenshot(screenshotOptions);
    }

    const viewport = this.page.viewport();

    return {
      data,
      format,
      width: viewport?.width || 1920,
      height: viewport?.height || 1080,
      size: Math.ceil((data.length * 3) / 4),
    };
  }

  /**
   * Get page snapshot with accessibility tree
   */
  async getSnapshot(): Promise<PageSnapshot> {
    await this.initialize();

    const [url, title, accessibilityTree] = await Promise.all([
      this.page.url(),
      this.page.title(),
      this.page.evaluate(() => {
        const elements: any[] = [];
        const links: any[] = [];
        const forms: any[] = [];
        const interactable: any[] = [];
        let refCounter = 0;

        function generateRef() {
          return `e${refCounter++}`;
        }

        // Get all interactive elements
        const interactiveElements = document.querySelectorAll(
          'a, button, input, select, textarea, [role="button"], [role="link"], [tabindex]',
        );

        interactiveElements.forEach((el) => {
          const ref = generateRef();
          const rect = el.getBoundingClientRect();
          const visible = rect.width > 0 && rect.height > 0;

          const label =
            (el as HTMLElement).innerText?.slice(0, 100) ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            el.getAttribute('placeholder') ||
            el.getAttribute('name') ||
            '';

          const element: any = {
            ref,
            type: el.tagName.toLowerCase(),
            label: label.trim(),
            role: el.getAttribute('role') || undefined,
            visible,
          };

          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            element.value = (el as HTMLInputElement).value;
          }

          elements.push(element);

          // Track links
          if (el.tagName === 'A') {
            links.push({
              text: label.trim().slice(0, 100),
              href: (el as HTMLAnchorElement).href,
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
          const fields: string[] = [];
          form.querySelectorAll('input, select, textarea').forEach((field) => {
            fields.push(
              field.getAttribute('name') ||
                field.getAttribute('id') ||
                field.tagName.toLowerCase(),
            );
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
  async evaluate<T>(fn: string | (() => T)): Promise<T> {
    await this.initialize();
    return this.page.evaluate(fn);
  }

  /**
   * Wait for selector to appear
   */
  async waitForSelector(selector: string, timeout?: number): Promise<boolean> {
    await this.initialize();
    try {
      await this.page.waitForSelector(selector, {
        timeout: timeout || this.config.timeout,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current URL
   */
  async getCurrentUrl(): Promise<string> {
    await this.initialize();
    return this.page.url();
  }

  /**
   * Go back in history
   */
  async goBack(): Promise<void> {
    await this.initialize();
    await this.page.goBack({ waitUntil: 'networkidle2' });
  }

  /**
   * Go forward in history
   */
  async goForward(): Promise<void> {
    await this.initialize();
    await this.page.goForward({ waitUntil: 'networkidle2' });
  }

  /**
   * Close browser and clean up resources
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
