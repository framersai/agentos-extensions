import { describe, it, expect, vi, afterEach } from 'vitest';
import { FirecrawlClient } from '../src/engine/FirecrawlClient';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('FirecrawlClient', () => {
  const client = new FirecrawlClient({
    apiKey: 'test-fc-key',
    maxCrawlPages: 5,
    crawlTimeoutMs: 5000,
    pollIntervalMs: 100,
  });

  describe('scrape()', () => {
    it('extracts clean markdown from a URL', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            markdown: '# Hello World\n\nThis is the content.',
            metadata: { title: 'Hello World Page' },
          },
        }),
      });

      const result = await client.scrape('https://example.com');
      expect(result.title).toBe('Hello World Page');
      expect(result.content).toContain('# Hello World');
      expect(result.wordCount).toBeGreaterThan(0);
      expect(result.url).toBe('https://example.com');
    });

    it('throws on API error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await expect(client.scrape('https://example.com')).rejects.toThrow('Firecrawl scrape error: 500');
    });

    it('handles empty markdown gracefully', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: {} }),
      });

      const result = await client.scrape('https://example.com');
      expect(result.content).toBe('');
      expect(result.wordCount).toBe(1); // empty string splits to ['']
    });
  });

  describe('crawl()', () => {
    it('starts crawl job and polls until completion', async () => {
      const fetchMock = vi.fn()
        // Start crawl
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, id: 'job-123' }),
        })
        // First poll — in progress
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'scraping' }),
        })
        // Second poll — completed
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            status: 'completed',
            data: [
              { markdown: '# Page 1', metadata: { title: 'Page One', sourceURL: 'https://example.com/1' } },
              { markdown: '# Page 2', metadata: { title: 'Page Two', sourceURL: 'https://example.com/2' } },
            ],
          }),
        });

      globalThis.fetch = fetchMock;

      const result = await client.crawl('https://example.com');
      expect(result.totalPages).toBe(2);
      expect(result.pages[0].title).toBe('Page One');
      expect(result.pages[1].url).toBe('https://example.com/2');
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('throws on crawl job failure', async () => {
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, id: 'job-fail' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'failed' }),
        });

      await expect(client.crawl('https://example.com')).rejects.toThrow('crawl job failed');
    });

    it('throws on start error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 });
      await expect(client.crawl('https://example.com')).rejects.toThrow('crawl start error: 400');
    });
  });
});
