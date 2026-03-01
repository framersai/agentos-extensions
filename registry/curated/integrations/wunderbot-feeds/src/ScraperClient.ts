/**
 * @fileoverview HTTP client for the Python Scraper REST API.
 */

import type {
  NewsResponse,
  DealsResponse,
  ShortSqueezeResponse,
  TrendingCryptoResponse,
  ThreatIntelResponse,
  JobsResponse,
  PapersResponse,
  SniperStatus,
} from './types.js';

const NEWS_TIMEOUT = 10 * 60_000; // 10 min — news scraping is slow
const DEFAULT_TIMEOUT = 60_000;   // 1 min for fast endpoints

export class ScraperClient {
  readonly baseUrl: string;
  readonly apiKey: string;

  constructor(baseUrl: string, apiKey = '') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
  }

  // -------------------------------------------------------------------------
  // Endpoint methods
  // -------------------------------------------------------------------------

  async fetchNews(category: string, limit = 5): Promise<NewsResponse> {
    return this.get<NewsResponse>(
      `/api/v1/news/${category}?limit=${limit}`,
      NEWS_TIMEOUT,
    );
  }

  async fetchDeals(): Promise<DealsResponse> {
    return this.get<DealsResponse>('/api/v1/deals/udemy', NEWS_TIMEOUT);
  }

  async fetchShortSqueeze(topN = 10): Promise<ShortSqueezeResponse> {
    return this.get<ShortSqueezeResponse>(
      `/api/v1/trades/short-squeeze?top_n=${topN}`,
      DEFAULT_TIMEOUT,
    );
  }

  async fetchTrendingCrypto(): Promise<TrendingCryptoResponse> {
    return this.get<TrendingCryptoResponse>(
      '/api/v1/trades/trending-crypto',
      DEFAULT_TIMEOUT,
    );
  }

  async fetchThreatIntel(limit = 5): Promise<ThreatIntelResponse> {
    return this.get<ThreatIntelResponse>(
      `/api/v1/threat-intel?limit=${limit}`,
      NEWS_TIMEOUT,
    );
  }

  async fetchJobs(title: string, location: string, limit = 15): Promise<JobsResponse> {
    const params = new URLSearchParams({ title, location, limit: String(limit) });
    return this.get<JobsResponse>(`/api/v1/jobs?${params}`, NEWS_TIMEOUT);
  }

  async fetchPapers(limit = 5, channelId?: string): Promise<PapersResponse> {
    const params = new URLSearchParams({ limit: String(limit), digest: 'true' });
    if (channelId) params.set('channel_id', channelId);
    return this.get<PapersResponse>(
      `/api/v1/papers?${params}`,
      5 * 60_000, // 5 min — digest generation via Ollama is slow
    );
  }

  async markPaperPosted(channelId: string, dedupeKey: string, documentId?: number): Promise<void> {
    // Pass channel_id as string — Discord snowflake IDs exceed Number.MAX_SAFE_INTEGER.
    await this.post('/api/v1/papers/mark-posted', {
      channel_id: channelId,
      dedupe_key: dedupeKey,
      document_id: documentId ?? null,
    });
  }

  async fetchSniperStatus(): Promise<SniperStatus> {
    return this.get<SniperStatus>('/api/v1/sniper/status', DEFAULT_TIMEOUT);
  }

  // -------------------------------------------------------------------------
  // HTTP helpers
  // -------------------------------------------------------------------------

  private async get<T>(path: string, timeoutMs: number): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`ScraperAPI ${res.status} ${res.statusText}: ${text}`);
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ScraperAPI POST ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}
