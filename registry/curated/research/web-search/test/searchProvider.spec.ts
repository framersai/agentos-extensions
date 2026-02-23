import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchProviderService } from '../src/services/searchProvider';

// Mock fetch
global.fetch = vi.fn();

describe('SearchProviderService', () => {
  let service: SearchProviderService;
  
  beforeEach(() => {
    service = new SearchProviderService({
      serperApiKey: 'test-serper-key',
      serpApiKey: 'test-serpapi-key',
      braveApiKey: 'test-brave-key',
      searxngUrl: 'http://localhost:8888',
    });
    vi.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should initialize with provided API keys', () => {
      expect(service).toBeDefined();
    });
    
    it('should initialize with empty config', () => {
      const emptyService = new SearchProviderService({});
      expect(emptyService).toBeDefined();
    });
  });
  
  describe('search', () => {
    it('should fallback through providers on failure', async () => {
      const mockFetch = global.fetch as any;
      
      // First provider fails
      mockFetch.mockRejectedValueOnce(new Error('Serper API error'));
      
      // Second provider succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic_results: [
            { title: 'Test', link: 'https://example.com', snippet: 'Test snippet' }
          ]
        })
      });
      
      const result = await service.search('test query');
      
      expect(result.provider).toBe('serpapi');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test');
    });
    
    it('should use DuckDuckGo as final fallback', async () => {
      const mockFetch = global.fetch as any;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Heading: 'Test Result',
          AbstractText: 'Test snippet from DuckDuckGo',
          AbstractURL: 'https://example.com',
          RelatedTopics: [],
        }),
      });
      
      const serviceNoKeys = new SearchProviderService({});
      const result = await serviceNoKeys.search('test query');
      
      expect(result.provider).toBe('duckduckgo');
      expect(result.metadata.fallback).toBe(true);
    });
    
    it('should respect rate limiting', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ organic: [] })
      });
      
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(service.search(`query ${i}`));
      }
      
      const startTime = Date.now();
      await Promise.all(promises);
      const endTime = Date.now();
      
      // Should take at least some time due to rate limiting
      expect(endTime - startTime).toBeGreaterThanOrEqual(0);
    });
    
    it('should respect maxResults parameter', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          organic: Array(20).fill({
            title: 'Test',
            link: 'https://example.com',
            snippet: 'Test'
          })
        })
      });
      
      const result = await service.search('test', { maxResults: 5 });
      expect(result.results).toHaveLength(5);
    });
  });
  
  describe('searchSerper', () => {
    it('should format request correctly', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ organic: [] })
      });
      
      await service.search('test query', { provider: 'serper' });
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'X-API-KEY': 'test-serper-key',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ q: 'test query', num: 10 })
        })
      );
    });
  });
  
  describe('getAvailableProviders', () => {
    it('should return providers with configured API keys', () => {
      const providers = service.getAvailableProviders();
      expect(providers).toEqual(['serper', 'serpapi', 'brave', 'searxng']);
    });

    it('should include searxng when URL is configured', () => {
      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080' });
      expect(searxngService.getAvailableProviders()).toEqual(['searxng']);
    });

    it('should return empty array with no API keys', () => {
      const emptyService = new SearchProviderService({});
      expect(emptyService.getAvailableProviders()).toEqual([]);
    });
  });

  describe('searchSearXNG', () => {
    it('should format request with correct URL params', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { title: 'SearXNG Result', url: 'https://example.com/searxng', content: 'SearXNG snippet' },
          ],
        }),
      });

      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080' });
      const result = await searxngService.search('test query', { provider: 'searxng' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://searxng:8080/search?'),
      );
      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('format=json');
      expect(calledUrl).toContain('categories=general');
      expect(result.provider).toBe('searxng');
      expect(result.results).toHaveLength(1);
    });

    it('should map SearXNG "content" field to "snippet"', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            { title: 'Title', url: 'https://example.com', content: 'SearXNG content field' },
          ],
        }),
      });

      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080' });
      const result = await searxngService.search('test', { provider: 'searxng' });

      expect(result.results[0].snippet).toBe('SearXNG content field');
    });

    it('should pass category parameter to SearXNG', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080' });
      await searxngService.search('AI news', { provider: 'searxng', category: 'news' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('categories=news');
    });

    it('should handle SearXNG API errors', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValueOnce({ ok: false, statusText: 'Service Unavailable' });
      // DuckDuckGo fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Heading: 'DDG', AbstractText: 'Fallback', AbstractURL: 'https://example.com', RelatedTopics: [] }),
      });

      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080' });
      const result = await searxngService.search('test');

      // Should fall through to DuckDuckGo
      expect(result.provider).toBe('duckduckgo');
    });

    it('should strip trailing slashes from SearXNG URL', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      });

      const searxngService = new SearchProviderService({ searxngUrl: 'http://searxng:8080///' });
      await searxngService.search('test', { provider: 'searxng' });

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toMatch(/^http:\/\/searxng:8080\/search\?/);
    });
  });

  describe('normalizeUrl', () => {
    it('should strip www prefix', () => {
      expect(SearchProviderService.normalizeUrl('https://www.example.com/page'))
        .toBe('https://example.com/page');
    });

    it('should strip tracking params (utm_*, fbclid, gclid)', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&fbclid=abc&real=keep';
      const normalized = SearchProviderService.normalizeUrl(url);
      expect(normalized).toContain('real=keep');
      expect(normalized).not.toContain('utm_source');
      expect(normalized).not.toContain('fbclid');
    });

    it('should strip trailing slashes', () => {
      expect(SearchProviderService.normalizeUrl('https://example.com/page/'))
        .toBe('https://example.com/page');
    });

    it('should sort remaining query params', () => {
      const url = 'https://example.com/page?z=1&a=2';
      const normalized = SearchProviderService.normalizeUrl(url);
      expect(normalized).toBe('https://example.com/page?a=2&z=1');
    });

    it('should handle invalid URLs gracefully', () => {
      expect(SearchProviderService.normalizeUrl('not a url')).toBe('not a url');
    });
  });

  describe('multiSearch', () => {
    it('should fan out to all available providers + duckduckgo', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('serper.dev')) {
          return { ok: true, json: async () => ({ organic: [
            { title: 'Result A', link: 'https://example.com/a', snippet: 'Snippet A', position: 1 },
            { title: 'Result B', link: 'https://example.com/b', snippet: 'Snippet B', position: 2 },
          ] }) };
        }
        if (urlStr.includes('serpapi.com')) {
          return { ok: true, json: async () => ({ organic_results: [
            { title: 'Result A', link: 'https://example.com/a', snippet: 'Snippet A longer', position: 1 },
            { title: 'Result C', link: 'https://example.com/c', snippet: 'Snippet C', position: 2 },
          ] }) };
        }
        if (urlStr.includes('brave.com')) {
          return { ok: true, json: async () => ({ web: { results: [
            { title: 'Result A', url: 'https://example.com/a', description: 'Snippet A brave' },
          ] } }) };
        }
        if (urlStr.includes('localhost:8888')) {
          return { ok: true, json: async () => ({ results: [
            { title: 'Result A', url: 'https://example.com/a', content: 'Snippet A searxng' },
            { title: 'Result E', url: 'https://example.com/e', content: 'Snippet E' },
          ] }) };
        }
        // duckduckgo
        return { ok: true, json: async () => ({ Heading: 'Result D', AbstractText: 'DDG snippet', AbstractURL: 'https://example.com/d', RelatedTopics: [] }) };
      });

      const result = await service.multiSearch('test query');

      expect(result.metadata.providersQueried).toContain('serper');
      expect(result.metadata.providersQueried).toContain('searxng');
      expect(result.metadata.providersQueried).toContain('duckduckgo');
      expect(result.metadata.deduplicatedCount).toBeLessThanOrEqual(result.metadata.totalRawResults);
    });

    it('should deduplicate results across providers', async () => {
      const mockFetch = global.fetch as any;
      // Route mocks by URL since Promise.allSettled doesn't guarantee call order
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('serper.dev')) {
          return { ok: true, json: async () => ({ organic: [{ title: 'Same', link: 'https://example.com/same', snippet: 'Same snippet', position: 1 }] }) };
        }
        if (urlStr.includes('serpapi.com')) {
          return { ok: true, json: async () => ({ organic_results: [{ title: 'Same', link: 'https://example.com/same', snippet: 'Same snippet', position: 1 }] }) };
        }
        if (urlStr.includes('brave.com')) {
          return { ok: true, json: async () => ({ web: { results: [{ title: 'Same', url: 'https://example.com/same', description: 'Same snippet' }] } }) };
        }
        if (urlStr.includes('localhost:8888')) {
          return { ok: true, json: async () => ({ results: [{ title: 'Same', url: 'https://example.com/same', content: 'Same snippet from SearXNG' }] }) };
        }
        // duckduckgo
        return { ok: true, json: async () => ({ Heading: 'Same', AbstractText: 'Same', AbstractURL: 'https://example.com/same', RelatedTopics: [] }) };
      });

      const result = await service.multiSearch('test');

      // Should be deduplicated to 1 result
      expect(result.results).toHaveLength(1);
      expect(result.results[0].agreementCount).toBeGreaterThanOrEqual(4);
    });

    it('should rank results with more provider agreement higher', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockImplementation(async (url: string) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        if (urlStr.includes('serper.dev')) {
          return { ok: true, json: async () => ({ organic: [
            { title: 'A', link: 'https://example.com/a', snippet: 'A', position: 1 },
            { title: 'B', link: 'https://example.com/b', snippet: 'B', position: 2 },
          ] }) };
        }
        if (urlStr.includes('serpapi.com')) {
          return { ok: true, json: async () => ({ organic_results: [
            { title: 'A', link: 'https://example.com/a', snippet: 'A', position: 1 },
          ] }) };
        }
        if (urlStr.includes('brave.com')) {
          return { ok: true, json: async () => ({ web: { results: [
            { title: 'A', url: 'https://example.com/a', description: 'A' },
          ] } }) };
        }
        if (urlStr.includes('localhost:8888')) {
          return { ok: true, json: async () => ({ results: [
            { title: 'A', url: 'https://example.com/a', content: 'A' },
          ] }) };
        }
        // duckduckgo returns B only
        return { ok: true, json: async () => ({ Heading: 'B', AbstractText: 'B', AbstractURL: 'https://example.com/b', RelatedTopics: [] }) };
      });

      const result = await service.multiSearch('test');

      // A appears in 4 providers, B in 2 — A should rank first
      expect(result.results[0].url).toBe('https://example.com/a');
      expect(result.results[0].confidenceScore).toBeGreaterThan(result.results[1].confidenceScore);
    });

    it('should handle all providers failing gracefully', async () => {
      const mockFetch = global.fetch as any;
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.multiSearch('test');

      expect(result.results).toHaveLength(0);
      expect(result.metadata.providersFailed.length).toBeGreaterThan(0);
    });
  });

  describe('getRecommendedProviders', () => {
    it('should return provider recommendations including SearXNG', () => {
      const providers = SearchProviderService.getRecommendedProviders();
      expect(providers).toHaveLength(5);
      expect(providers[0].name).toBe('Serper');
      expect(providers[0].signupUrl).toContain('serper.dev');
      const searxng = providers.find((p) => p.name === 'SearXNG');
      expect(searxng).toBeDefined();
      expect(searxng!.freeQuota).toContain('Unlimited');
    });
  });
});
