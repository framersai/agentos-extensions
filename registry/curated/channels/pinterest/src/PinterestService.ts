/**
 * @fileoverview Pinterest API v5 service layer.
 *
 * Wraps Pinterest API v5 via axios for pin creation, board management,
 * search, trending content, analytics, and scheduling.
 */

import axios, { type AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PinterestConfig {
  accessToken: string;
}

export interface PinOptions {
  boardId: string;
  title?: string;
  description?: string;
  link?: string;
  mediaSource: {
    sourceType: 'image_url' | 'video_id' | 'multiple_image_urls';
    url?: string;
    urls?: string[];
    videoId?: string;
    coverImageUrl?: string;
  };
  altText?: string;
  hashtags?: string[];
}

export interface BoardOptions {
  name: string;
  description?: string;
  privacy?: 'PUBLIC' | 'PROTECTED' | 'SECRET';
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  bookmark?: string;
}

export interface PinResult {
  id: string;
  title?: string;
  description?: string;
  link?: string;
  boardId?: string;
  createdAt?: string;
  mediaUrl?: string;
  metrics?: {
    saves: number;
    impressions: number;
    clicks: number;
    closeups: number;
  };
}

export interface BoardResult {
  id: string;
  name: string;
  description?: string;
  privacy: string;
  pinCount?: number;
  followerCount?: number;
  createdAt?: string;
}

export interface TrendingResult {
  keyword: string;
  rank: number;
  normalizedRank?: number;
  region?: string;
}

export interface AnalyticsResult {
  id: string;
  type: 'pin' | 'board';
  metrics: {
    impressions: number;
    saves: number;
    clicks: number;
    closeups: number;
    engagementRate?: number;
  };
  dateRange?: { start: string; end: string };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.pinterest.com/v5';

export class PinterestService {
  private client: AxiosInstance | null = null;
  private running = false;
  private readonly config: PinterestConfig;

  constructor(config: PinterestConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.running) return;

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Pins ──

  async createPin(options: PinOptions): Promise<PinResult> {
    const client = this.requireClient();

    const body: Record<string, any> = {
      board_id: options.boardId,
      title: options.title,
      description: this.appendHashtags(options.description, options.hashtags),
      link: options.link,
      alt_text: options.altText,
    };

    if (options.mediaSource.sourceType === 'image_url') {
      body.media_source = {
        source_type: 'image_url',
        url: options.mediaSource.url,
      };
    } else if (options.mediaSource.sourceType === 'video_id') {
      body.media_source = {
        source_type: 'video_id',
        id: options.mediaSource.videoId,
        cover_image_url: options.mediaSource.coverImageUrl,
      };
    } else if (options.mediaSource.sourceType === 'multiple_image_urls') {
      body.media_source = {
        source_type: 'multiple_image_urls',
        items: (options.mediaSource.urls ?? []).map((url) => ({ url })),
      };
    }

    const response = await client.post('/pins', body);
    return this.mapPinResult(response.data);
  }

  async getPin(pinId: string): Promise<PinResult> {
    const client = this.requireClient();
    const response = await client.get(`/pins/${pinId}`);
    return this.mapPinResult(response.data);
  }

  async deletePin(pinId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/pins/${pinId}`);
  }

  // ── Boards ──

  async createBoard(options: BoardOptions): Promise<BoardResult> {
    const client = this.requireClient();
    const response = await client.post('/boards', {
      name: options.name,
      description: options.description,
      privacy: options.privacy ?? 'PUBLIC',
    });
    return this.mapBoardResult(response.data);
  }

  async getBoards(): Promise<BoardResult[]> {
    const client = this.requireClient();
    const response = await client.get('/boards', {
      params: { page_size: 25 },
    });
    return (response.data.items ?? []).map((b: any) => this.mapBoardResult(b));
  }

  async getBoardPins(boardId: string, maxResults: number = 25): Promise<PinResult[]> {
    const client = this.requireClient();
    const response = await client.get(`/boards/${boardId}/pins`, {
      params: { page_size: Math.min(maxResults, 100) },
    });
    return (response.data.items ?? []).map((p: any) => this.mapPinResult(p));
  }

  async deleteBoard(boardId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/boards/${boardId}`);
  }

  // ── Search ──

  async searchPins(options: SearchOptions): Promise<PinResult[]> {
    const client = this.requireClient();
    const response = await client.get('/search/pins', {
      params: {
        query: options.query,
        page_size: Math.min(options.maxResults ?? 10, 100),
        bookmark: options.bookmark,
      },
    });
    return (response.data.items ?? []).map((p: any) => this.mapPinResult(p));
  }

  async searchBoards(options: SearchOptions): Promise<BoardResult[]> {
    const client = this.requireClient();
    const response = await client.get('/search/boards', {
      params: {
        query: options.query,
        page_size: Math.min(options.maxResults ?? 10, 100),
        bookmark: options.bookmark,
      },
    });
    return (response.data.items ?? []).map((b: any) => this.mapBoardResult(b));
  }

  // ── Trending ──

  async getTrending(region: string = 'US', maxResults: number = 20): Promise<TrendingResult[]> {
    const client = this.requireClient();
    const response = await client.get('/trends/pins', {
      params: { region, page_size: Math.min(maxResults, 50) },
    });
    return (response.data.trends ?? []).map((t: any, index: number) => ({
      keyword: t.keyword ?? t.query ?? '',
      rank: index + 1,
      normalizedRank: t.normalized_rank,
      region,
    }));
  }

  // ── Analytics ──

  async getPinAnalytics(
    pinId: string,
    startDate: string,
    endDate: string,
    metricTypes: string[] = ['IMPRESSION', 'SAVE', 'PIN_CLICK', 'CLOSEUP'],
  ): Promise<AnalyticsResult> {
    const client = this.requireClient();
    const response = await client.get(`/pins/${pinId}/analytics`, {
      params: {
        start_date: startDate,
        end_date: endDate,
        metric_types: metricTypes.join(','),
      },
    });

    const data = response.data;
    return {
      id: pinId,
      type: 'pin',
      metrics: {
        impressions: this.sumMetric(data, 'IMPRESSION'),
        saves: this.sumMetric(data, 'SAVE'),
        clicks: this.sumMetric(data, 'PIN_CLICK'),
        closeups: this.sumMetric(data, 'CLOSEUP'),
      },
      dateRange: { start: startDate, end: endDate },
    };
  }

  async getBoardAnalytics(
    boardId: string,
    startDate: string,
    endDate: string,
  ): Promise<AnalyticsResult> {
    const client = this.requireClient();
    const response = await client.get(`/boards/${boardId}/analytics`, {
      params: {
        start_date: startDate,
        end_date: endDate,
        metric_types: 'IMPRESSION,SAVE,PIN_CLICK,CLOSEUP',
      },
    });

    const data = response.data;
    return {
      id: boardId,
      type: 'board',
      metrics: {
        impressions: this.sumMetric(data, 'IMPRESSION'),
        saves: this.sumMetric(data, 'SAVE'),
        clicks: this.sumMetric(data, 'PIN_CLICK'),
        closeups: this.sumMetric(data, 'CLOSEUP'),
      },
      dateRange: { start: startDate, end: endDate },
    };
  }

  // ── User Info ──

  async getMe(): Promise<{ username: string; accountType: string; websiteUrl?: string }> {
    const client = this.requireClient();
    const response = await client.get('/user_account');
    return {
      username: response.data.username,
      accountType: response.data.account_type,
      websiteUrl: response.data.website_url,
    };
  }

  // ── Internal Helpers ──

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('PinterestService not initialized');
    return this.client;
  }

  private mapPinResult(data: any): PinResult {
    return {
      id: data.id,
      title: data.title,
      description: data.description,
      link: data.link,
      boardId: data.board_id,
      createdAt: data.created_at,
      mediaUrl: data.media?.images?.['600x']?.url ?? data.media?.images?.originals?.url,
    };
  }

  private mapBoardResult(data: any): BoardResult {
    return {
      id: data.id,
      name: data.name,
      description: data.description,
      privacy: data.privacy,
      pinCount: data.pin_count,
      followerCount: data.follower_count,
      createdAt: data.created_at,
    };
  }

  private sumMetric(data: any, metricKey: string): number {
    if (!data || !data.all) return 0;
    const metric = data.all[metricKey];
    if (typeof metric === 'number') return metric;
    if (Array.isArray(metric)) return metric.reduce((sum: number, v: number) => sum + v, 0);
    return 0;
  }

  private appendHashtags(description?: string, hashtags?: string[]): string | undefined {
    if (!hashtags?.length) return description;
    const tags = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    return description ? `${description}\n\n${tags}` : tags;
  }
}
