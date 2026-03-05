/**
 * @fileoverview Meta Graph API v19 service layer for Facebook.
 *
 * Wraps the Meta Graph API for page posts, photo/video uploads,
 * comments, likes, shares, search, analytics, and scheduling.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FacebookConfig {
  accessToken?: string;
  pageId?: string;
  pageAccessToken?: string;
}

export interface PostOptions {
  message: string;
  link?: string;
  photoUrl?: string;
  videoUrl?: string;
  published?: boolean;
  scheduledTime?: number;
}

export interface SearchOptions {
  query: string;
  type?: 'post' | 'page' | 'group';
  limit?: number;
}

export interface PostResult {
  id: string;
  message?: string;
  createdTime?: string;
  permalink?: string;
}

export interface AnalyticsResult {
  postId: string;
  impressions?: number;
  engagedUsers?: number;
  clicks?: number;
  reactions?: number;
}

export interface PageInfo {
  id: string;
  name: string;
  accessToken: string;
  category?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class FacebookService {
  private client: AxiosInstance | null = null;
  private config: FacebookConfig;
  private running = false;

  constructor(config: FacebookConfig) {
    this.config = config;
  }

  /** Set up axios with Bearer token and Graph API base URL. */
  async initialize(): Promise<void> {
    const token = this.config.accessToken;
    if (!token) {
      throw new Error(
        'Facebook: no access token provided. Set FACEBOOK_ACCESS_TOKEN '
        + 'or pass accessToken in the extension config.',
      );
    }

    this.client = axios.create({
      baseURL: 'https://graph.facebook.com/v19.0',
      headers: { Authorization: `Bearer ${token}` },
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

  // ── Profile ──

  /** GET /me — retrieve authenticated user profile. */
  async getProfile(): Promise<{ id: string; name: string }> {
    const client = this.requireClient();
    const res = await client.get('/me', { params: { fields: 'id,name' } });
    return { id: res.data.id, name: res.data.name };
  }

  // ── Pages ──

  /** GET /me/accounts — list managed pages with their access tokens. */
  async getPages(): Promise<PageInfo[]> {
    const client = this.requireClient();
    const res = await client.get('/me/accounts', {
      params: { fields: 'id,name,access_token,category' },
    });
    return (res.data.data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      category: p.category,
    }));
  }

  // ── Posting ──

  /**
   * Post to a managed page. Supports text, links, photos, videos, and scheduling.
   * Uses the page access token if available, otherwise falls back to user token.
   */
  async postToPage(pageId: string, options: PostOptions): Promise<PostResult> {
    const client = this.requireClient();
    const token = this.config.pageAccessToken ?? this.config.accessToken;

    // Photo upload
    if (options.photoUrl) {
      const res = await client.post(`/${pageId}/photos`, null, {
        params: {
          url: options.photoUrl,
          caption: options.message,
          access_token: token,
        },
      });
      return { id: res.data.id, message: options.message };
    }

    // Video upload
    if (options.videoUrl) {
      const res = await client.post(`/${pageId}/videos`, null, {
        params: {
          file_url: options.videoUrl,
          description: options.message,
          access_token: token,
        },
      });
      return { id: res.data.id, message: options.message };
    }

    // Text/link post
    const params: Record<string, any> = {
      message: options.message,
      access_token: token,
    };
    if (options.link) params.link = options.link;
    if (options.published === false) params.published = false;
    if (options.scheduledTime) params.scheduled_publish_time = options.scheduledTime;

    const res = await client.post(`/${pageId}/feed`, null, { params });
    return { id: res.data.id, message: options.message };
  }

  /** Post to the authenticated user's personal profile. */
  async postToProfile(options: { message: string; link?: string }): Promise<PostResult> {
    const client = this.requireClient();
    const params: Record<string, any> = { message: options.message };
    if (options.link) params.link = options.link;

    const res = await client.post('/me/feed', null, { params });
    return { id: res.data.id, message: options.message };
  }

  // ── Engagement ──

  /** POST /{postId}/comments — add a comment to a post. */
  async commentOnPost(postId: string, text: string): Promise<{ id: string }> {
    const client = this.requireClient();
    const res = await client.post(`/${postId}/comments`, null, {
      params: { message: text },
    });
    return { id: res.data.id };
  }

  /** POST /{postId}/likes — like a post. */
  async likePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.post(`/${postId}/likes`);
  }

  /** DELETE /{postId}/likes — unlike a post. */
  async unlikePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/${postId}/likes`);
  }

  /**
   * Share a post by creating a new feed post containing the link.
   * Graph API does not have a native reshare endpoint, so we post with a permalink.
   */
  async sharePost(postId: string, message?: string): Promise<PostResult> {
    const client = this.requireClient();
    const link = `https://www.facebook.com/${postId}`;
    const params: Record<string, any> = { link };
    if (message) params.message = message;

    const res = await client.post('/me/feed', null, { params });
    return { id: res.data.id, message, permalink: link };
  }

  // ── Search ──

  /**
   * GET /search — search for posts, pages, or groups.
   * Note: Meta has significantly restricted search API access.
   */
  async searchPosts(query: string, type: string = 'post', limit: number = 10): Promise<any[]> {
    const client = this.requireClient();
    const res = await client.get('/search', {
      params: { q: query, type, limit },
    });
    return res.data.data ?? [];
  }

  // ── Analytics ──

  /** GET /{postId}/insights — retrieve engagement metrics for a page post. */
  async getPostAnalytics(postId: string): Promise<AnalyticsResult> {
    const client = this.requireClient();
    const token = this.config.pageAccessToken ?? this.config.accessToken;
    const res = await client.get(`/${postId}/insights`, {
      params: {
        metric: 'post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total',
        access_token: token,
      },
    });

    const metrics = res.data.data ?? [];
    const findMetric = (name: string): number | undefined => {
      const m = metrics.find((item: any) => item.name === name);
      return m?.values?.[0]?.value;
    };

    return {
      postId,
      impressions: findMetric('post_impressions'),
      engagedUsers: findMetric('post_engaged_users'),
      clicks: findMetric('post_clicks'),
      reactions: findMetric('post_reactions_by_type_total'),
    };
  }

  // ── Delete ──

  /** DELETE /{postId} — delete a post. */
  async deletePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/${postId}`);
  }

  // ── Media Upload ──

  /** POST /{pageId}/photos — upload a photo to a page. */
  async uploadPhoto(pageId: string, imageUrl: string, caption?: string): Promise<{ id: string }> {
    const client = this.requireClient();
    const token = this.config.pageAccessToken ?? this.config.accessToken;
    const params: Record<string, any> = {
      url: imageUrl,
      access_token: token,
    };
    if (caption) params.caption = caption;

    const res = await client.post(`/${pageId}/photos`, null, { params });
    return { id: res.data.id };
  }

  /** POST /{pageId}/videos — upload a video to a page. */
  async uploadVideo(pageId: string, videoUrl: string, description?: string): Promise<{ id: string }> {
    const client = this.requireClient();
    const token = this.config.pageAccessToken ?? this.config.accessToken;
    const params: Record<string, any> = {
      file_url: videoUrl,
      access_token: token,
    };
    if (description) params.description = description;

    const res = await client.post(`/${pageId}/videos`, null, { params });
    return { id: res.data.id };
  }

  // ── Internal ──

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Facebook service not initialized');
    return this.client;
  }
}
