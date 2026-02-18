/**
 * @fileoverview TikTok API for Business service layer.
 *
 * Wraps TikTok API for Business via axios for video upload,
 * trending content, search, analytics, engagement, and discovery.
 */

import axios, { type AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TikTokConfig {
  accessToken: string;
  username?: string;
  password?: string;
}

export interface VideoUploadOptions {
  videoUrl: string;
  caption: string;
  hashtags?: string[];
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
  coverTimestampMs?: number;
}

export interface VideoResult {
  id: string;
  title?: string;
  caption?: string;
  createTime?: number;
  coverUrl?: string;
  shareUrl?: string;
  duration?: number;
  metrics?: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
  };
}

export interface SearchOptions {
  query: string;
  type?: 'video' | 'user';
  maxResults?: number;
  cursor?: number;
}

export interface TrendingResult {
  type: 'hashtag' | 'sound';
  name: string;
  id?: string;
  videoCount?: number;
  viewCount?: number;
}

export interface AnalyticsResult {
  videoId: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    avgWatchTime?: number;
    totalWatchTime?: number;
    reach?: number;
    fullVideoWatchedRate?: number;
  };
  dateRange?: { start: string; end: string };
}

export interface CreatorResult {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  followerCount?: number;
  followingCount?: number;
  likeCount?: number;
  videoCount?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const BASE_URL = 'https://open.tiktokapis.com/v2';

export class TikTokService {
  private client: AxiosInstance | null = null;
  private running = false;
  private readonly config: TikTokConfig;

  constructor(config: TikTokConfig) {
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
      timeout: 60_000,
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

  // ── Video Upload ──

  async uploadVideo(options: VideoUploadOptions): Promise<VideoResult> {
    const client = this.requireClient();

    const caption = this.appendHashtags(options.caption, options.hashtags);

    // Step 1: Initialize upload
    const initResponse = await client.post('/post/publish/inbox/video/init/', {
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.videoUrl,
      },
    });

    const publishId = initResponse.data.data?.publish_id;

    // Step 2: Publish with metadata
    const publishResponse = await client.post('/post/publish/video/init/', {
      post_info: {
        title: caption,
        privacy_level: options.privacyLevel ?? 'PUBLIC_TO_EVERYONE',
        disable_comment: options.disableComment ?? false,
        disable_duet: options.disableDuet ?? false,
        disable_stitch: options.disableStitch ?? false,
        video_cover_timestamp_ms: options.coverTimestampMs ?? 0,
      },
      source_info: {
        source: 'PULL_FROM_URL',
        video_url: options.videoUrl,
      },
    });

    const data = publishResponse.data.data ?? {};
    return {
      id: data.publish_id ?? publishId ?? '',
      caption,
      shareUrl: data.share_url,
    };
  }

  // ── Trending ──

  async getTrendingHashtags(maxResults: number = 20): Promise<TrendingResult[]> {
    const client = this.requireClient();
    const response = await client.post('/research/hashtag/query/', {
      max_count: Math.min(maxResults, 100),
    });

    return (response.data.data?.hashtags ?? []).map((h: any) => ({
      type: 'hashtag' as const,
      name: h.hashtag_name ?? h.name ?? '',
      id: h.id,
      videoCount: h.video_count,
      viewCount: h.view_count,
    }));
  }

  async getTrendingSounds(maxResults: number = 20): Promise<TrendingResult[]> {
    const client = this.requireClient();
    const response = await client.post('/research/music/query/', {
      max_count: Math.min(maxResults, 100),
    });

    return (response.data.data?.sounds ?? response.data.data?.music ?? []).map((s: any) => ({
      type: 'sound' as const,
      name: s.title ?? s.name ?? '',
      id: s.id,
      videoCount: s.video_count,
    }));
  }

  // ── Search ──

  async searchVideos(options: SearchOptions): Promise<VideoResult[]> {
    const client = this.requireClient();
    const response = await client.post('/research/video/query/', {
      query: {
        and: [{ operation: 'IN', field_name: 'keyword', field_values: [options.query] }],
      },
      max_count: Math.min(options.maxResults ?? 10, 100),
      cursor: options.cursor ?? 0,
    });

    return (response.data.data?.videos ?? []).map((v: any) => this.mapVideoResult(v));
  }

  async searchUsers(query: string, maxResults: number = 10): Promise<CreatorResult[]> {
    const client = this.requireClient();
    const response = await client.post('/research/user/query/', {
      query: {
        and: [{ operation: 'IN', field_name: 'keyword', field_values: [query] }],
      },
      max_count: Math.min(maxResults, 100),
    });

    return (response.data.data?.users ?? []).map((u: any) => ({
      id: u.id ?? u.open_id ?? '',
      username: u.username ?? '',
      displayName: u.display_name,
      avatarUrl: u.avatar_url,
      followerCount: u.follower_count,
      followingCount: u.following_count,
      likeCount: u.likes_count ?? u.like_count,
      videoCount: u.video_count,
    }));
  }

  // ── Analytics ──

  async getVideoAnalytics(videoId: string): Promise<AnalyticsResult> {
    const client = this.requireClient();
    const response = await client.post('/video/query/', {
      filters: { video_ids: [videoId] },
      fields: [
        'id', 'title', 'video_description', 'create_time',
        'like_count', 'comment_count', 'share_count', 'view_count',
      ],
    });

    const video = response.data.data?.videos?.[0] ?? {};
    return {
      videoId,
      metrics: {
        views: video.view_count ?? 0,
        likes: video.like_count ?? 0,
        comments: video.comment_count ?? 0,
        shares: video.share_count ?? 0,
      },
    };
  }

  async getCreatorAnalytics(): Promise<{
    followerCount: number;
    followingCount: number;
    likeCount: number;
    videoCount: number;
  }> {
    const client = this.requireClient();
    const response = await client.get('/user/info/', {
      params: { fields: 'follower_count,following_count,likes_count,video_count' },
    });

    const data = response.data.data?.user ?? {};
    return {
      followerCount: data.follower_count ?? 0,
      followingCount: data.following_count ?? 0,
      likeCount: data.likes_count ?? 0,
      videoCount: data.video_count ?? 0,
    };
  }

  // ── Engagement ──

  async likeVideo(videoId: string): Promise<void> {
    const client = this.requireClient();
    await client.post('/video/like/', { video_id: videoId });
  }

  async commentOnVideo(videoId: string, text: string): Promise<{ commentId: string }> {
    const client = this.requireClient();
    const response = await client.post('/video/comment/', {
      video_id: videoId,
      text,
    });
    return { commentId: response.data.data?.comment_id ?? '' };
  }

  // ── Discovery (For You) ──

  async getRecommendedVideos(maxResults: number = 20): Promise<VideoResult[]> {
    const client = this.requireClient();
    const response = await client.post('/video/list/', {
      max_count: Math.min(maxResults, 20),
      fields: ['id', 'title', 'video_description', 'create_time', 'cover_image_url', 'share_url', 'duration', 'like_count', 'comment_count', 'share_count', 'view_count'],
    });

    return (response.data.data?.videos ?? []).map((v: any) => this.mapVideoResult(v));
  }

  // ── User Info ──

  async getMe(): Promise<CreatorResult> {
    const client = this.requireClient();
    const response = await client.get('/user/info/', {
      params: { fields: 'open_id,union_id,avatar_url,display_name,username,follower_count,following_count,likes_count,video_count' },
    });
    const data = response.data.data?.user ?? {};
    return {
      id: data.open_id ?? '',
      username: data.username ?? '',
      displayName: data.display_name,
      avatarUrl: data.avatar_url,
      followerCount: data.follower_count,
      followingCount: data.following_count,
      likeCount: data.likes_count,
      videoCount: data.video_count,
    };
  }

  // ── Internal Helpers ──

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('TikTokService not initialized');
    return this.client;
  }

  private mapVideoResult(data: any): VideoResult {
    return {
      id: data.id ?? data.video_id ?? '',
      title: data.title,
      caption: data.video_description ?? data.caption,
      createTime: data.create_time,
      coverUrl: data.cover_image_url,
      shareUrl: data.share_url,
      duration: data.duration,
      metrics: {
        views: data.view_count ?? 0,
        likes: data.like_count ?? 0,
        comments: data.comment_count ?? 0,
        shares: data.share_count ?? 0,
      },
    };
  }

  private appendHashtags(caption: string, hashtags?: string[]): string {
    if (!hashtags?.length) return caption;
    const tags = hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
    return `${caption} ${tags}`;
  }
}
