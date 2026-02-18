/**
 * @fileoverview Singleton browser manager wrapping Playwright.
 *
 * Provides persistent browser context, session storage,
 * auto-screenshot on errors, and page feedback capture.
 */

import type { Browser, BrowserContext, Page } from 'playwright';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrowserConfig {
  headless?: boolean;
  timeout?: number;
  userDataDir?: string;
  proxyServer?: string;
  viewport?: { width: number; height: number };
}

export interface NavigationResult {
  url: string;
  title: string;
  status: number | null;
  loadTimeMs: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  links: LinkInfo[];
  meta: Record<string, string>;
}

export interface InteractiveElement {
  index: number;
  tag: string;
  type?: string;
  role?: string;
  text: string;
  selector: string;
  ariaLabel?: string;
  placeholder?: string;
  isVisible: boolean;
}

export interface FormInfo {
  action: string;
  method: string;
  fields: { name: string; type: string; required: boolean; placeholder?: string }[];
}

export interface LinkInfo {
  text: string;
  href: string;
  isExternal: boolean;
}

export interface PageFeedback {
  toasts: string[];
  formErrors: string[];
  consoleLogs: string[];
  hasErrors: boolean;
}

export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// BrowserService
// ---------------------------------------------------------------------------

export class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: BrowserConfig;
  private consoleLogs: string[] = [];
  private initialized = false;

  constructor(config: BrowserConfig = {}) {
    this.config = {
      headless: true,
      timeout: 30_000,
      viewport: { width: 1280, height: 720 },
      ...config,
    };
  }

  // ── Lifecycle ──

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const { chromium } = await import('playwright');

    if (this.config.userDataDir) {
      this.context = await chromium.launchPersistentContext(this.config.userDataDir, {
        headless: this.config.headless,
        viewport: this.config.viewport,
        proxy: this.config.proxyServer ? { server: this.config.proxyServer } : undefined,
      });
      this.page = this.context.pages()[0] ?? await this.context.newPage();
    } else {
      this.browser = await chromium.launch({
        headless: this.config.headless,
      });
      this.context = await this.browser.newContext({
        viewport: this.config.viewport,
        proxy: this.config.proxyServer ? { server: this.config.proxyServer } : undefined,
      });
      this.page = await this.context.newPage();
    }

    this.page.setDefaultTimeout(this.config.timeout!);

    // Capture console logs for feedback
    this.page.on('console', (msg) => {
      const text = `[${msg.type()}] ${msg.text()}`;
      this.consoleLogs.push(text);
      if (this.consoleLogs.length > 100) this.consoleLogs.shift();
    });

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
    this.consoleLogs = [];
    this.initialized = false;
  }

  get isRunning(): boolean {
    return this.initialized && this.page !== null;
  }

  // ── Navigation ──

  async navigate(url: string): Promise<NavigationResult> {
    const page = await this.ensurePage();
    const start = Date.now();

    const response = await page.goto(url, { waitUntil: 'domcontentloaded' });

    return {
      url: page.url(),
      title: await page.title(),
      status: response?.status() ?? null,
      loadTimeMs: Date.now() - start,
    };
  }

  // ── Interaction ──

  async click(options: { selector?: string; text?: string; role?: string }): Promise<boolean> {
    const page = await this.ensurePage();

    if (options.selector) {
      await page.click(options.selector);
      return true;
    }
    if (options.role) {
      await page.getByRole(options.role as any, { name: options.text }).click();
      return true;
    }
    if (options.text) {
      await page.getByText(options.text, { exact: false }).first().click();
      return true;
    }

    return false;
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = await this.ensurePage();
    await page.fill(selector, value);
  }

  async scroll(options: { direction?: 'up' | 'down'; selector?: string; pixels?: number }): Promise<void> {
    const page = await this.ensurePage();

    if (options.selector) {
      await page.locator(options.selector).scrollIntoViewIfNeeded();
      return;
    }

    const delta = options.pixels ?? 500;
    const y = options.direction === 'up' ? -delta : delta;
    await page.mouse.wheel(0, y);
  }

  // ── Content Extraction ──

  async extract(selector: string, mode: 'text' | 'html' | 'attribute' = 'text', attribute?: string): Promise<string> {
    const page = await this.ensurePage();
    const locator = page.locator(selector);

    switch (mode) {
      case 'html':
        return await locator.innerHTML();
      case 'attribute':
        return await locator.getAttribute(attribute ?? 'value') ?? '';
      default:
        return await locator.innerText();
    }
  }

  // ── Screenshot ──

  async screenshot(options?: { selector?: string; fullPage?: boolean }): Promise<Buffer> {
    const page = await this.ensurePage();

    if (options?.selector) {
      return await page.locator(options.selector).screenshot();
    }

    return await page.screenshot({ fullPage: options?.fullPage ?? false });
  }

  // ── Wait ──

  async wait(options: { selector?: string; timeout?: number; state?: 'visible' | 'hidden' | 'attached' | 'detached' }): Promise<void> {
    const page = await this.ensurePage();

    if (options.selector) {
      await page.waitForSelector(options.selector, {
        timeout: options.timeout ?? this.config.timeout,
        state: options.state ?? 'visible',
      });
    } else {
      await page.waitForTimeout(options.timeout ?? 1000);
    }
  }

  // ── Page Snapshot (interactive elements inventory) ──

  async snapshot(): Promise<PageSnapshot> {
    const page = await this.ensurePage();

    const interactiveElements = await page.evaluate(() => {
      const selectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex]';
      const elements = document.querySelectorAll(selectors);
      const result: any[] = [];

      elements.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
        const tag = el.tagName.toLowerCase();

        result.push({
          index: i,
          tag,
          type: (el as HTMLInputElement).type || undefined,
          role: el.getAttribute('role') || undefined,
          text: (el.textContent || '').trim().slice(0, 100),
          selector: buildSelector(el),
          ariaLabel: el.getAttribute('aria-label') || undefined,
          placeholder: el.getAttribute('placeholder') || undefined,
          isVisible,
        });
      });

      function buildSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).join('.');
        const nth = Array.from(el.parentElement?.children ?? []).indexOf(el);
        return classes ? `${tag}.${classes}` : `${tag}:nth-child(${nth + 1})`;
      }

      return result;
    });

    const forms = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('form')).map((form) => ({
        action: form.action,
        method: form.method,
        fields: Array.from(form.elements)
          .filter((el): el is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
            ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))
          .map((el) => ({
            name: el.name || el.id,
            type: (el as HTMLInputElement).type || el.tagName.toLowerCase(),
            required: el.required,
            placeholder: el.getAttribute('placeholder') || undefined,
          })),
      }));
    });

    const links = await page.evaluate(() => {
      const currentOrigin = window.location.origin;
      return Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map((a) => ({
        text: (a.textContent || '').trim().slice(0, 80),
        href: (a as HTMLAnchorElement).href,
        isExternal: !(a as HTMLAnchorElement).href.startsWith(currentOrigin),
      }));
    });

    const meta = await page.evaluate(() => {
      const result: Record<string, string> = {};
      document.querySelectorAll('meta[name], meta[property]').forEach((m) => {
        const key = m.getAttribute('name') || m.getAttribute('property') || '';
        const val = m.getAttribute('content') || '';
        if (key && val) result[key] = val.slice(0, 200);
      });
      return result;
    });

    return {
      url: page.url(),
      title: await page.title(),
      interactiveElements,
      forms,
      links,
      meta,
    };
  }

  // ── JavaScript Evaluation ──

  async evaluate(script: string): Promise<unknown> {
    const page = await this.ensurePage();
    return await page.evaluate(script);
  }

  // ── Session Management ──

  async saveSession(): Promise<StorageState> {
    if (!this.context) throw new Error('Browser not initialized');
    return await this.context.storageState() as StorageState;
  }

  async restoreSession(state: StorageState): Promise<void> {
    if (!this.context) throw new Error('Browser not initialized');

    // Add cookies
    if (state.cookies?.length) {
      await this.context.addCookies(state.cookies);
    }

    // Restore localStorage per origin
    if (state.origins?.length) {
      for (const origin of state.origins) {
        const page = await this.ensurePage();
        await page.goto(origin.origin, { waitUntil: 'commit' });
        for (const item of origin.localStorage) {
          await page.evaluate(([k, v]) => localStorage.setItem(k, v), [item.name, item.value]);
        }
      }
    }
  }

  // ── Feedback ──

  async captureFeedback(): Promise<PageFeedback> {
    const page = await this.ensurePage();

    const toasts = await page.evaluate(() => {
      const selectors = [
        '[role="alert"]', '[class*="toast"]', '[class*="notification"]',
        '[class*="snackbar"]', '[class*="flash"]',
      ];
      return selectors.flatMap((s) =>
        Array.from(document.querySelectorAll(s)).map((el) => (el.textContent || '').trim())
      ).filter(Boolean);
    });

    const formErrors = await page.evaluate(() => {
      const selectors = [
        '[class*="error"]', '[class*="invalid"]', '[aria-invalid="true"]',
        '.field-error', '.form-error', '.validation-error',
      ];
      return selectors.flatMap((s) =>
        Array.from(document.querySelectorAll(s)).map((el) => (el.textContent || '').trim())
      ).filter(Boolean);
    });

    const recentLogs = this.consoleLogs.slice(-20);
    const hasErrors = toasts.length > 0 || formErrors.length > 0 ||
      recentLogs.some((l) => l.startsWith('[error]'));

    return { toasts, formErrors, consoleLogs: recentLogs, hasErrors };
  }

  // ── Proxy ──

  async setProxy(server: string): Promise<void> {
    // Proxy can only be set at context creation, so we need to restart
    this.config.proxyServer = server;
    await this.shutdown();
    await this.initialize();
  }

  // ── Internal ──

  private async ensurePage(): Promise<Page> {
    if (!this.initialized) await this.initialize();
    if (!this.page) throw new Error('Browser page not available');
    return this.page;
  }

  getPage(): Page | null {
    return this.page;
  }
}
