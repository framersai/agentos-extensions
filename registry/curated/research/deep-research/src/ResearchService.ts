/**
 * @fileoverview Deep Research service layer.
 *
 * Provides multi-source investigation, academic search, content scraping,
 * aggregate search, and trend discovery via HTTP APIs.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResearchConfig {
  serperApiKey: string;
  braveApiKey?: string;
  serpApiKey?: string;
}

export interface InvestigationResult {
  query: string;
  sources: string[];
  findings: Array<{
    source: string;
    title: string;
    snippet: string;
    url: string;
    relevance: number;
  }>;
  crossReferences: Array<{
    claim: string;
    supportedBy: string[];
    confidence: number;
  }>;
  summary: string;
}

export interface AcademicResult {
  title: string;
  authors: string[];
  abstract: string;
  url: string;
  year?: number;
  citations?: number;
  source: string;
}

export interface ScrapeResult {
  url: string;
  type: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
}

export interface AggregateResult {
  engine: string;
  results: Array<{
    title: string;
    snippet: string;
    url: string;
    position: number;
  }>;
}

export interface TrendingResult {
  platform: string;
  trends: Array<{
    title: string;
    description?: string;
    url?: string;
    score?: number;
    category?: string;
  }>;
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ResearchService {
  private config: ResearchConfig;
  private httpClient: AxiosInstance;
  private running = false;

  constructor(config: ResearchConfig) {
    this.config = config;
    this.httpClient = axios.create({ timeout: 30000 });
  }

  async initialize(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Multi-Source Investigation ──

  async investigate(
    query: string,
    sources: string[] = ['web', 'academic', 'news'],
    maxResults: number = 10,
  ): Promise<InvestigationResult> {
    this.requireRunning();

    const findings: InvestigationResult['findings'] = [];

    // Search across requested sources
    for (const source of sources) {
      try {
        switch (source) {
          case 'web': {
            const webResults = await this.serperSearch(query, 'search', maxResults);
            for (const r of webResults) {
              findings.push({ source: 'web', title: r.title, snippet: r.snippet, url: r.link, relevance: 0.8 });
            }
            break;
          }
          case 'academic': {
            const papers = await this.searchAcademic(query, { source: 'arxiv', maxResults });
            for (const p of papers) {
              findings.push({ source: 'academic', title: p.title, snippet: p.abstract.slice(0, 300), url: p.url, relevance: 0.9 });
            }
            break;
          }
          case 'news': {
            const newsResults = await this.serperSearch(query, 'news', maxResults);
            for (const r of newsResults) {
              findings.push({ source: 'news', title: r.title, snippet: r.snippet, url: r.link, relevance: 0.7 });
            }
            break;
          }
          case 'social': {
            const socialResults = await this.serperSearch(`${query} site:reddit.com OR site:twitter.com`, 'search', maxResults);
            for (const r of socialResults) {
              findings.push({ source: 'social', title: r.title, snippet: r.snippet, url: r.link, relevance: 0.6 });
            }
            break;
          }
        }
      } catch {
        // Continue with other sources if one fails
      }
    }

    // Cross-reference findings by looking for overlapping claims
    const crossReferences = this.buildCrossReferences(findings);

    return {
      query,
      sources,
      findings: findings.slice(0, maxResults),
      crossReferences,
      summary: `Found ${findings.length} results across ${sources.length} sources with ${crossReferences.length} cross-references.`,
    };
  }

  // ── Academic Search ──

  async searchAcademic(
    query: string,
    opts: { source?: string; maxResults?: number } = {},
  ): Promise<AcademicResult[]> {
    this.requireRunning();

    const source = opts.source ?? 'arxiv';
    const maxResults = opts.maxResults ?? 10;

    switch (source) {
      case 'arxiv':
        return this.searchArxiv(query, maxResults);
      case 'scholar':
        return this.searchGoogleScholar(query, maxResults);
      case 'semantic':
        return this.searchSemanticScholar(query, maxResults);
      default:
        return this.searchArxiv(query, maxResults);
    }
  }

  // ── Content Scraping ──

  async scrapeContent(url: string, type: string = 'generic'): Promise<ScrapeResult> {
    this.requireRunning();

    switch (type) {
      case 'youtube':
        return this.scrapeYouTube(url);
      case 'wikipedia':
        return this.scrapeWikipedia(url);
      case 'blog':
      case 'generic':
      default:
        return this.scrapeGeneric(url);
    }
  }

  // ── Aggregate Search ──

  async aggregateSearch(
    query: string,
    engines: string[] = ['serper'],
    maxResults: number = 10,
  ): Promise<AggregateResult[]> {
    this.requireRunning();

    const results: AggregateResult[] = [];

    for (const engine of engines) {
      try {
        switch (engine) {
          case 'serper': {
            const serperResults = await this.serperSearch(query, 'search', maxResults);
            results.push({
              engine: 'serper',
              results: serperResults.map((r: any, i: number) => ({
                title: r.title,
                snippet: r.snippet,
                url: r.link,
                position: i + 1,
              })),
            });
            break;
          }
          case 'brave': {
            if (!this.config.braveApiKey) break;
            const braveResults = await this.braveSearch(query, maxResults);
            results.push({
              engine: 'brave',
              results: braveResults.map((r: any, i: number) => ({
                title: r.title,
                snippet: r.description,
                url: r.url,
                position: i + 1,
              })),
            });
            break;
          }
          case 'serpapi': {
            if (!this.config.serpApiKey) break;
            const serpResults = await this.serpApiSearch(query, maxResults);
            results.push({
              engine: 'serpapi',
              results: serpResults.map((r: any, i: number) => ({
                title: r.title,
                snippet: r.snippet,
                url: r.link,
                position: i + 1,
              })),
            });
            break;
          }
        }
      } catch {
        // Continue with other engines
      }
    }

    return results;
  }

  // ── Trend Discovery ──

  async discoverTrending(
    platform: string = 'hackernews',
    category?: string,
  ): Promise<TrendingResult> {
    this.requireRunning();

    switch (platform) {
      case 'hackernews':
        return this.getHackerNewsTrends(category);
      case 'reddit':
        return this.getRedditTrends(category);
      case 'youtube':
        return this.getYouTubeTrends(category);
      case 'twitter':
        return this.getTwitterTrends(category);
      default:
        return this.getHackerNewsTrends(category);
    }
  }

  // ── Private: Search Providers ──

  private async serperSearch(query: string, type: string, maxResults: number): Promise<any[]> {
    const response = await this.httpClient.post(
      'https://google.serper.dev/search',
      { q: query, type, num: maxResults },
      { headers: { 'X-API-KEY': this.config.serperApiKey, 'Content-Type': 'application/json' } },
    );
    return response.data.organic ?? response.data.news ?? [];
  }

  private async braveSearch(query: string, maxResults: number): Promise<any[]> {
    const response = await this.httpClient.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: maxResults },
      headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': this.config.braveApiKey },
    });
    return response.data.web?.results ?? [];
  }

  private async serpApiSearch(query: string, maxResults: number): Promise<any[]> {
    const response = await this.httpClient.get('https://serpapi.com/search', {
      params: { q: query, api_key: this.config.serpApiKey, num: maxResults, engine: 'google' },
    });
    return response.data.organic_results ?? [];
  }

  // ── Private: Academic Providers ──

  private async searchArxiv(query: string, maxResults: number): Promise<AcademicResult[]> {
    const response = await this.httpClient.get('http://export.arxiv.org/api/query', {
      params: { search_query: `all:${query}`, start: 0, max_results: maxResults },
    });

    const entries = response.data.match(/<entry>([\s\S]*?)<\/entry>/g) ?? [];
    return entries.map((entry: string) => {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? '';
      const abstract = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() ?? '';
      const url = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim() ?? '';
      const authorMatches = entry.match(/<name>([\s\S]*?)<\/name>/g) ?? [];
      const authors = authorMatches.map((a: string) => a.replace(/<\/?name>/g, '').trim());
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() ?? '';
      const year = published ? new Date(published).getFullYear() : undefined;
      return { title, authors, abstract, url, year, source: 'arxiv' };
    });
  }

  private async searchGoogleScholar(query: string, maxResults: number): Promise<AcademicResult[]> {
    // Use Serper's scholar endpoint as a proxy for Google Scholar
    const response = await this.httpClient.post(
      'https://google.serper.dev/scholar',
      { q: query, num: maxResults },
      { headers: { 'X-API-KEY': this.config.serperApiKey, 'Content-Type': 'application/json' } },
    );
    return (response.data.organic ?? []).map((r: any) => ({
      title: r.title ?? '',
      authors: r.publication_info?.authors?.map((a: any) => a.name) ?? [],
      abstract: r.snippet ?? '',
      url: r.link ?? '',
      year: r.publication_info?.year,
      citations: r.inline_links?.cited_by?.total,
      source: 'scholar',
    }));
  }

  private async searchSemanticScholar(query: string, maxResults: number): Promise<AcademicResult[]> {
    const response = await this.httpClient.get('https://api.semanticscholar.org/graph/v1/paper/search', {
      params: { query, limit: maxResults, fields: 'title,authors,abstract,url,year,citationCount' },
    });
    return (response.data.data ?? []).map((p: any) => ({
      title: p.title ?? '',
      authors: (p.authors ?? []).map((a: any) => a.name),
      abstract: p.abstract ?? '',
      url: p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`,
      year: p.year,
      citations: p.citationCount,
      source: 'semantic',
    }));
  }

  // ── Private: Content Scrapers ──

  private async scrapeYouTube(url: string): Promise<ScrapeResult> {
    const videoId = this.extractYouTubeId(url);
    // Use YouTube's oEmbed endpoint for metadata
    const oembedRes = await this.httpClient.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    return {
      url,
      type: 'youtube',
      title: oembedRes.data.title ?? '',
      content: `Video: ${oembedRes.data.title}\nAuthor: ${oembedRes.data.author_name}\nChannel: ${oembedRes.data.author_url}`,
      metadata: { videoId, author: oembedRes.data.author_name, thumbnail: oembedRes.data.thumbnail_url },
    };
  }

  private async scrapeWikipedia(url: string): Promise<ScrapeResult> {
    // Extract article title from URL or use as-is
    const titleMatch = url.match(/\/wiki\/(.+?)(?:#|$|\?)/);
    const title = titleMatch ? decodeURIComponent(titleMatch[1]) : url;
    const response = await this.httpClient.get('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
    return {
      url: response.data.content_urls?.desktop?.page ?? url,
      type: 'wikipedia',
      title: response.data.title ?? title,
      content: response.data.extract ?? '',
      metadata: { description: response.data.description, thumbnail: response.data.thumbnail?.source },
    };
  }

  private async scrapeGeneric(url: string): Promise<ScrapeResult> {
    const response = await this.httpClient.get(url, {
      headers: { 'User-Agent': 'AgentOS-DeepResearch/0.1.0', 'Accept': 'text/html,application/xhtml+xml' },
      timeout: 15000,
    });
    const html = response.data as string;
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
    // Basic HTML to text conversion
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch?.[1] ?? html;
    const content = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000);
    return { url, type: 'generic', title, content, metadata: {} };
  }

  // ── Private: Trend Providers ──

  private async getHackerNewsTrends(_category?: string): Promise<TrendingResult> {
    const response = await this.httpClient.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids = (response.data as number[]).slice(0, 20);
    const stories = await Promise.all(
      ids.map((id) => this.httpClient.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.data)),
    );
    return {
      platform: 'hackernews',
      trends: stories.map((s: any) => ({
        title: s.title ?? '',
        description: s.text?.slice(0, 200),
        url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
        score: s.score,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getRedditTrends(category?: string): Promise<TrendingResult> {
    const subreddit = category ?? 'all';
    const response = await this.httpClient.get(`https://www.reddit.com/r/${subreddit}/hot.json?limit=20`, {
      headers: { 'User-Agent': 'AgentOS-DeepResearch/0.1.0' },
    });
    const posts = response.data?.data?.children ?? [];
    return {
      platform: 'reddit',
      trends: posts.map((p: any) => ({
        title: p.data.title ?? '',
        description: p.data.selftext?.slice(0, 200),
        url: `https://reddit.com${p.data.permalink}`,
        score: p.data.score,
        category: p.data.subreddit,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getYouTubeTrends(_category?: string): Promise<TrendingResult> {
    // Use Serper to search for trending YouTube content
    const results = await this.serperSearch('site:youtube.com trending', 'search', 20);
    return {
      platform: 'youtube',
      trends: results.map((r: any) => ({
        title: r.title ?? '',
        description: r.snippet,
        url: r.link,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  private async getTwitterTrends(_category?: string): Promise<TrendingResult> {
    // Use Serper to search for Twitter/X trending topics
    const results = await this.serperSearch('site:twitter.com OR site:x.com trending now', 'news', 20);
    return {
      platform: 'twitter',
      trends: results.map((r: any) => ({
        title: r.title ?? '',
        description: r.snippet,
        url: r.link,
      })),
      fetchedAt: new Date().toISOString(),
    };
  }

  // ── Private: Helpers ──

  private extractYouTubeId(url: string): string {
    const match = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
    return match?.[1] ?? url;
  }

  private buildCrossReferences(
    findings: InvestigationResult['findings'],
  ): InvestigationResult['crossReferences'] {
    const titleWords = new Map<string, string[]>();

    for (const f of findings) {
      const words = f.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
      for (const word of words) {
        const sources = titleWords.get(word) ?? [];
        if (!sources.includes(f.source)) {
          sources.push(f.source);
          titleWords.set(word, sources);
        }
      }
    }

    const crossRefs: InvestigationResult['crossReferences'] = [];
    for (const [word, sources] of titleWords) {
      if (sources.length >= 2) {
        crossRefs.push({
          claim: word,
          supportedBy: sources,
          confidence: Math.min(sources.length / 4, 1),
        });
      }
    }

    return crossRefs.slice(0, 10);
  }

  private requireRunning(): void {
    if (!this.running) throw new Error('ResearchService not initialized');
  }
}
