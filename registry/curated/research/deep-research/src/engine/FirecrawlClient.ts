/**
 * @fileoverview Firecrawl API client for deep research content extraction and crawling.
 *
 * Provides two capabilities:
 * - scrape(): Extract clean markdown from a single URL (JS-rendered, anti-bot)
 * - crawl(): Multi-page site crawl with status polling (deep research only)
 *
 * @see https://docs.firecrawl.dev/api-reference
 * @module deep-research/engine/FirecrawlClient
 */

/** Extracted content from a Firecrawl scrape. */
export interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  wordCount: number;
}

/** Result of a Firecrawl crawl job. */
export interface CrawlResult {
  pages: ScrapedContent[];
  totalPages: number;
  completedAt: string;
}

/** Configuration for the Firecrawl client. */
export interface FirecrawlConfig {
  apiKey: string;
  /** Max pages per crawl job. Default: 10. */
  maxCrawlPages?: number;
  /** Crawl job timeout in ms. Default: 120000 (2 minutes). */
  crawlTimeoutMs?: number;
  /** Poll interval for crawl status in ms. Default: 3000. */
  pollIntervalMs?: number;
}

/**
 * Firecrawl API client for scraping and crawling.
 * Used by DeepResearchEngine when Firecrawl is configured.
 */
export class FirecrawlClient {
  private readonly apiKey: string;
  private readonly maxCrawlPages: number;
  private readonly crawlTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(config: FirecrawlConfig) {
    this.apiKey = config.apiKey;
    this.maxCrawlPages = config.maxCrawlPages ?? 10;
    this.crawlTimeoutMs = config.crawlTimeoutMs ?? 120_000;
    this.pollIntervalMs = config.pollIntervalMs ?? 3_000;
  }

  /** Scrape a single URL and return clean markdown content. */
  async scrape(url: string): Promise<ScrapedContent> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ url, formats: ['markdown'] }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`Firecrawl scrape error: ${res.status}`);

      const data = (await res.json()) as {
        success: boolean;
        data?: { markdown?: string; metadata?: { title?: string } };
      };

      const markdown = data.data?.markdown ?? '';
      return {
        url,
        title: data.data?.metadata?.title ?? url,
        content: markdown,
        wordCount: markdown.split(/\s+/).length,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Crawl a domain and return multiple pages of content. Polls until completion. */
  async crawl(url: string): Promise<CrawlResult> {
    const startRes = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        url,
        limit: this.maxCrawlPages,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    if (!startRes.ok) throw new Error(`Firecrawl crawl start error: ${startRes.status}`);

    const { id: jobId } = (await startRes.json()) as { success: boolean; id: string };

    const startTime = Date.now();
    while (Date.now() - startTime < this.crawlTimeoutMs) {
      await new Promise((r) => setTimeout(r, this.pollIntervalMs));

      const statusRes = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
      });

      if (!statusRes.ok) continue;

      const status = (await statusRes.json()) as {
        status: string;
        data?: Array<{ markdown?: string; metadata?: { title?: string; sourceURL?: string } }>;
      };

      if (status.status === 'completed' && status.data) {
        const pages: ScrapedContent[] = status.data.map((page) => {
          const markdown = page.markdown ?? '';
          return {
            url: page.metadata?.sourceURL ?? url,
            title: page.metadata?.title ?? '',
            content: markdown,
            wordCount: markdown.split(/\s+/).length,
          };
        });

        return { pages, totalPages: pages.length, completedAt: new Date().toISOString() };
      }

      if (status.status === 'failed') {
        throw new Error('Firecrawl crawl job failed');
      }
    }

    throw new Error(`Firecrawl crawl timed out after ${this.crawlTimeoutMs}ms`);
  }
}
