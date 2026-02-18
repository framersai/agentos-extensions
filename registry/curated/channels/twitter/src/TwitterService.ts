/**
 * @fileoverview Twitter API v2 service layer.
 *
 * Wraps twitter-api-v2 for tweet posting, engagement, search,
 * trending, DMs, and analytics.
 */

import { TwitterApi } from 'twitter-api-v2';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TwitterConfig {
  bearerToken: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
}

export interface TweetOptions {
  text: string;
  mediaIds?: string[];
  pollOptions?: string[];
  pollDurationMinutes?: number;
  replyToId?: string;
  quoteTweetId?: string;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  sortOrder?: 'recency' | 'relevancy';
  startTime?: string;
  endTime?: string;
}

export interface TweetResult {
  id: string;
  text: string;
  authorId?: string;
  createdAt?: string;
  metrics?: {
    likes: number;
    retweets: number;
    replies: number;
    impressions: number;
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class TwitterService {
  private readClient: TwitterApi | null = null;
  private writeClient: TwitterApi | null = null;
  private config: TwitterConfig;
  private running = false;

  constructor(config: TwitterConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    // Read-only client (bearer token)
    this.readClient = new TwitterApi(this.config.bearerToken);

    // Read-write client (OAuth 1.0a user context — needed for posting)
    if (this.config.apiKey && this.config.apiSecret && this.config.accessToken && this.config.accessSecret) {
      this.writeClient = new TwitterApi({
        appKey: this.config.apiKey,
        appSecret: this.config.apiSecret,
        accessToken: this.config.accessToken,
        accessSecret: this.config.accessSecret,
      });
    }

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.readClient = null;
    this.writeClient = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Posting ──

  async postTweet(options: TweetOptions): Promise<TweetResult> {
    const client = this.requireWriteClient();
    const params: any = { text: options.text };

    if (options.mediaIds?.length) {
      params.media = { media_ids: options.mediaIds };
    }
    if (options.pollOptions?.length) {
      params.poll = {
        options: options.pollOptions,
        duration_minutes: options.pollDurationMinutes ?? 1440,
      };
    }
    if (options.replyToId) {
      params.reply = { in_reply_to_tweet_id: options.replyToId };
    }
    if (options.quoteTweetId) {
      params.quote_tweet_id = options.quoteTweetId;
    }

    const result = await client.v2.tweet(params);
    return { id: result.data.id, text: result.data.text };
  }

  async postThread(tweets: string[]): Promise<TweetResult[]> {
    const results: TweetResult[] = [];
    let replyToId: string | undefined;

    for (const text of tweets) {
      const result = await this.postTweet({ text, replyToId });
      results.push(result);
      replyToId = result.id;
    }

    return results;
  }

  // ── Engagement ──

  async like(tweetId: string): Promise<void> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    await client.v2.like(me.data.id, tweetId);
  }

  async unlike(tweetId: string): Promise<void> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    await client.v2.unlike(me.data.id, tweetId);
  }

  async retweet(tweetId: string): Promise<void> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    await client.v2.retweet(me.data.id, tweetId);
  }

  async unretweet(tweetId: string): Promise<void> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    await client.v2.unretweet(me.data.id, tweetId);
  }

  // ── Search ──

  async search(options: SearchOptions): Promise<TweetResult[]> {
    const client = this.requireReadClient();
    const result = await client.v2.search(options.query, {
      max_results: options.maxResults ?? 10,
      sort_order: options.sortOrder ?? 'relevancy',
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      start_time: options.startTime,
      end_time: options.endTime,
    });

    return (result.data?.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      createdAt: t.created_at,
      metrics: t.public_metrics ? {
        likes: t.public_metrics.like_count,
        retweets: t.public_metrics.retweet_count,
        replies: t.public_metrics.reply_count,
        impressions: t.public_metrics.impression_count ?? 0,
      } : undefined,
    }));
  }

  // ── Trending ──

  async getTrending(woeid: number = 1): Promise<{ name: string; tweetVolume: number | null; url: string }[]> {
    const client = this.requireReadClient();
    const result = await client.v1.trendsByPlace(woeid);
    return (result[0]?.trends ?? []).map((t: any) => ({
      name: t.name,
      tweetVolume: t.tweet_volume,
      url: t.url,
    }));
  }

  // ── Timeline ──

  async getTimeline(maxResults: number = 20): Promise<TweetResult[]> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    const result = await client.v2.homeTimeline({
      max_results: Math.min(maxResults, 100),
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
    });

    return (result.data?.data ?? []).map((t: any) => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      createdAt: t.created_at,
      metrics: t.public_metrics ? {
        likes: t.public_metrics.like_count,
        retweets: t.public_metrics.retweet_count,
        replies: t.public_metrics.reply_count,
        impressions: t.public_metrics.impression_count ?? 0,
      } : undefined,
    }));
  }

  // ── DMs ──

  async sendDm(recipientId: string, text: string): Promise<{ eventId: string }> {
    const client = this.requireWriteClient();
    const result = await client.v2.sendDmInConversation(
      `${recipientId}`,
      { text }
    );
    return { eventId: (result as any).dm_event_id ?? '' };
  }

  async getDmEvents(maxResults: number = 20): Promise<any[]> {
    const client = this.requireWriteClient();
    const result = await client.v2.listDmEvents({ max_results: Math.min(maxResults, 100) });
    return result.data?.data ?? [];
  }

  // ── Analytics ──

  async getTweetMetrics(tweetId: string): Promise<TweetResult | null> {
    const client = this.requireReadClient();
    const result = await client.v2.singleTweet(tweetId, {
      'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
    });

    if (!result.data) return null;
    const t = result.data;
    return {
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      createdAt: t.created_at,
      metrics: t.public_metrics ? {
        likes: t.public_metrics.like_count,
        retweets: t.public_metrics.retweet_count,
        replies: t.public_metrics.reply_count,
        impressions: (t.public_metrics as any).impression_count ?? 0,
      } : undefined,
    };
  }

  // ── Media Upload ──

  async uploadMedia(filePath: string, mimeType?: string): Promise<string> {
    const client = this.requireWriteClient();
    const mediaId = await client.v1.uploadMedia(filePath, { mimeType });
    return mediaId;
  }

  // ── Bot Info ──

  async getMe(): Promise<{ id: string; name: string; username: string }> {
    const client = this.requireWriteClient();
    const me = await client.v2.me();
    return { id: me.data.id, name: me.data.name, username: me.data.username };
  }

  // ── Internal ──

  private requireReadClient(): TwitterApi {
    if (!this.readClient) throw new Error('Twitter service not initialized');
    return this.readClient;
  }

  private requireWriteClient(): TwitterApi {
    if (!this.writeClient) throw new Error('Twitter write client requires OAuth 1.0a credentials (apiKey, apiSecret, accessToken, accessSecret)');
    return this.writeClient;
  }
}
