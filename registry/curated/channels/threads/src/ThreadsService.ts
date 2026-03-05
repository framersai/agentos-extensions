/**
 * @fileoverview Threads API service layer.
 *
 * Wraps Meta's Threads Publishing API via axios for posting text, images,
 * videos, carousels, replies, quotes, likes, and analytics.
 *
 * The Threads API uses a container + publish pattern similar to Instagram:
 *  1. Create a media container (POST /{userId}/threads)
 *  2. Optionally poll until container status is FINISHED
 *  3. Publish the container (POST /{userId}/threads_publish)
 */

import axios, { type AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThreadsConfig {
  accessToken: string;
  userId?: string;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  threadsProfilePictureUrl?: string;
}

export interface ThreadsPostResult {
  id: string;
  text?: string;
  timestamp?: string;
  mediaUrl?: string;
  permalink?: string;
}

export interface ThreadsInsights {
  postId: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}

export interface CarouselItem {
  type: 'IMAGE' | 'VIDEO';
  url: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ThreadsService {
  private client: AxiosInstance | null = null;
  private config: ThreadsConfig;
  private userId: string | null = null;
  private running = false;

  constructor(config: ThreadsConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.accessToken) {
      throw new Error(
        'Threads: no access token provided. Set THREADS_ACCESS_TOKEN or META_ACCESS_TOKEN.',
      );
    }

    this.client = axios.create({
      baseURL: 'https://graph.threads.net/v1.0',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // Resolve user ID — either from config or from /me endpoint
    if (this.config.userId) {
      this.userId = this.config.userId;
    } else {
      const profile = await this.getProfile();
      this.userId = profile.id;
    }

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.userId = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Profile ──

  async getProfile(): Promise<ThreadsProfile> {
    const client = this.requireClient();
    const { data } = await client.get('/me', {
      params: { fields: 'id,username,threads_profile_picture_url' },
    });
    return {
      id: data.id,
      username: data.username,
      threadsProfilePictureUrl: data.threads_profile_picture_url,
    };
  }

  // ── Text Post ──

  async createTextPost(text: string): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    // Step 1: Create container
    const { data: container } = await client.post(`/${userId}/threads`, null, {
      params: { media_type: 'TEXT', text },
    });

    // Step 2: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: container.id },
    });

    return { id: published.id, text };
  }

  // ── Image Post ──

  async createImagePost(text: string, imageUrl: string): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    // Step 1: Create container
    const { data: container } = await client.post(`/${userId}/threads`, null, {
      params: { media_type: 'IMAGE', text, image_url: imageUrl },
    });

    // Step 2: Poll for FINISHED status
    await this.pollContainerStatus(container.id);

    // Step 3: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: container.id },
    });

    return { id: published.id, text, mediaUrl: imageUrl };
  }

  // ── Video Post ──

  async createVideoPost(text: string, videoUrl: string): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    // Step 1: Create container
    const { data: container } = await client.post(`/${userId}/threads`, null, {
      params: { media_type: 'VIDEO', text, video_url: videoUrl },
    });

    // Step 2: Poll for FINISHED status (videos take longer)
    await this.pollContainerStatus(container.id, 30, 2000);

    // Step 3: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: container.id },
    });

    return { id: published.id, text, mediaUrl: videoUrl };
  }

  // ── Carousel Post ──

  async createCarouselPost(text: string, items: CarouselItem[]): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    // Step 1: Create child containers for each item
    const childIds: string[] = [];
    for (const item of items) {
      const params: Record<string, string> = {
        media_type: item.type,
        is_carousel_item: 'true',
      };
      if (item.type === 'IMAGE') {
        params.image_url = item.url;
      } else {
        params.video_url = item.url;
      }

      const { data: child } = await client.post(`/${userId}/threads`, null, { params });
      await this.pollContainerStatus(child.id);
      childIds.push(child.id);
    }

    // Step 2: Create carousel container
    const { data: carousel } = await client.post(`/${userId}/threads`, null, {
      params: {
        media_type: 'CAROUSEL',
        text,
        children: childIds.join(','),
      },
    });

    // Step 3: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: carousel.id },
    });

    return { id: published.id, text };
  }

  // ── Reply ──

  async replyToPost(postId: string, text: string, mediaUrl?: string): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    const params: Record<string, string> = {
      media_type: mediaUrl ? (this.isVideoUrl(mediaUrl) ? 'VIDEO' : 'IMAGE') : 'TEXT',
      text,
      reply_to_id: postId,
    };

    if (mediaUrl) {
      if (this.isVideoUrl(mediaUrl)) {
        params.video_url = mediaUrl;
      } else {
        params.image_url = mediaUrl;
      }
    }

    // Step 1: Create reply container
    const { data: container } = await client.post(`/${userId}/threads`, null, { params });

    // Step 2: Poll if media attached
    if (mediaUrl) {
      await this.pollContainerStatus(container.id);
    }

    // Step 3: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: container.id },
    });

    return { id: published.id, text };
  }

  // ── Like ──

  async likePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.post(`/${postId}/likes`);
  }

  async unlikePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/${postId}/likes`);
  }

  // ── Quote ──

  async quotePost(postId: string, text: string): Promise<ThreadsPostResult> {
    const client = this.requireClient();
    const userId = this.requireUserId();

    // Step 1: Create quote container
    const { data: container } = await client.post(`/${userId}/threads`, null, {
      params: { media_type: 'TEXT', text, quote_post_id: postId },
    });

    // Step 2: Publish
    const { data: published } = await client.post(`/${userId}/threads_publish`, null, {
      params: { creation_id: container.id },
    });

    return { id: published.id, text };
  }

  // ── User Threads (Search substitute) ──

  async getUserThreads(userId?: string, limit: number = 25): Promise<ThreadsPostResult[]> {
    const client = this.requireClient();
    const targetId = userId ?? this.requireUserId();

    const { data } = await client.get(`/${targetId}/threads`, {
      params: {
        fields: 'id,text,timestamp,media_url,permalink',
        limit: Math.min(limit, 100),
      },
    });

    return (data.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      timestamp: t.timestamp,
      mediaUrl: t.media_url,
      permalink: t.permalink,
    }));
  }

  // ── Insights / Analytics ──

  async getPostInsights(postId: string): Promise<ThreadsInsights> {
    const client = this.requireClient();

    const { data } = await client.get(`/${postId}/insights`, {
      params: { metric: 'views,likes,replies,reposts,quotes' },
    });

    const metrics: Record<string, number> = {};
    for (const entry of data.data ?? []) {
      metrics[entry.name] = entry.values?.[0]?.value ?? 0;
    }

    return {
      postId,
      views: metrics.views ?? 0,
      likes: metrics.likes ?? 0,
      replies: metrics.replies ?? 0,
      reposts: metrics.reposts ?? 0,
      quotes: metrics.quotes ?? 0,
    };
  }

  // ── Delete ──

  async deletePost(postId: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/${postId}`);
  }

  // ── Internal Helpers ──

  private async pollContainerStatus(
    containerId: string,
    maxAttempts: number = 20,
    intervalMs: number = 1000,
  ): Promise<void> {
    const client = this.requireClient();

    for (let i = 0; i < maxAttempts; i++) {
      const { data } = await client.get(`/${containerId}`, {
        params: { fields: 'status,error_message' },
      });

      if (data.status === 'FINISHED') return;

      if (data.status === 'ERROR') {
        throw new Error(`Threads container error: ${data.error_message ?? 'Unknown error'}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Threads container ${containerId} did not reach FINISHED status after ${maxAttempts} attempts`);
  }

  private isVideoUrl(url: string): boolean {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
    const lower = url.toLowerCase();
    return videoExtensions.some((ext) => lower.includes(ext));
  }

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Threads service not initialized');
    return this.client;
  }

  private requireUserId(): string {
    if (!this.userId) throw new Error('Threads user ID not resolved — call initialize() first');
    return this.userId;
  }
}
