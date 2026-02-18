import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResearchService } from '../src/ResearchService';
import type {
  InvestigationResult,
  AcademicResult,
  ScrapeResult,
  AggregateResult,
  TrendingResult,
} from '../src/ResearchService';

// ---------------------------------------------------------------------------
// Mock axios
// ---------------------------------------------------------------------------

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: (...args: any[]) => mockGet(...args),
      post: (...args: any[]) => mockPost(...args),
    }),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(overrides: Partial<{ serperApiKey: string; braveApiKey: string; serpApiKey: string }> = {}) {
  return new ResearchService({
    serperApiKey: 'test-serper-key',
    braveApiKey: 'test-brave-key',
    serpApiKey: 'test-serp-key',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResearchService', () => {
  let service: ResearchService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = createService();
    await service.initialize();
  });

  afterEach(async () => {
    await service.shutdown();
  });

  // ── Constructor / Lifecycle ──

  describe('constructor', () => {
    it('should create an HTTP client', () => {
      const svc = createService();
      expect(svc.isRunning).toBe(false);
    });
  });

  describe('initialize / shutdown', () => {
    it('should set isRunning to true after initialize', () => {
      expect(service.isRunning).toBe(true);
    });

    it('should set isRunning to false after shutdown', async () => {
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('requireRunning', () => {
    it('should throw when calling investigate before initialization', async () => {
      const svc = createService();
      await expect(svc.investigate('test')).rejects.toThrow('not initialized');
    });

    it('should throw when calling searchAcademic before initialization', async () => {
      const svc = createService();
      await expect(svc.searchAcademic('test')).rejects.toThrow('not initialized');
    });

    it('should throw when calling scrapeContent before initialization', async () => {
      const svc = createService();
      await expect(svc.scrapeContent('https://example.com')).rejects.toThrow('not initialized');
    });
  });

  // ── investigate ──

  describe('investigate', () => {
    it('should search across multiple sources and return findings', async () => {
      // Mock serper for web search
      mockPost.mockResolvedValue({
        data: {
          organic: [
            { title: 'Web Result', snippet: 'A web snippet', link: 'https://example.com/1' },
          ],
        },
      });

      // Mock arxiv for academic search
      mockGet.mockResolvedValue({
        data: `<entry>
          <title>Academic Paper</title>
          <summary>Paper abstract</summary>
          <id>http://arxiv.org/abs/1234</id>
          <name>Author Name</name>
          <published>2024-01-01T00:00:00Z</published>
        </entry>`,
      });

      const result = await service.investigate('quantum computing', ['web', 'academic']);

      expect(result.query).toBe('quantum computing');
      expect(result.sources).toEqual(['web', 'academic']);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.summary).toContain('Found');
    });

    it('should continue when a source fails', async () => {
      // Web search succeeds
      mockPost.mockResolvedValueOnce({
        data: {
          organic: [
            { title: 'Result', snippet: 'Snippet', link: 'https://example.com' },
          ],
        },
      });
      // Academic search fails
      mockGet.mockRejectedValueOnce(new Error('Network error'));

      const result = await service.investigate('test', ['web', 'academic']);
      // Should still have web results
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].source).toBe('web');
    });

    it('should build cross-references from findings', async () => {
      mockPost
        .mockResolvedValueOnce({
          data: {
            organic: [
              { title: 'Machine Learning Advances', snippet: 'snippet', link: 'https://a.com' },
            ],
          },
        })
        .mockResolvedValueOnce({
          data: {
            news: [
              { title: 'Machine Learning Breakthrough', snippet: 'news', link: 'https://b.com' },
            ],
          },
        });

      const result = await service.investigate('machine learning', ['web', 'news']);
      // Cross references should exist for shared keywords
      expect(Array.isArray(result.crossReferences)).toBe(true);
    });

    it('should respect maxResults parameter', async () => {
      const manyResults = Array.from({ length: 20 }, (_, i) => ({
        title: `Result ${i}`,
        snippet: `Snippet ${i}`,
        link: `https://example.com/${i}`,
      }));
      mockPost.mockResolvedValue({ data: { organic: manyResults } });

      const result = await service.investigate('test', ['web'], 5);
      expect(result.findings.length).toBeLessThanOrEqual(5);
    });

    it('should support social source', async () => {
      mockPost.mockResolvedValue({
        data: {
          organic: [
            { title: 'Reddit Post', snippet: 'discussion', link: 'https://reddit.com/r/test' },
          ],
        },
      });

      const result = await service.investigate('test', ['social']);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].source).toBe('social');
    });
  });

  // ── searchAcademic ──

  describe('searchAcademic', () => {
    it('should search arxiv by default', async () => {
      mockGet.mockResolvedValue({
        data: `<entry>
          <title>Test Paper</title>
          <summary>Abstract text</summary>
          <id>http://arxiv.org/abs/2401.00001</id>
          <name>First Author</name>
          <name>Second Author</name>
          <published>2024-01-15T00:00:00Z</published>
        </entry>`,
      });

      const results = await service.searchAcademic('deep learning');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('arxiv');
      expect(results[0].title).toBe('Test Paper');
      expect(results[0].authors).toContain('First Author');
    });

    it('should search Google Scholar when source is "scholar"', async () => {
      mockPost.mockResolvedValue({
        data: {
          organic: [
            {
              title: 'Scholar Paper',
              snippet: 'Abstract from scholar',
              link: 'https://scholar.google.com/paper',
              publication_info: { authors: [{ name: 'Dr. Smith' }], year: 2023 },
              inline_links: { cited_by: { total: 42 } },
            },
          ],
        },
      });

      const results = await service.searchAcademic('test', { source: 'scholar' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('scholar');
    });

    it('should search Semantic Scholar when source is "semantic"', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: [
            {
              title: 'Semantic Paper',
              authors: [{ name: 'Dr. Jones' }],
              abstract: 'Paper abstract',
              url: 'https://semanticscholar.org/paper/123',
              year: 2024,
              citationCount: 15,
              paperId: '123',
            },
          ],
        },
      });

      const results = await service.searchAcademic('neural networks', { source: 'semantic' });
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].source).toBe('semantic');
      expect(results[0].citations).toBe(15);
    });

    it('should fall back to arxiv for unknown source', async () => {
      mockGet.mockResolvedValue({ data: '' });
      const results = await service.searchAcademic('test', { source: 'unknown' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // ── scrapeContent ──

  describe('scrapeContent', () => {
    it('should scrape YouTube video metadata', async () => {
      mockGet.mockResolvedValue({
        data: {
          title: 'Test Video',
          author_name: 'TestChannel',
          author_url: 'https://youtube.com/c/TestChannel',
          thumbnail_url: 'https://img.youtube.com/vi/abc/default.jpg',
        },
      });

      const result = await service.scrapeContent('https://www.youtube.com/watch?v=abc12345678', 'youtube');
      expect(result.type).toBe('youtube');
      expect(result.title).toBe('Test Video');
      expect(result.metadata).toHaveProperty('videoId');
    });

    it('should scrape Wikipedia article', async () => {
      mockGet.mockResolvedValue({
        data: {
          title: 'Machine Learning',
          extract: 'Machine learning is a subset of AI...',
          content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Machine_learning' } },
          description: 'Branch of AI',
          thumbnail: { source: 'https://upload.wikimedia.org/thumb.jpg' },
        },
      });

      const result = await service.scrapeContent('https://en.wikipedia.org/wiki/Machine_learning', 'wikipedia');
      expect(result.type).toBe('wikipedia');
      expect(result.title).toBe('Machine Learning');
      expect(result.content).toContain('Machine learning');
    });

    it('should scrape generic web page', async () => {
      mockGet.mockResolvedValue({
        data: '<html><head><title>Test Page</title></head><body><p>Hello World</p></body></html>',
      });

      const result = await service.scrapeContent('https://example.com/article', 'generic');
      expect(result.type).toBe('generic');
      expect(result.title).toBe('Test Page');
      expect(result.content).toContain('Hello World');
    });

    it('should default to generic scraper for blog type', async () => {
      mockGet.mockResolvedValue({
        data: '<html><head><title>Blog</title></head><body><article>Content</article></body></html>',
      });

      const result = await service.scrapeContent('https://blog.example.com/post', 'blog');
      expect(result.type).toBe('generic');
    });
  });

  // ── aggregateSearch ──

  describe('aggregateSearch', () => {
    it('should aggregate results from serper engine', async () => {
      mockPost.mockResolvedValue({
        data: {
          organic: [
            { title: 'Serper Result', snippet: 'A snippet', link: 'https://example.com' },
          ],
        },
      });

      const results = await service.aggregateSearch('test query', ['serper']);
      expect(results).toHaveLength(1);
      expect(results[0].engine).toBe('serper');
      expect(results[0].results[0].position).toBe(1);
    });

    it('should aggregate results from brave engine', async () => {
      mockGet.mockResolvedValue({
        data: {
          web: {
            results: [
              { title: 'Brave Result', description: 'Brave snippet', url: 'https://brave.example.com' },
            ],
          },
        },
      });

      const results = await service.aggregateSearch('test', ['brave']);
      expect(results).toHaveLength(1);
      expect(results[0].engine).toBe('brave');
    });

    it('should aggregate results from serpapi engine', async () => {
      mockGet.mockResolvedValue({
        data: {
          organic_results: [
            { title: 'SerpAPI Result', snippet: 'Serp snippet', link: 'https://serp.example.com' },
          ],
        },
      });

      const results = await service.aggregateSearch('test', ['serpapi']);
      expect(results).toHaveLength(1);
      expect(results[0].engine).toBe('serpapi');
    });

    it('should skip brave engine when braveApiKey is not set', async () => {
      const svc = createService({ braveApiKey: undefined });
      await svc.initialize();
      mockPost.mockResolvedValue({ data: { organic: [] } });

      const results = await svc.aggregateSearch('test', ['serper', 'brave']);
      // Only serper should return results since brave key is missing
      expect(results.length).toBeLessThanOrEqual(1);
      await svc.shutdown();
    });

    it('should continue when one engine fails', async () => {
      mockPost.mockRejectedValueOnce(new Error('Serper down'));
      mockGet.mockResolvedValue({
        data: {
          web: {
            results: [{ title: 'Brave Result', description: 'desc', url: 'https://brave.com' }],
          },
        },
      });

      const results = await service.aggregateSearch('test', ['serper', 'brave']);
      // Serper failed, brave should still return
      expect(results.some((r) => r.engine === 'brave')).toBe(true);
    });
  });

  // ── discoverTrending ──

  describe('discoverTrending', () => {
    it('should fetch Hacker News trends by default', async () => {
      mockGet
        .mockResolvedValueOnce({ data: [1, 2, 3] }) // top story IDs
        .mockResolvedValueOnce({ data: { id: 1, title: 'HN Story 1', url: 'https://hn.com/1', score: 100 } })
        .mockResolvedValueOnce({ data: { id: 2, title: 'HN Story 2', url: 'https://hn.com/2', score: 80 } })
        .mockResolvedValueOnce({ data: { id: 3, title: 'HN Story 3', url: 'https://hn.com/3', score: 60 } });

      const result = await service.discoverTrending('hackernews');
      expect(result.platform).toBe('hackernews');
      expect(result.trends.length).toBeGreaterThan(0);
      expect(result.trends[0]).toHaveProperty('title');
      expect(result.trends[0]).toHaveProperty('score');
      expect(result.fetchedAt).toBeTruthy();
    });

    it('should fetch Reddit trends', async () => {
      mockGet.mockResolvedValue({
        data: {
          data: {
            children: [
              { data: { title: 'Reddit Post', selftext: 'Content', permalink: '/r/test/1', score: 500, subreddit: 'test' } },
            ],
          },
        },
      });

      const result = await service.discoverTrending('reddit', 'programming');
      expect(result.platform).toBe('reddit');
      expect(result.trends[0].title).toBe('Reddit Post');
      expect(result.trends[0].category).toBe('test');
    });

    it('should fetch YouTube trends via serper fallback', async () => {
      mockPost.mockResolvedValue({
        data: {
          organic: [
            { title: 'Trending Video', snippet: 'A popular video', link: 'https://youtube.com/watch?v=abc' },
          ],
        },
      });

      const result = await service.discoverTrending('youtube');
      expect(result.platform).toBe('youtube');
      expect(result.trends.length).toBeGreaterThan(0);
    });

    it('should fetch Twitter trends via serper fallback', async () => {
      mockPost.mockResolvedValue({
        data: {
          news: [
            { title: 'Trending Topic', snippet: 'Twitter buzz', link: 'https://twitter.com/topic' },
          ],
        },
      });

      const result = await service.discoverTrending('twitter');
      expect(result.platform).toBe('twitter');
    });

    it('should default to hackernews for unknown platform', async () => {
      mockGet
        .mockResolvedValueOnce({ data: [1] })
        .mockResolvedValueOnce({ data: { id: 1, title: 'Story', url: 'https://hn.com/1', score: 50 } });

      const result = await service.discoverTrending('unknown-platform');
      expect(result.platform).toBe('hackernews');
    });
  });
});
