// @ts-nocheck
/**
 * @fileoverview Bluesky AT Protocol service layer.
 *
 * Wraps @atproto/api for post creation, engagement, search,
 * feed reading, following, and analytics on the Bluesky network.
 */

import { BskyAgent, RichText, type AtpSessionEvent, type AtpSessionData } from '@atproto/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueskyConfig {
  /** Bluesky handle (e.g. "alice.bsky.social") */
  handle: string;
  /** App password (not your main password — generate via Settings > App Passwords) */
  appPassword: string;
  /** PDS service URL (defaults to https://bsky.social) */
  service?: string;
}

export interface PostOptions {
  /** Post text (max 300 graphemes) */
  text: string;
  /** Images to attach (max 4) */
  images?: Array<{ data: Uint8Array; mimeType: string; alt?: string }>;
  /** Reply-to reference */
  replyTo?: { uri: string; cid: string };
  /** Quote-post reference */
  quote?: { uri: string; cid: string };
  /** Language tags (e.g. ["en"]) */
  langs?: string[];
}

export interface PostResult {
  /** AT URI (at://did:plc:.../app.bsky.feed.post/...) */
  uri: string;
  /** Content hash */
  cid: string;
  /** Human-readable Bluesky URL */
  url: string;
}

export interface PostView {
  uri: string;
  cid: string;
  text: string;
  authorHandle: string;
  authorDisplayName?: string;
  createdAt?: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BlueskyService {
  private agent: BskyAgent | null = null;
  private config: BlueskyConfig;
  private running = false;
  private sessionData: AtpSessionData | null = null;

  constructor(config: BlueskyConfig) {
    this.config = {
      ...config,
      service: config.service ?? 'https://bsky.social',
    };
  }

  /**
   * Initialize the Bluesky agent and authenticate.
   * Creates a BskyAgent, logs in with the configured handle and app password.
   */
  async initialize(): Promise<void> {
    this.agent = new BskyAgent({
      service: this.config.service!,
      persistSession: (_evt: AtpSessionEvent, sess?: AtpSessionData) => {
        if (sess) {
          this.sessionData = sess;
        }
      },
    });

    await this.agent.login({
      identifier: this.config.handle,
      password: this.config.appPassword,
    });

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.agent = null;
    this.sessionData = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get handle(): string {
    return this.config.handle;
  }

  // ── Posting ──────────────────────────────────────────────────────────────

  /**
   * Create a post with rich-text facet detection (mentions, links, hashtags).
   * Optionally attach images and/or reply to or quote another post.
   */
  async createPost(text: string, options?: Omit<PostOptions, 'text'>): Promise<PostResult> {
    const agent = this.requireAgent();

    // Build RichText and detect facets (mentions, links, hashtags)
    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    // Build the record
    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    };

    // Attach images via blob upload
    if (options?.images?.length) {
      const imageEmbeds: Array<{ alt: string; image: any }> = [];
      for (const img of options.images) {
        const uploadResult = await agent.uploadBlob(img.data, { encoding: img.mimeType });
        imageEmbeds.push({
          alt: img.alt ?? '',
          image: uploadResult.data.blob,
        });
      }
      record.embed = {
        $type: 'app.bsky.embed.images',
        images: imageEmbeds,
      };
    }

    // Quote post embed
    if (options?.quote) {
      record.embed = {
        $type: 'app.bsky.embed.record',
        record: {
          uri: options.quote.uri,
          cid: options.quote.cid,
        },
      };
    }

    // Reply reference
    if (options?.replyTo) {
      record.reply = {
        root: {
          uri: options.replyTo.uri,
          cid: options.replyTo.cid,
        },
        parent: {
          uri: options.replyTo.uri,
          cid: options.replyTo.cid,
        },
      };
    }

    // Language tags
    if (options?.langs?.length) {
      record.langs = options.langs;
    }

    const result = await agent.post(record as any);
    const rkey = result.uri.split('/').pop() ?? '';
    const url = this.buildPostUrl(this.config.handle, rkey);

    return { uri: result.uri, cid: result.cid, url };
  }

  // ── Reply ────────────────────────────────────────────────────────────────

  /**
   * Reply to a post. Uses the parent/root threading model required by AT Protocol.
   */
  async reply(
    parentUri: string,
    parentCid: string,
    rootUri: string,
    rootCid: string,
    text: string,
  ): Promise<PostResult> {
    const agent = this.requireAgent();

    const rt = new RichText({ text });
    await rt.detectFacets(agent);

    const record: Record<string, unknown> = {
      $type: 'app.bsky.feed.post',
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: parentUri, cid: parentCid },
      },
    };

    const result = await agent.post(record as any);
    const rkey = result.uri.split('/').pop() ?? '';
    const url = this.buildPostUrl(this.config.handle, rkey);

    return { uri: result.uri, cid: result.cid, url };
  }

  // ── Engagement ───────────────────────────────────────────────────────────

  /** Like a post. Returns the like record URI (needed for unlike). */
  async like(uri: string, cid: string): Promise<{ uri: string }> {
    const agent = this.requireAgent();
    const result = await agent.like(uri, cid);
    return { uri: result.uri };
  }

  /** Remove a like by its record URI. */
  async unlike(likeUri: string): Promise<void> {
    const agent = this.requireAgent();
    await agent.deleteLike(likeUri);
  }

  /** Repost a post. Returns the repost record URI (needed for unrepost). */
  async repost(uri: string, cid: string): Promise<{ uri: string }> {
    const agent = this.requireAgent();
    const result = await agent.repost(uri, cid);
    return { uri: result.uri };
  }

  /** Remove a repost by its record URI. */
  async unrepost(repostUri: string): Promise<void> {
    const agent = this.requireAgent();
    await agent.deleteRepost(repostUri);
  }

  // ── Search ───────────────────────────────────────────────────────────────

  /** Search posts by query string. */
  async searchPosts(query: string, limit: number = 25): Promise<PostView[]> {
    const agent = this.requireAgent();
    const result = await agent.app.bsky.feed.searchPosts({
      q: query,
      limit: Math.min(limit, 100),
    });

    return (result.data.posts ?? []).map((p: any) => this.mapPostView(p));
  }

  /** Search for actors (users) by query string. */
  async searchActors(query: string, limit: number = 25): Promise<Array<{ did: string; handle: string; displayName?: string; description?: string }>> {
    const agent = this.requireAgent();
    const result = await agent.searchActors({
      term: query,
      limit: Math.min(limit, 100),
    });

    return (result.data.actors ?? []).map((a: any) => ({
      did: a.did,
      handle: a.handle,
      displayName: a.displayName,
      description: a.description,
    }));
  }

  // ── Feeds ────────────────────────────────────────────────────────────────

  /** Get the authenticated user's timeline. */
  async getTimeline(limit: number = 50, cursor?: string): Promise<{ posts: PostView[]; cursor?: string }> {
    const agent = this.requireAgent();
    const result = await agent.getTimeline({
      limit: Math.min(limit, 100),
      cursor,
    });

    const posts = (result.data.feed ?? []).map((item: any) => this.mapPostView(item.post));
    return { posts, cursor: result.data.cursor };
  }

  /** Get a specific author's feed. */
  async getAuthorFeed(handle: string, limit: number = 50): Promise<PostView[]> {
    const agent = this.requireAgent();
    const result = await agent.getAuthorFeed({
      actor: handle,
      limit: Math.min(limit, 100),
    });

    return (result.data.feed ?? []).map((item: any) => this.mapPostView(item.post));
  }

  // ── Following ────────────────────────────────────────────────────────────

  /** Follow a user by DID. Returns the follow record URI (needed for unfollow). */
  async follow(did: string): Promise<{ uri: string }> {
    const agent = this.requireAgent();
    const result = await agent.follow(did);
    return { uri: result.uri };
  }

  /** Unfollow a user by removing the follow record URI. */
  async unfollow(followUri: string): Promise<void> {
    const agent = this.requireAgent();
    await agent.deleteFollow(followUri);
  }

  // ── Profile ──────────────────────────────────────────────────────────────

  /** Get a user's profile. Defaults to the authenticated user. */
  async getProfile(handle?: string): Promise<{
    did: string;
    handle: string;
    displayName?: string;
    description?: string;
    followersCount: number;
    followsCount: number;
    postsCount: number;
    avatar?: string;
  }> {
    const agent = this.requireAgent();
    const result = await agent.getProfile({ actor: handle ?? this.config.handle });
    const p = result.data;
    return {
      did: p.did,
      handle: p.handle,
      displayName: p.displayName,
      description: p.description,
      followersCount: p.followersCount ?? 0,
      followsCount: p.followsCount ?? 0,
      postsCount: p.postsCount ?? 0,
      avatar: p.avatar,
    };
  }

  // ── Thread ───────────────────────────────────────────────────────────────

  /** Get a full post thread (ancestors + replies). */
  async getPostThread(uri: string): Promise<any> {
    const agent = this.requireAgent();
    const result = await agent.getPostThread({ uri });
    return result.data.thread;
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  /** Delete a post by its AT URI. */
  async deletePost(uri: string): Promise<void> {
    const agent = this.requireAgent();
    await agent.deletePost(uri);
  }

  // ── Resolve Handle ───────────────────────────────────────────────────────

  /** Resolve a handle to a DID. */
  async resolveHandle(handle: string): Promise<string> {
    const agent = this.requireAgent();
    const result = await agent.resolveHandle({ handle });
    return result.data.did;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Build a human-readable Bluesky post URL.
   * @param handle - The author's handle (e.g. "alice.bsky.social")
   * @param rkey - The record key (last segment of the AT URI)
   */
  buildPostUrl(handle: string, rkey: string): string {
    return `https://bsky.app/profile/${handle}/post/${rkey}`;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private requireAgent(): BskyAgent {
    if (!this.agent) {
      throw new Error('Bluesky service not initialized. Call initialize() first.');
    }
    return this.agent;
  }

  /** Map a raw post object to a PostView. */
  private mapPostView(post: any): PostView {
    return {
      uri: post.uri,
      cid: post.cid,
      text: post.record?.text ?? '',
      authorHandle: post.author?.handle ?? '',
      authorDisplayName: post.author?.displayName,
      createdAt: post.record?.createdAt ?? post.indexedAt,
      likeCount: post.likeCount ?? 0,
      repostCount: post.repostCount ?? 0,
      replyCount: post.replyCount ?? 0,
    };
  }
}
