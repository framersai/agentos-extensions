/**
 * Web Scrape Tool — ITool implementation for single-URL scraping.
 *
 * Exposes the {@link WebScraperService}'s 4-tier progressive fallback engine
 * as a tool callable by any AgentOS GMI.  Supports optional CSS-like field
 * extraction and per-request scrape options (tier, proxy, timeout, etc.).
 *
 * @module tools/webScrape
 */

import type {
  ITool,
  ToolExecutionContext,
  ToolExecutionResult,
  JSONSchemaObject,
} from '@framers/agentos';

import type { ScrapeInput, ScrapeResult } from '../types.js';
import type { WebScraperService } from '../WebScraperService.js';

/* -------------------------------------------------------------------------- */
/*  WebScrapeTool                                                              */
/* -------------------------------------------------------------------------- */

/**
 * ITool implementation that scrapes a single URL and optionally extracts
 * structured data using CSS-like selectors.
 *
 * Delegates all fetching to a shared {@link WebScraperService} instance,
 * inheriting its rate limiting, proxy rotation, domain-tier caching, and
 * 4-tier progressive fallback behaviour.
 *
 * @example
 * ```ts
 * const tool = new WebScrapeTool(scraperService);
 * const result = await tool.execute(
 *   { url: 'https://example.com', extract: { fields: { title: 'h1' } } },
 *   context,
 * );
 * ```
 */
export class WebScrapeTool implements ITool<ScrapeInput, ScrapeResult> {
  readonly id = 'web-scrape-v1';
  readonly name = 'web_scrape';
  readonly displayName = 'Web Scrape';
  readonly description =
    'Scrape a web page and optionally extract structured data using CSS-like ' +
    'selectors.  Supports a 4-tier progressive fallback chain: plain fetch, ' +
    'headless Playwright, stealth Playwright, and LLM-assisted extraction.  ' +
    'Use the `extract` parameter to specify fields to pull from the page, ' +
    'or omit it to receive the raw HTML and cleaned plain text.';
  readonly category = 'research';
  readonly version = '1.0.0';
  readonly hasSideEffects = false;

  readonly inputSchema: JSONSchemaObject = {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Fully qualified URL to scrape (must start with http:// or https://).',
      },
      extract: {
        type: 'object',
        description:
          'Optional extraction configuration.  Use `fields` for single-record ' +
          'extraction, or `list` + `listFields` for repeating-item extraction.',
        properties: {
          fields: {
            type: 'object',
            description:
              'Map of output field name to CSS-like selector.  ' +
              'Append ` @attr` to extract an attribute value instead of text content.',
            additionalProperties: { type: 'string' },
          },
          list: {
            type: 'string',
            description: 'Selector for the repeating container element in a list view.',
          },
          listFields: {
            type: 'object',
            description:
              'Per-item field selectors, relative to each `list` container match.',
            additionalProperties: { type: 'string' },
          },
        },
      },
      options: {
        type: 'object',
        description: 'Optional per-request scrape settings.',
        properties: {
          tier: {
            type: 'integer',
            minimum: 1,
            maximum: 4,
            description: 'Starting scrape tier (1=fetch, 2=Playwright, 3=stealth, 4=LLM fallback).',
          },
          maxTier: {
            type: 'integer',
            minimum: 1,
            maximum: 4,
            description: 'Highest tier the service may escalate to (default 4).',
          },
          proxy: {
            type: 'string',
            description: 'HTTP/SOCKS5 proxy URL for this request.',
          },
          headers: {
            type: 'object',
            description: 'Extra HTTP headers to include.',
            additionalProperties: { type: 'string' },
          },
          waitFor: {
            type: 'string',
            description: 'CSS selector to wait for before extraction (tier 2+ only).',
          },
          timeout: {
            type: 'integer',
            minimum: 1000,
            description: 'Per-request timeout in milliseconds (default 30000).',
          },
          javascript: {
            type: 'boolean',
            description: 'Set to true if the page requires JS rendering (skips to tier 2).',
          },
        },
      },
    },
    required: ['url'],
  };

  readonly requiredCapabilities = ['capability:web_scrape'];

  /** Reference to the shared scraper service. */
  private readonly scraper: WebScraperService;

  /**
   * @param scraper - A pre-configured {@link WebScraperService} instance.
   */
  constructor(scraper: WebScraperService) {
    this.scraper = scraper;
  }

  /**
   * Execute a single-URL scrape request.
   *
   * @param args    - The scrape input (url, optional extract config, optional options).
   * @param _context - Tool execution context (unused but required by ITool contract).
   * @returns A {@link ToolExecutionResult} wrapping the {@link ScrapeResult}.
   */
  async execute(
    args: ScrapeInput,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult<ScrapeResult>> {
    try {
      const result = await this.scraper.scrape(args);

      return {
        success: result.success,
        output: result,
        error: result.error,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `web_scrape execution failed: ${msg}`,
      };
    }
  }
}
