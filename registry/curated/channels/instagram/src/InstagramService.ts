/**
 * @fileoverview Instagram Graph API service layer.
 *
 * Wraps the Instagram Graph API for media publishing, engagement,
 * hashtag research, and analytics. Uses axios for HTTP calls to
 * graph.facebook.com.
 */

import axios, { type AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstagramConfig {
  accessToken: string;
  igUserId?: string;
}

export interface MediaPublishResult {
  id: string;
  permalink?: string;
}

export interface MediaInsights {
  id: string;
  likes: number;
  comments: number;
  reach: number;
  impressions: number;
  saved: number;
  shares: number;
}

export interface HashtagResult {
  id: string;
  name: string;
  mediaCount: number;
}

export interface ExploreResult {
  id: string;
  mediaType: string;
  mediaUrl: string;
  caption: string;
  likeCount: number;
  commentsCount: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InstagramService {
  private client: AxiosInstance | null = null;
  private config: InstagramConfig;
  private igUserId: string = '';
  private running = false;

  constructor(config: InstagramConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.client = axios.create({
      baseURL: 'https://graph.facebook.com/v21.0',
      params: { access_token: this.config.accessToken },
    });

    // Resolve Instagram Business account ID
    if (this.config.igUserId) {
      this.igUserId = this.config.igUserId;
    } else {
      const res = await this.client.get('/me', { params: { fields: 'id' } });
      this.igUserId = res.data.id;
    }

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Media Publishing ──

  async postPhoto(imageUrl: string, caption?: string): Promise<MediaPublishResult> {
    const api = this.requireClient();

    // Step 1: Create media container
    const container = await api.post(`/${this.igUserId}/media`, null, {
      params: { image_url: imageUrl, caption: caption ?? '' },
    });

    // Step 2: Publish
    const result = await api.post(`/${this.igUserId}/media_publish`, null, {
      params: { creation_id: container.data.id },
    });

    return { id: result.data.id };
  }

  async postCarousel(items: { imageUrl: string; caption?: string }[], caption?: string): Promise<MediaPublishResult> {
    const api = this.requireClient();

    // Step 1: Create child containers
    const childIds: string[] = [];
    for (const item of items) {
      const child = await api.post(`/${this.igUserId}/media`, null, {
        params: { image_url: item.imageUrl, is_carousel_item: true },
      });
      childIds.push(child.data.id);
    }

    // Step 2: Create carousel container
    const container = await api.post(`/${this.igUserId}/media`, null, {
      params: {
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption: caption ?? '',
      },
    });

    // Step 3: Publish
    const result = await api.post(`/${this.igUserId}/media_publish`, null, {
      params: { creation_id: container.data.id },
    });

    return { id: result.data.id };
  }

  async postReel(videoUrl: string, caption?: string, coverUrl?: string): Promise<MediaPublishResult> {
    const api = this.requireClient();

    const container = await api.post(`/${this.igUserId}/media`, null, {
      params: {
        media_type: 'REELS',
        video_url: videoUrl,
        caption: caption ?? '',
        ...(coverUrl ? { cover_url: coverUrl } : {}),
      },
    });

    // Wait for processing
    await this.waitForMediaReady(container.data.id);

    const result = await api.post(`/${this.igUserId}/media_publish`, null, {
      params: { creation_id: container.data.id },
    });

    return { id: result.data.id };
  }

  async postStory(imageUrl: string): Promise<MediaPublishResult> {
    const api = this.requireClient();

    const container = await api.post(`/${this.igUserId}/media`, null, {
      params: { image_url: imageUrl, media_type: 'STORIES' },
    });

    const result = await api.post(`/${this.igUserId}/media_publish`, null, {
      params: { creation_id: container.data.id },
    });

    return { id: result.data.id };
  }

  // ── Engagement ──

  async likeMedia(mediaId: string): Promise<void> {
    // Note: Graph API doesn't support liking — this would need browser automation
    // For now we log the intent
    console.log(`[InstagramService] Like requested for ${mediaId} — requires browser automation`);
  }

  async commentOnMedia(mediaId: string, text: string): Promise<{ id: string }> {
    const api = this.requireClient();
    const res = await api.post(`/${mediaId}/comments`, null, {
      params: { message: text },
    });
    return { id: res.data.id };
  }

  // ── Hashtag Research ──

  async searchHashtag(name: string): Promise<HashtagResult | null> {
    const api = this.requireClient();
    const res = await api.get('/ig_hashtag_search', {
      params: { q: name, user_id: this.igUserId },
    });
    const data = res.data.data?.[0];
    if (!data) return null;
    return { id: data.id, name, mediaCount: 0 };
  }

  async getHashtagTopMedia(hashtagId: string): Promise<ExploreResult[]> {
    const api = this.requireClient();
    const res = await api.get(`/${hashtagId}/top_media`, {
      params: { user_id: this.igUserId, fields: 'id,media_type,media_url,caption,like_count,comments_count,timestamp' },
    });
    return (res.data.data ?? []).map((m: any) => ({
      id: m.id,
      mediaType: m.media_type,
      mediaUrl: m.media_url ?? '',
      caption: m.caption ?? '',
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0,
      timestamp: m.timestamp ?? '',
    }));
  }

  // ── Analytics ──

  async getMediaInsights(mediaId: string): Promise<MediaInsights> {
    const api = this.requireClient();
    const res = await api.get(`/${mediaId}`, {
      params: { fields: 'id,like_count,comments_count' },
    });

    let reach = 0, impressions = 0, saved = 0, shares = 0;
    try {
      const insights = await api.get(`/${mediaId}/insights`, {
        params: { metric: 'reach,impressions,saved,shares' },
      });
      for (const m of insights.data.data ?? []) {
        if (m.name === 'reach') reach = m.values?.[0]?.value ?? 0;
        if (m.name === 'impressions') impressions = m.values?.[0]?.value ?? 0;
        if (m.name === 'saved') saved = m.values?.[0]?.value ?? 0;
        if (m.name === 'shares') shares = m.values?.[0]?.value ?? 0;
      }
    } catch {
      // Insights may not be available for all media types
    }

    return {
      id: res.data.id,
      likes: res.data.like_count ?? 0,
      comments: res.data.comments_count ?? 0,
      reach,
      impressions,
      saved,
      shares,
    };
  }

  async getAccountInsights(): Promise<{ followers: number; mediaCount: number; followsCount: number }> {
    const api = this.requireClient();
    const res = await api.get(`/${this.igUserId}`, {
      params: { fields: 'followers_count,media_count,follows_count' },
    });
    return {
      followers: res.data.followers_count ?? 0,
      mediaCount: res.data.media_count ?? 0,
      followsCount: res.data.follows_count ?? 0,
    };
  }

  // ── User Feed ──

  async getRecentMedia(limit: number = 20): Promise<ExploreResult[]> {
    const api = this.requireClient();
    const res = await api.get(`/${this.igUserId}/media`, {
      params: { fields: 'id,media_type,media_url,caption,like_count,comments_count,timestamp', limit },
    });
    return (res.data.data ?? []).map((m: any) => ({
      id: m.id,
      mediaType: m.media_type,
      mediaUrl: m.media_url ?? '',
      caption: m.caption ?? '',
      likeCount: m.like_count ?? 0,
      commentsCount: m.comments_count ?? 0,
      timestamp: m.timestamp ?? '',
    }));
  }

  // ── Internal ──

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Instagram service not initialized');
    return this.client;
  }

  private async waitForMediaReady(containerId: string, maxWait = 60000): Promise<void> {
    const api = this.requireClient();
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      const res = await api.get(`/${containerId}`, { params: { fields: 'status_code' } });
      if (res.data.status_code === 'FINISHED') return;
      if (res.data.status_code === 'ERROR') throw new Error('Media processing failed');
      await new Promise((r) => setTimeout(r, 3000));
    }

    throw new Error('Media processing timed out');
  }
}
