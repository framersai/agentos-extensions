/**
 * @fileoverview Google Business Profile API service layer.
 *
 * Wraps the Google My Business API v1 for local post creation,
 * review management, insights, and business info updates.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleBusinessConfig {
  accessToken: string;
  refreshToken?: string;
  locationId?: string;
}

export interface LocalPostOptions {
  summary: string;
  topicType?: 'STANDARD' | 'EVENT' | 'OFFER';
  callToAction?: { actionType: string; url: string };
  media?: { mediaFormat: string; sourceUrl: string };
}

export interface LocalPostResult {
  name: string;
  summary: string;
  topicType?: string;
  state?: string;
  createTime?: string;
}

export interface ReviewResult {
  name: string;
  reviewId: string;
  reviewer: { displayName: string; profilePhotoUrl?: string };
  starRating: string;
  comment?: string;
  createTime?: string;
  updateTime?: string;
  reviewReply?: { comment: string; updateTime?: string };
}

export interface InsightsResult {
  locationName: string;
  metrics: Array<{ metric: string; totalValue?: any; dimensionalValues?: any[] }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class GoogleBusinessService {
  private client: AxiosInstance | null = null;
  private config: GoogleBusinessConfig;
  private running = false;

  constructor(config: GoogleBusinessConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.accessToken) {
      throw new Error(
        'Google Business: no access token provided. Set GOOGLE_ACCESS_TOKEN or provide accessToken in config.',
      );
    }

    this.client = axios.create({
      baseURL: 'https://mybusinessbusinessinformation.googleapis.com/v1',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
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

  // -- Locations --

  async getLocations(accountId?: string): Promise<Array<{ name: string; locationName: string; title: string }>> {
    const client = this.requireClient();
    const account = accountId ?? 'accounts/me';
    const response = await client.get(`/${account}/locations`);
    return (response.data?.locations ?? []).map((loc: any) => ({
      name: loc.name,
      locationName: loc.locationName ?? loc.name,
      title: loc.title ?? loc.storeCode ?? '',
    }));
  }

  // -- Local Posts --

  async createLocalPost(locationName: string, options: LocalPostOptions): Promise<LocalPostResult> {
    const client = this.requireClient();
    const body: Record<string, unknown> = {
      summary: options.summary,
      topicType: options.topicType ?? 'STANDARD',
      languageCode: 'en',
    };

    if (options.callToAction) {
      body.callToAction = options.callToAction;
    }
    if (options.media) {
      body.media = [options.media];
    }

    const response = await client.post(`/${locationName}/localPosts`, body);
    const post = response.data;
    return {
      name: post.name,
      summary: post.summary ?? options.summary,
      topicType: post.topicType,
      state: post.state,
      createTime: post.createTime,
    };
  }

  async deleteLocalPost(postName: string): Promise<void> {
    const client = this.requireClient();
    await client.delete(`/${postName}`);
  }

  // -- Reviews --

  async getReviews(locationName: string): Promise<ReviewResult[]> {
    const client = this.requireClient();
    const response = await client.get(`/${locationName}/reviews`);
    return (response.data?.reviews ?? []).map((r: any) => ({
      name: r.name,
      reviewId: r.reviewId,
      reviewer: {
        displayName: r.reviewer?.displayName ?? 'Anonymous',
        profilePhotoUrl: r.reviewer?.profilePhotoUrl,
      },
      starRating: r.starRating,
      comment: r.comment,
      createTime: r.createTime,
      updateTime: r.updateTime,
      reviewReply: r.reviewReply ? {
        comment: r.reviewReply.comment,
        updateTime: r.reviewReply.updateTime,
      } : undefined,
    }));
  }

  async replyToReview(reviewName: string, comment: string): Promise<void> {
    const client = this.requireClient();
    await client.put(`/${reviewName}/reply`, { comment });
  }

  // -- Insights --

  async getInsights(locationName: string, metrics: string[]): Promise<InsightsResult> {
    const client = this.requireClient();
    const response = await client.post(`/${locationName}:reportInsights`, {
      locationNames: [locationName],
      basicRequest: {
        metricRequests: metrics.map((m) => ({ metric: m })),
        timeRange: {
          startTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date().toISOString(),
        },
      },
    });

    const report = response.data?.locationMetrics?.[0] ?? response.data;
    return {
      locationName,
      metrics: (report?.metricValues ?? []).map((mv: any) => ({
        metric: mv.metric,
        totalValue: mv.totalValue,
        dimensionalValues: mv.dimensionalValues,
      })),
    };
  }

  // -- Business Info --

  async updateBusinessInfo(
    locationName: string,
    updates: { description?: string; websiteUri?: string; phoneNumbers?: any },
  ): Promise<void> {
    const client = this.requireClient();
    const updateMask: string[] = [];
    const body: Record<string, unknown> = {};

    if (updates.description !== undefined) {
      body.profile = { description: updates.description };
      updateMask.push('profile.description');
    }
    if (updates.websiteUri !== undefined) {
      body.websiteUri = updates.websiteUri;
      updateMask.push('websiteUri');
    }
    if (updates.phoneNumbers !== undefined) {
      body.phoneNumbers = updates.phoneNumbers;
      updateMask.push('phoneNumbers');
    }

    await client.patch(`/${locationName}`, body, {
      params: { updateMask: updateMask.join(',') },
    });
  }

  // -- Internal --

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Google Business service not initialized');
    return this.client;
  }
}
