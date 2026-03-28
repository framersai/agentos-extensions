/**
 * WebScraperService — Core scraping engine with 4-tier progressive fallback.
 *
 * The service automatically escalates through increasingly sophisticated
 * (and expensive) fetching strategies until it retrieves usable content:
 *
 *   Tier 1 → Plain `fetch()` with randomized UA and browser headers
 *   Tier 2 → Headless Playwright (dynamic import, graceful fallback)
 *   Tier 3 → Playwright with anti-detection (viewport jitter, webdriver
 *            override, human-like scrolling/delays)
 *   Tier 4 → Raw text fetch with `_llmExtractionRequired` flag — the
 *            agent runtime handles structured extraction via LLM
 *
 * Additional features:
 * - Per-domain rate limiting with random jitter (500ms–2s)
 * - Domain-tier cache (remembers which tier works for each domain)
 * - Round-robin proxy rotation
 * - CSS-like field extraction via regex (no DOM parser dependency)
 * - Script/style/nav/footer stripping for clean text output
 *
 * @module WebScraperService
 */

import type {
  ScrapeInput,
  ScrapeResult,
  ScrapeOptions,
  ScrapeTier,
  ExtractConfig,
} from './types.js';
import { randomUserAgent, browserHeaders } from './UserAgentPool.js';

/* -------------------------------------------------------------------------- */
/*  Internal types                                                            */
/* -------------------------------------------------------------------------- */

/** Tracks the last request timestamp per domain for rate limiting. */
interface DomainTimestamp {
  /** Unix ms of the last request to this domain. */
  lastRequestMs: number;
}

/** Cached tier that last succeeded for a domain. */
interface DomainTierEntry {
  tier: ScrapeTier;
  /** Unix ms when the entry was created / refreshed. */
  updatedMs: number;
}

/** Constructor options for {@link WebScraperService}. */
export interface WebScraperServiceOptions {
  /** Minimum inter-request delay in milliseconds (default 500). */
  minDelayMs?: number;
  /** Maximum inter-request delay in milliseconds (default 2000). */
  maxDelayMs?: number;
  /** Single proxy URL used for all requests (overridden per-request). */
  proxyUrl?: string;
  /** Comma-separated or array of proxy URLs for round-robin rotation. */
  proxyList?: string | string[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

/** How long a domain-tier cache entry stays valid (30 minutes). */
const TIER_CACHE_TTL_MS = 30 * 60 * 1_000;

/** Maximum entries in the domain-tier LRU cache. */
const TIER_CACHE_MAX = 500;

/** Default per-request timeout. */
const DEFAULT_TIMEOUT_MS = 30_000;

/* -------------------------------------------------------------------------- */
/*  WebScraperService                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Progressive web scraper with 4-tier fallback chain, per-domain rate
 * limiting, proxy rotation, and regex-based field extraction.
 *
 * @example
 * ```ts
 * const scraper = new WebScraperService({ minDelayMs: 600 });
 * const result = await scraper.scrape({
 *   url: 'https://example.com/article',
 *   extract: { fields: { title: 'h1', body: '.article-body' } },
 * });
 * if (result.success) console.log(result.data);
 * ```
 */
export class WebScraperService {
  /* ---------------------------------------------------------------------- */
  /*  Instance state                                                        */
  /* ---------------------------------------------------------------------- */

  /** Minimum jitter delay between requests to the same domain. */
  private readonly minDelayMs: number;

  /** Maximum jitter delay between requests to the same domain. */
  private readonly maxDelayMs: number;

  /** Resolved list of proxy URLs for rotation. */
  private readonly proxies: string[];

  /** Round-robin index into {@link proxies}. */
  private proxyIndex = 0;

  /** Per-domain rate-limit tracker. */
  private readonly domainTimestamps = new Map<string, DomainTimestamp>();

  /**
   * Domain-tier cache — remembers which tier last succeeded so subsequent
   * requests to the same domain can skip lower tiers.  Evicts entries
   * older than {@link TIER_CACHE_TTL_MS} and caps at
   * {@link TIER_CACHE_MAX} entries (LRU via insertion order).
   */
  private readonly domainTierCache = new Map<string, DomainTierEntry>();

  /* ---------------------------------------------------------------------- */
  /*  Constructor                                                           */
  /* ---------------------------------------------------------------------- */

  /**
   * @param opts - Service-level configuration. All fields optional.
   */
  constructor(opts?: WebScraperServiceOptions) {
    this.minDelayMs = opts?.minDelayMs ?? 500;
    this.maxDelayMs = opts?.maxDelayMs ?? 2_000;

    // Normalise proxy list
    if (opts?.proxyList) {
      this.proxies = Array.isArray(opts.proxyList)
        ? opts.proxyList
        : opts.proxyList.split(',').map((p) => p.trim()).filter(Boolean);
    } else if (opts?.proxyUrl) {
      this.proxies = [opts.proxyUrl];
    } else {
      this.proxies = [];
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Public API                                                            */
  /* ---------------------------------------------------------------------- */

  /**
   * Scrape a URL using the 4-tier progressive fallback chain.
   *
   * The method starts at the configured (or cached) tier and escalates
   * on failure up to `options.maxTier`.
   *
   * @param input - Scrape request payload.
   * @returns A {@link ScrapeResult} indicating success or failure.
   */
  async scrape(input: ScrapeInput): Promise<ScrapeResult> {
    const { url, extract, options } = input;
    const domain = this.extractDomain(url);

    // Determine starting / max tier
    const jsRequired = options?.javascript === true;
    const requestedStart: ScrapeTier = options?.tier
      ?? (jsRequired ? 2 : 1) as ScrapeTier;
    const cachedTier = this.getCachedTier(domain);
    // Start at the higher of requested tier and cached tier
    let startTier: ScrapeTier = cachedTier
      ? (Math.max(requestedStart, cachedTier) as ScrapeTier)
      : requestedStart;
    const maxTier: ScrapeTier = options?.maxTier ?? 4;

    // Ensure startTier does not exceed maxTier
    if (startTier > maxTier) startTier = maxTier;

    // Rate limit — wait for jitter delay
    await this.rateLimit(domain);

    // Resolve proxy for this request
    const proxy = options?.proxy ?? this.nextProxy();

    // Walk the tiers
    let lastError = '';
    for (let tier = startTier; tier <= maxTier; tier++) {
      try {
        const result = await this.executeTier(
          tier as ScrapeTier,
          url,
          extract,
          { ...options, proxy },
        );

        if (result.success) {
          // Cache successful tier for future requests to this domain
          this.setCachedTier(domain, tier as ScrapeTier);
          return result;
        }

        // Non-success but no throw — record error and try next tier
        lastError = result.error ?? `Tier ${tier} returned unsuccessful result`;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // All tiers exhausted
    return {
      success: false,
      url,
      tier: 0,
      statusCode: 0,
      error: `All tiers (${startTier}–${maxTier}) failed for ${url}: ${lastError}`,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Extraction utilities (public for direct use)                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Extract structured data from raw HTML using an {@link ExtractConfig}.
   *
   * Supports two modes:
   * 1. **fields** — extract one value per named field.
   * 2. **list + listFields** — extract a repeating set of records.
   *
   * Uses a simplified regex-based micro-selector engine. See
   * {@link ExtractConfig} for the supported selector syntax.
   *
   * @param html   - Raw HTML string.
   * @param config - Extraction configuration.
   * @returns An object with `data` and/or `items` depending on config.
   */
  extractFromHtml(
    html: string,
    config: ExtractConfig,
  ): { data?: Record<string, string>; items?: Record<string, string>[] } {
    const result: { data?: Record<string, string>; items?: Record<string, string>[] } = {};

    // Single-record extraction
    if (config.fields) {
      const data: Record<string, string> = {};
      for (const [fieldName, selector] of Object.entries(config.fields)) {
        data[fieldName] = this.extractSelector(html, selector);
      }
      result.data = data;
    }

    // List extraction
    if (config.list && config.listFields) {
      const containers = this.extractListContainers(html, config.list);
      const items: Record<string, string>[] = [];

      for (const containerHtml of containers) {
        const item: Record<string, string> = {};
        for (const [fieldName, selector] of Object.entries(config.listFields)) {
          item[fieldName] = this.extractSelector(containerHtml, selector);
        }
        items.push(item);
      }
      result.items = items;
    }

    return result;
  }

  /**
   * Convert raw HTML to visible plain text by stripping scripts, styles,
   * navigation, footers, HTML tags, and collapsing whitespace.
   *
   * Useful for producing LLM-friendly content from arbitrary pages.
   *
   * @param html - Raw HTML string.
   * @returns Clean plain text.
   */
  htmlToText(html: string): string {
    let text = html;

    // Remove script, style, nav, footer, header blocks entirely
    text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
    text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
    text = text.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ');
    text = text.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ');
    text = text.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, ' ');
    // Remove HTML comments
    text = text.replace(/<!--[\s\S]*?-->/g, ' ');
    // Replace block-level tags with newlines
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article)\b[^>]*\/?>/gi, '\n');
    // Strip remaining tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
    // Collapse whitespace
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n[ \t]+/g, '\n');
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }

  /* ---------------------------------------------------------------------- */
  /*  Tier executors                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Dispatch to the appropriate tier handler.
   */
  private async executeTier(
    tier: ScrapeTier,
    url: string,
    extract: ExtractConfig | undefined,
    options: ScrapeOptions | undefined,
  ): Promise<ScrapeResult> {
    switch (tier) {
      case 1: return this.tier1Fetch(url, extract, options);
      case 2: return this.tier2Playwright(url, extract, options);
      case 3: return this.tier3StealthPlaywright(url, extract, options);
      case 4: return this.tier4LlmFallback(url, extract, options);
      default:
        return { success: false, url, tier: 0, statusCode: 0, error: `Unknown tier: ${tier}` };
    }
  }

  /**
   * **Tier 1** — Simple `fetch()` with randomized UA and browser headers.
   *
   * Suitable for most static pages and APIs.  Cheapest tier with zero
   * external dependencies.
   */
  private async tier1Fetch(
    url: string,
    extract: ExtractConfig | undefined,
    options: ScrapeOptions | undefined,
  ): Promise<ScrapeResult> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const ua = randomUserAgent();
    const headers = {
      ...browserHeaders(ua),
      ...(options?.headers ?? {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });

      const statusCode = response.status;

      if (!response.ok) {
        return {
          success: false,
          url,
          tier: 1,
          statusCode,
          error: `HTTP ${statusCode} ${response.statusText}`,
        };
      }

      const html = await response.text();
      return this.buildResult(url, 1, statusCode, html, extract);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, url, tier: 1, statusCode: 0, error: `Tier 1 fetch failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * **Tier 2** — Headless Playwright for JavaScript-rendered pages.
   *
   * Dynamically imports `playwright-core` so the package is fully
   * optional — if it is not installed the tier returns a graceful failure
   * and the service escalates to tier 3 or 4.
   */
  private async tier2Playwright(
    url: string,
    extract: ExtractConfig | undefined,
    options: ScrapeOptions | undefined,
  ): Promise<ScrapeResult> {
    let pw: typeof import('playwright-core');
    try {
      // Dynamic import — playwright-core is an optional peer dependency
      pw = await import('playwright-core');
    } catch {
      return {
        success: false,
        url,
        tier: 2,
        statusCode: 0,
        error: 'playwright-core is not installed — skipping tier 2',
      };
    }

    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const launchOpts: Record<string, unknown> = { headless: true };

    // Proxy support
    const proxy = options?.proxy;
    if (proxy) {
      launchOpts.proxy = { server: proxy };
    }

    let browser: import('playwright-core').Browser | null = null;
    try {
      browser = await pw.chromium.launch(launchOpts);
      const page = await browser.newPage();

      // Set browser-like headers
      const ua = randomUserAgent();
      await page.setExtraHTTPHeaders({
        ...browserHeaders(ua),
        ...(options?.headers ?? {}),
      });

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // Wait for a specific selector if requested
      if (options?.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout });
      }

      const statusCode = response?.status() ?? 0;
      const html = await page.content();

      // Cloudflare serves challenge pages with HTTP 200 inside browsers —
      // detect and treat as failure so the scraper escalates to a higher tier.
      if (this.isCloudflareChallenge(html)) {
        return { success: false, url, tier: 2, statusCode: 200, error: 'Cloudflare challenge detected — escalating' };
      }

      return this.buildResult(url, 2, statusCode, html, extract);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, url, tier: 2, statusCode: 0, error: `Tier 2 Playwright failed: ${msg}` };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * **Tier 3** — Playwright with anti-detection measures.
   *
   * Applies evasion techniques to reduce bot fingerprinting:
   * - Randomised viewport dimensions
   * - `navigator.webdriver` override to `false`
   * - Human-like scroll simulation
   * - Random inter-action delays
   */
  private async tier3StealthPlaywright(
    url: string,
    extract: ExtractConfig | undefined,
    options: ScrapeOptions | undefined,
  ): Promise<ScrapeResult> {
    let pw: typeof import('playwright-core');
    try {
      pw = await import('playwright-core');
    } catch {
      return {
        success: false,
        url,
        tier: 3,
        statusCode: 0,
        error: 'playwright-core is not installed — skipping tier 3',
      };
    }

    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;

    // Randomised viewport to avoid fingerprint clustering
    const viewportWidth = 1280 + Math.floor(Math.random() * 640);   // 1280–1920
    const viewportHeight = 720 + Math.floor(Math.random() * 360);   // 720–1080

    const launchOpts: Record<string, unknown> = {
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        `--window-size=${viewportWidth},${viewportHeight}`,
      ],
    };

    const proxy = options?.proxy;
    if (proxy) {
      launchOpts.proxy = { server: proxy };
    }

    let browser: import('playwright-core').Browser | null = null;
    try {
      browser = await pw.chromium.launch(launchOpts);

      const context = await browser.newContext({
        viewport: { width: viewportWidth, height: viewportHeight },
        userAgent: randomUserAgent(),
        locale: 'en-US',
        timezoneId: 'America/New_York',
      });

      const page = await context.newPage();

      // Override navigator.webdriver to false (anti-detection).
      // The callback runs inside the browser context (Playwright's
      // isolated world), so we access browser globals via globalThis.
      await page.addInitScript(() => {
        const g = globalThis as any;
        Object.defineProperty(g.navigator, 'webdriver', { get: () => false });
        // Overwrite chrome.runtime to mimic real Chrome
        g.chrome = { runtime: {} };
      });

      // Set custom headers
      if (options?.headers) {
        await page.setExtraHTTPHeaders(options.headers);
      }

      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // Human-like delay before interaction
      await this.humanDelay(300, 800);

      // Simulate scrolling to trigger lazy-loaded content
      await this.simulateScroll(page);

      // Wait for specific selector if requested
      if (options?.waitFor) {
        await page.waitForSelector(options.waitFor, { timeout });
      }

      // Additional settle time for dynamic content
      await this.humanDelay(200, 500);

      const statusCode = response?.status() ?? 0;
      const html = await page.content();

      // Even with stealth measures, Cloudflare may still serve a challenge.
      // Detect and fail so the scraper can escalate to Tier 4.
      if (this.isCloudflareChallenge(html)) {
        return { success: false, url, tier: 3, statusCode: 200, error: 'Cloudflare challenge detected — escalating' };
      }

      return this.buildResult(url, 3, statusCode, html, extract);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, url, tier: 3, statusCode: 0, error: `Tier 3 stealth failed: ${msg}` };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * **Tier 4** — Raw text fallback with LLM extraction flag.
   *
   * Makes a simple fetch, strips HTML to plain text, and sets
   * `_llmExtractionRequired: true` so the calling agent can apply
   * LLM-based extraction using the original {@link ExtractConfig}.
   */
  private async tier4LlmFallback(
    url: string,
    extract: ExtractConfig | undefined,
    options: ScrapeOptions | undefined,
  ): Promise<ScrapeResult> {
    const timeout = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const ua = randomUserAgent();
    const headers = {
      ...browserHeaders(ua),
      ...(options?.headers ?? {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
        redirect: 'follow',
      });

      const statusCode = response.status;
      const rawHtml = await response.text();
      const text = this.htmlToText(rawHtml);

      // Guard against Cloudflare challenge pages or trivially small content
      // that an LLM cannot meaningfully extract from.
      if (!text || text.length < 200 || this.isCloudflareChallenge(rawHtml)) {
        return { success: false, url, tier: 4, statusCode, error: 'Insufficient content for LLM extraction' };
      }

      // If there is an extraction config, signal that LLM extraction is needed
      if (extract) {
        return {
          success: true,
          url,
          tier: 4,
          statusCode,
          text,
          _llmExtractionRequired: true,
        };
      }

      // No extraction config — just return the cleaned text
      return {
        success: true,
        url,
        tier: 4,
        statusCode,
        text,
        html: rawHtml,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, url, tier: 4, statusCode: 0, error: `Tier 4 fetch failed: ${msg}` };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------------------------------------------------------------------- */
  /*  Result builder                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Build a standardized {@link ScrapeResult} from raw HTML, applying
   * extraction if an {@link ExtractConfig} is provided.
   */
  private buildResult(
    url: string,
    tier: ScrapeTier,
    statusCode: number,
    html: string,
    extract?: ExtractConfig,
  ): ScrapeResult {
    if (extract) {
      const { data, items } = this.extractFromHtml(html, extract);
      return { success: true, url, tier, statusCode, data, items };
    }

    const text = this.htmlToText(html);
    return { success: true, url, tier, statusCode, html, text };
  }

  /* ---------------------------------------------------------------------- */
  /*  Regex-based extraction engine                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Extract a single value from HTML using the micro-selector syntax.
   *
   * Supported selectors:
   * - `tag` — match first `<tag>...</tag>`
   * - `.class` — first element with `class="...class..."`
   * - `#id` — element with `id="id"`
   * - `tag.class` — `<tag class="...class...">`
   * - `selector @attr` — extract attribute value instead of text content
   *
   * @param html     - HTML to search within.
   * @param selector - Micro-selector string.
   * @returns Extracted text (or attribute value), or empty string if no match.
   */
  private extractSelector(html: string, selector: string): string {
    // Split off optional @attr suffix
    const attrMatch = selector.match(/^(.+?)\s+@(\w+)$/);
    const baseSelector = attrMatch ? attrMatch[1]! : selector;
    const attrName = attrMatch ? attrMatch[2] : null;

    // When extracting an attribute, use a simpler regex that matches just
    // the opening tag (handles self-closing elements like <img>, <input>).
    if (attrName) {
      const tagRegex = this.selectorToOpeningTagRegex(baseSelector);
      if (!tagRegex) return '';
      const tagMatch = html.match(tagRegex);
      if (!tagMatch) return '';
      const attrRegex = new RegExp(`${this.escapeRegex(attrName)}\\s*=\\s*["']([^"']*)["']`, 'i');
      const attrVal = tagMatch[0].match(attrRegex);
      return attrVal ? attrVal[1]!.trim() : '';
    }

    // Build a regex that matches the full element (opening + content + closing)
    const elementRegex = this.selectorToRegex(baseSelector);
    if (!elementRegex) return '';

    const match = html.match(elementRegex);
    if (!match) return '';

    // Return the inner text content (tag-stripped).
    // For #id and .class selectors the regex has two capture groups
    // (group 1 = tag name for backreference, group 2 = inner HTML),
    // while tag.class and plain tag selectors put content in group 1.
    // We prefer group 2 when present, falling back to group 1.
    const innerHtml = match[2] ?? match[1] ?? match[0] ?? '';
    return innerHtml.replace(/<[^>]+>/g, '').trim();
  }

  /**
   * Convert a micro-selector into a regex that captures the element's
   * inner HTML in group 1.
   *
   * @param selector - Base selector (without `@attr` suffix).
   * @returns A RegExp or `null` if the selector is not recognised.
   */
  private selectorToRegex(selector: string): RegExp | null {
    // #id
    if (selector.startsWith('#')) {
      const id = this.escapeRegex(selector.slice(1));
      return new RegExp(`<(\\w+)[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, 'i');
    }

    // .class (standalone, no tag prefix)
    if (selector.startsWith('.')) {
      const cls = this.escapeRegex(selector.slice(1));
      return new RegExp(
        `<(\\w+)[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
        'i',
      );
    }

    // tag.class
    const tagClassMatch = selector.match(/^(\w+)\.(.+)$/);
    if (tagClassMatch) {
      const tag = this.escapeRegex(tagClassMatch[1]!);
      const cls = this.escapeRegex(tagClassMatch[2]!);
      return new RegExp(
        `<${tag}[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/${tag}>`,
        'i',
      );
    }

    // Plain tag name
    if (/^\w+$/.test(selector)) {
      const tag = this.escapeRegex(selector);
      return new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    }

    return null;
  }

  /**
   * Convert a micro-selector into a regex that matches just the opening tag
   * (including attributes). Handles self-closing elements like `<img>`, `<input>`.
   *
   * @param selector - Base selector (without `@attr` suffix).
   * @returns A RegExp matching the opening tag, or `null` if unrecognised.
   */
  private selectorToOpeningTagRegex(selector: string): RegExp | null {
    if (selector.startsWith('#')) {
      const id = this.escapeRegex(selector.slice(1));
      return new RegExp(`<\\w+[^>]*\\bid\\s*=\\s*["']${id}["'][^>]*/?>`, 'i');
    }
    if (selector.startsWith('.')) {
      const cls = this.escapeRegex(selector.slice(1));
      return new RegExp(`<\\w+[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*/?>`, 'i');
    }
    const tagClassMatch = selector.match(/^(\w+)\.(.+)$/);
    if (tagClassMatch) {
      const tag = this.escapeRegex(tagClassMatch[1]!);
      const cls = this.escapeRegex(tagClassMatch[2]!);
      return new RegExp(`<${tag}[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${cls}\\b[^"']*["'][^>]*/?>`, 'i');
    }
    if (/^\w+$/.test(selector)) {
      const tag = this.escapeRegex(selector);
      return new RegExp(`<${tag}\\b[^>]*/?>`, 'i');
    }
    return null;
  }

  /**
   * Extract all container blocks matching a list selector, returning
   * each container's full inner HTML for per-item field extraction.
   *
   * @param html     - Full page HTML.
   * @param selector - Selector for the repeating container element.
   * @returns Array of HTML strings, one per container match.
   */
  private extractListContainers(html: string, selector: string): string[] {
    const regex = this.selectorToRegex(selector);
    if (!regex) return [];

    // Make it global so we can find all matches
    const globalRegex = new RegExp(regex.source, 'gi');
    const containers: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = globalRegex.exec(html)) !== null) {
      // Push the full match so per-item selectors can find attributes
      containers.push(m[0]!);
    }

    return containers;
  }

  /* ---------------------------------------------------------------------- */
  /*  Rate limiting                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Enforce per-domain rate limiting with randomised jitter.
   *
   * If a request to the same domain was made within the jitter window,
   * this method sleeps for the remaining time.
   *
   * @param domain - The domain being requested.
   */
  private async rateLimit(domain: string): Promise<void> {
    const now = Date.now();
    const entry = this.domainTimestamps.get(domain);

    if (entry) {
      const jitter = this.minDelayMs + Math.random() * (this.maxDelayMs - this.minDelayMs);
      const elapsed = now - entry.lastRequestMs;

      if (elapsed < jitter) {
        const sleepMs = jitter - elapsed;
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
      }
    }

    // Record this request's timestamp
    this.domainTimestamps.set(domain, { lastRequestMs: Date.now() });
  }

  /* ---------------------------------------------------------------------- */
  /*  Proxy rotation                                                        */
  /* ---------------------------------------------------------------------- */

  /**
   * Get the next proxy URL from the rotation pool.
   * Returns `undefined` if no proxies are configured.
   */
  private nextProxy(): string | undefined {
    if (this.proxies.length === 0) return undefined;
    const proxy = this.proxies[this.proxyIndex % this.proxies.length];
    this.proxyIndex++;
    return proxy;
  }

  /* ---------------------------------------------------------------------- */
  /*  Domain-tier cache                                                     */
  /* ---------------------------------------------------------------------- */

  /**
   * Look up the cached tier for a domain, returning `null` if the
   * entry is missing or expired.
   */
  private getCachedTier(domain: string): ScrapeTier | null {
    const entry = this.domainTierCache.get(domain);
    if (!entry) return null;

    // Expire stale entries
    if (Date.now() - entry.updatedMs > TIER_CACHE_TTL_MS) {
      this.domainTierCache.delete(domain);
      return null;
    }

    return entry.tier;
  }

  /**
   * Cache the successful tier for a domain.  Performs LRU eviction
   * when the cache exceeds {@link TIER_CACHE_MAX} entries.
   */
  private setCachedTier(domain: string, tier: ScrapeTier): void {
    // LRU eviction — delete the oldest entry if at capacity
    if (this.domainTierCache.size >= TIER_CACHE_MAX && !this.domainTierCache.has(domain)) {
      const oldest = this.domainTierCache.keys().next().value;
      if (oldest !== undefined) {
        this.domainTierCache.delete(oldest as string);
      }
    }

    // Delete and re-insert to maintain insertion order (LRU)
    this.domainTierCache.delete(domain);
    this.domainTierCache.set(domain, { tier, updatedMs: Date.now() });
  }

  /* ---------------------------------------------------------------------- */
  /*  Helpers                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * Extract the hostname (domain) from a URL for rate-limiting and caching.
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      // Fallback: strip protocol and path manually
      return url.replace(/^https?:\/\//, '').split('/')[0] ?? url;
    }
  }

  /**
   * Sleep for a random duration between `min` and `max` milliseconds
   * to simulate human-like pauses.
   */
  private async humanDelay(min: number, max: number): Promise<void> {
    const ms = min + Math.random() * (max - min);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Simulate human-like scrolling on a Playwright page to trigger
   * lazy-loaded content and reduce bot-detection signals.
   */
  private async simulateScroll(page: import('playwright-core').Page): Promise<void> {
    const scrollSteps = 2 + Math.floor(Math.random() * 3); // 2–4 scrolls

    for (let i = 0; i < scrollSteps; i++) {
      const distance = 200 + Math.floor(Math.random() * 400); // 200–600px
      await page.evaluate((d: number) => (globalThis as any).scrollBy(0, d), distance);
      await this.humanDelay(150, 400);
    }
  }

  /**
   * Escape special regex characters in a string so it can be safely
   * embedded in a `new RegExp()` pattern.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Detect whether HTML content is a Cloudflare challenge page rather
   * than genuine site content.
   *
   * Cloudflare serves challenge/interstitial pages with HTTP 200 inside
   * browsers, which causes headless tiers to return `success: true` with
   * useless content.  This method checks for known Cloudflare signatures
   * in the HTML to prevent false-positive results.
   *
   * @param html - Raw HTML string to inspect.
   * @returns `true` if the HTML matches one or more Cloudflare challenge signatures.
   */
  private isCloudflareChallenge(html: string): boolean {
    const signatures = [
      'Just a moment...',
      'cf-browser-verification',
      'cf_chl_opt',
      'challenge-platform',
      '_cf_chl_',
      'Checking if the site connection is secure',
      'Enable JavaScript and cookies to continue',
    ];
    return signatures.some((sig) => html.includes(sig));
  }
}
