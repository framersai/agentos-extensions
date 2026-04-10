// @ts-nocheck
/**
 * @fileoverview Shared Meta Graph API client for Facebook, Instagram, and Threads.
 *
 * Handles common patterns: auth, rate limiting, media upload (container + polling),
 * token refresh, and page/account selection.
 *
 * @module @framers/agentos-extensions/shared/MetaGraphClient
 */

import axios, { type AxiosInstance, type AxiosError } from 'axios';

// ── Types ──

export interface MetaGraphConfig {
  accessToken: string;
  apiVersion?: string; // default: 'v19.0'
  pageId?: string;
  igUserId?: string;
  threadsUserId?: string;
}

export interface MetaMediaContainer {
  id: string;
  status: 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED';
  statusCode?: string;
}

export interface MetaPostResult {
  id: string;
  url?: string;
}

export interface MetaCommentResult {
  id: string;
}

export interface MetaInsightsResult {
  impressions?: number;
  reach?: number;
  engagement?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  plays?: number;
}

export class MetaTokenExpiredError extends Error {
  constructor(message = 'Meta access token expired or invalid') {
    super(message);
    this.name = 'MetaTokenExpiredError';
  }
}

export class MetaRateLimitError extends Error {
  constructor(public retryAfter: number, message = 'Meta API rate limit reached') {
    super(message);
    this.name = 'MetaRateLimitError';
  }
}

// ── Client ──

export class MetaGraphClient {
  private client: AxiosInstance;
  private config: MetaGraphConfig;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly MAX_REQUESTS_PER_HOUR = 200;

  constructor(config: MetaGraphConfig) {
    this.config = config;
    const version = config.apiVersion ?? 'v19.0';
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${version}`,
      headers: { Authorization: `Bearer ${config.accessToken}` },
      timeout: 30_000,
    });
  }

  // ── Core HTTP Methods ──

  async get<T = any>(path: string, params?: Record<string, any>): Promise<T> {
    await this.checkRateLimit();
    try {
      const resp = await this.client.get(path, { params });
      return resp.data;
    } catch (err) {
      this.handleError(err as AxiosError);
      throw err;
    }
  }

  async post<T = any>(path: string, data?: any, params?: Record<string, any>): Promise<T> {
    await this.checkRateLimit();
    try {
      const resp = await this.client.post(path, data, { params });
      return resp.data;
    } catch (err) {
      this.handleError(err as AxiosError);
      throw err;
    }
  }

  async delete(path: string): Promise<void> {
    await this.checkRateLimit();
    try {
      await this.client.delete(path);
    } catch (err) {
      this.handleError(err as AxiosError);
      throw err;
    }
  }

  // ── Media Upload (Container + Polling pattern) ──
  // Used by Instagram and Threads for async media processing

  async createMediaContainer(userId: string, params: Record<string, any>): Promise<string> {
    const result = await this.post<{ id: string }>(`/${userId}/media`, null, params);
    return result.id;
  }

  async waitForMediaReady(containerId: string, maxWaitMs = 60_000): Promise<MetaMediaContainer> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const status = await this.get<MetaMediaContainer>(`/${containerId}`, {
        fields: 'id,status,status_code',
      });
      if (status.status === 'FINISHED') return status;
      if (status.status === 'ERROR' || status.status === 'EXPIRED') {
        throw new Error(`Media container ${containerId} failed: ${status.status} (${status.statusCode ?? 'unknown'})`);
      }
      await new Promise(r => setTimeout(r, 2000)); // poll every 2s
    }
    throw new Error(`Media container ${containerId} timed out after ${maxWaitMs}ms`);
  }

  async publishMediaContainer(userId: string, containerId: string): Promise<MetaPostResult> {
    return this.post<MetaPostResult>(`/${userId}/media_publish`, null, {
      creation_id: containerId,
    });
  }

  // ── Facebook Page Posts ──

  async postToPage(pageId: string, options: {
    message?: string;
    link?: string;
    photoUrl?: string;
    videoUrl?: string;
    scheduled_publish_time?: number;
    published?: boolean;
  }): Promise<MetaPostResult> {
    if (options.photoUrl) {
      return this.post<MetaPostResult>(`/${pageId}/photos`, null, {
        message: options.message,
        url: options.photoUrl,
        published: options.published ?? true,
        scheduled_publish_time: options.scheduled_publish_time,
      });
    }
    if (options.videoUrl) {
      return this.post<MetaPostResult>(`/${pageId}/videos`, null, {
        description: options.message,
        file_url: options.videoUrl,
        published: options.published ?? true,
        scheduled_publish_time: options.scheduled_publish_time,
      });
    }
    return this.post<MetaPostResult>(`/${pageId}/feed`, null, {
      message: options.message,
      link: options.link,
      published: options.published ?? true,
      scheduled_publish_time: options.scheduled_publish_time,
    });
  }

  // ── Comments ──

  async postComment(postId: string, message: string): Promise<MetaCommentResult> {
    return this.post<MetaCommentResult>(`/${postId}/comments`, null, { message });
  }

  // ── Reactions/Likes ──

  async likePost(postId: string): Promise<void> {
    await this.post(`/${postId}/likes`);
  }

  async unlikePost(postId: string): Promise<void> {
    await this.delete(`/${postId}/likes`);
  }

  // ── Insights ──

  async getPostInsights(postId: string, metrics: string[]): Promise<MetaInsightsResult> {
    const data = await this.get(`/${postId}/insights`, {
      metric: metrics.join(','),
    });
    const result: MetaInsightsResult = {};
    for (const entry of data.data ?? []) {
      const value = entry.values?.[0]?.value ?? 0;
      (result as any)[entry.name] = value;
    }
    return result;
  }

  // ── Pages ──

  async getPages(): Promise<Array<{ id: string; name: string; accessToken: string }>> {
    const data = await this.get('/me/accounts', { fields: 'id,name,access_token' });
    return (data.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
    }));
  }

  // ── Rate Limiting ──

  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 3_600_000) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    this.requestCount++;
    if (this.requestCount > this.MAX_REQUESTS_PER_HOUR) {
      const retryAfter = Math.ceil((this.windowStart + 3_600_000 - now) / 1000);
      throw new MetaRateLimitError(retryAfter);
    }
    // Small delay between requests to avoid bursting
    if (this.requestCount > 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // ── Error Handling ──

  private handleError(err: AxiosError): never {
    const data = err.response?.data as any;
    const code = data?.error?.code;
    if (err.response?.status === 401 || code === 190) {
      throw new MetaTokenExpiredError(data?.error?.message);
    }
    if (err.response?.status === 429 || code === 4 || code === 17) {
      const retryAfter = parseInt(err.response?.headers?.['retry-after'] ?? '60', 10);
      throw new MetaRateLimitError(retryAfter, data?.error?.message);
    }
    throw err;
  }

  // ── Accessors ──

  get pageId(): string | undefined { return this.config.pageId; }
  get igUserId(): string | undefined { return this.config.igUserId; }
  get threadsUserId(): string | undefined { return this.config.threadsUserId; }
  get accessToken(): string { return this.config.accessToken; }
}
