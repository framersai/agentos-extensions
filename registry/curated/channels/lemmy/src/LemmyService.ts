// @ts-nocheck
/**
 * @fileoverview Lemmy HTTP API service layer.
 *
 * Wraps the Lemmy v3 HTTP API for post creation, commenting, voting,
 * search, community management, and feed browsing.
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LemmyConfig {
  instanceUrl: string;
  username: string;
  password: string;
}

export interface LemmyPostResult {
  id: number;
  name: string;
  body?: string;
  url?: string;
  communityId: number;
  creatorId: number;
  published?: string;
  score?: number;
}

export interface LemmyCommentResult {
  id: number;
  content: string;
  postId: number;
  parentId?: number;
  creatorId: number;
  published?: string;
  score?: number;
}

export interface LemmySearchResult {
  posts: LemmyPostResult[];
  comments: LemmyCommentResult[];
  communities: Array<{ id: number; name: string; title: string; description?: string }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class LemmyService {
  private client: AxiosInstance | null = null;
  private config: LemmyConfig;
  private jwt: string | null = null;
  private running = false;

  constructor(config: LemmyConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.instanceUrl) {
      throw new Error(
        'Lemmy: no instance URL provided. Set LEMMY_INSTANCE_URL or provide instanceUrl in config.',
      );
    }
    if (!this.config.username || !this.config.password) {
      throw new Error(
        'Lemmy: no credentials provided. Set LEMMY_USERNAME + LEMMY_PASSWORD or provide username/password in config.',
      );
    }

    // Normalize instance URL — remove trailing slash
    const baseURL = this.config.instanceUrl.replace(/\/+$/, '');

    this.client = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
    });

    // Authenticate
    const loginResponse = await this.client.post('/api/v3/user/login', {
      username_or_email: this.config.username,
      password: this.config.password,
    });

    this.jwt = loginResponse.data?.jwt;
    if (!this.jwt) {
      throw new Error('Lemmy: login failed — no JWT returned.');
    }

    // Set auth header for future requests
    this.client.defaults.headers.common['Authorization'] = `Bearer ${this.jwt}`;
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.jwt = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // -- Posts --

  async createPost(communityId: number, name: string, body?: string, url?: string): Promise<LemmyPostResult> {
    const client = this.requireClient();
    const response = await client.post('/api/v3/post', {
      community_id: communityId,
      name,
      body,
      url,
    });

    const post = response.data?.post_view?.post ?? response.data?.post ?? response.data;
    return {
      id: post.id,
      name: post.name,
      body: post.body,
      url: post.url,
      communityId: post.community_id ?? communityId,
      creatorId: post.creator_id ?? 0,
      published: post.published,
    };
  }

  async getPost(id: number): Promise<LemmyPostResult | null> {
    const client = this.requireClient();
    try {
      const response = await client.get('/api/v3/post', { params: { id } });
      const post = response.data?.post_view?.post ?? response.data?.post;
      if (!post) return null;
      const counts = response.data?.post_view?.counts;
      return {
        id: post.id,
        name: post.name,
        body: post.body,
        url: post.url,
        communityId: post.community_id,
        creatorId: post.creator_id,
        published: post.published,
        score: counts?.score,
      };
    } catch {
      return null;
    }
  }

  async deletePost(id: number): Promise<void> {
    const client = this.requireClient();
    await client.post('/api/v3/post/delete', {
      post_id: id,
      deleted: true,
    });
  }

  // -- Comments --

  async createComment(postId: number, content: string, parentId?: number): Promise<LemmyCommentResult> {
    const client = this.requireClient();
    const body: Record<string, unknown> = {
      post_id: postId,
      content,
    };
    if (parentId !== undefined) {
      body.parent_id = parentId;
    }

    const response = await client.post('/api/v3/comment', body);
    const comment = response.data?.comment_view?.comment ?? response.data?.comment ?? response.data;
    return {
      id: comment.id,
      content: comment.content,
      postId: comment.post_id ?? postId,
      parentId: comment.parent_id,
      creatorId: comment.creator_id ?? 0,
      published: comment.published,
    };
  }

  // -- Voting --

  async vote(type: 'post' | 'comment', id: number, score: 1 | 0 | -1): Promise<void> {
    const client = this.requireClient();
    if (type === 'post') {
      await client.post('/api/v3/post/like', {
        post_id: id,
        score,
      });
    } else {
      await client.post('/api/v3/comment/like', {
        comment_id: id,
        score,
      });
    }
  }

  // -- Search --

  async search(
    query: string,
    type?: 'All' | 'Posts' | 'Comments' | 'Communities',
    limit?: number,
  ): Promise<LemmySearchResult> {
    const client = this.requireClient();
    const response = await client.get('/api/v3/search', {
      params: {
        q: query,
        type_: type ?? 'All',
        limit: limit ?? 10,
      },
    });

    const data = response.data;
    return {
      posts: (data.posts ?? []).map((pv: any) => {
        const p = pv.post ?? pv;
        return {
          id: p.id,
          name: p.name,
          body: p.body,
          url: p.url,
          communityId: p.community_id,
          creatorId: p.creator_id,
          published: p.published,
          score: pv.counts?.score,
        };
      }),
      comments: (data.comments ?? []).map((cv: any) => {
        const c = cv.comment ?? cv;
        return {
          id: c.id,
          content: c.content,
          postId: c.post_id,
          parentId: c.parent_id,
          creatorId: c.creator_id,
          published: c.published,
          score: cv.counts?.score,
        };
      }),
      communities: (data.communities ?? []).map((cv: any) => {
        const c = cv.community ?? cv;
        return {
          id: c.id,
          name: c.name,
          title: c.title,
          description: c.description,
        };
      }),
    };
  }

  // -- Communities --

  async subscribeToCommunity(communityId: number, follow: boolean): Promise<void> {
    const client = this.requireClient();
    await client.post('/api/v3/community/follow', {
      community_id: communityId,
      follow,
    });
  }

  async getCommunity(name: string): Promise<{ id: number; name: string; title: string; description?: string } | null> {
    const client = this.requireClient();
    try {
      const response = await client.get('/api/v3/community', { params: { name } });
      const c = response.data?.community_view?.community ?? response.data?.community;
      if (!c) return null;
      return {
        id: c.id,
        name: c.name,
        title: c.title,
        description: c.description,
      };
    } catch {
      return null;
    }
  }

  // -- Feed --

  async getFeed(
    type?: 'All' | 'Local' | 'Subscribed',
    sort?: 'Hot' | 'New' | 'Top',
    limit?: number,
  ): Promise<LemmyPostResult[]> {
    const client = this.requireClient();
    const response = await client.get('/api/v3/post/list', {
      params: {
        type_: type ?? 'All',
        sort: sort ?? 'Hot',
        limit: limit ?? 20,
      },
    });

    return (response.data?.posts ?? []).map((pv: any) => {
      const p = pv.post ?? pv;
      return {
        id: p.id,
        name: p.name,
        body: p.body,
        url: p.url,
        communityId: p.community_id,
        creatorId: p.creator_id,
        published: p.published,
        score: pv.counts?.score,
      };
    });
  }

  // -- Internal --

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('Lemmy service not initialized');
    return this.client;
  }
}
