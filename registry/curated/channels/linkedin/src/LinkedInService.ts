// @ts-nocheck
/**
 * @fileoverview LinkedIn Marketing API v2 + Community Management API service layer.
 *
 * Wraps the LinkedIn REST API v2 for posting, engagement, search,
 * company page management, and analytics via axios.
 */

import axios, { type AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LinkedInConfig {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  organizationId?: string;
}

export interface LinkedInPostOptions {
  text: string;
  mediaUrls?: string[];
  articleUrl?: string;
  articleTitle?: string;
  articleDescription?: string;
  visibility?: 'PUBLIC' | 'CONNECTIONS';
  organizationId?: string;
}

export interface LinkedInPostResult {
  id: string;
  url: string;
}

export interface LinkedInSearchOptions {
  query: string;
  type?: 'posts' | 'people' | 'companies';
  limit?: number;
}

export interface LinkedInAnalyticsResult {
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  engagement: number;
}

export interface LinkedInProfile {
  personId: string;
  name: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.linkedin.com';
const RATE_LIMIT_DELAY_MS = 100;

export class LinkedInService {
  private client: AxiosInstance | null = null;
  private config: LinkedInConfig;
  private running = false;
  private personId: string | null = null;

  constructor(config: LinkedInConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.accessToken) {
      throw new Error(
        'LinkedIn: no access token provided. Set LINKEDIN_ACCESS_TOKEN or configure linkedin.accessToken secret.',
      );
    }

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
        'Content-Type': 'application/json',
      },
    });

    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.client = null;
    this.personId = null;
    this.running = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Profile ──

  /** Get authenticated user's profile (person URN). */
  async getProfile(): Promise<LinkedInProfile> {
    const http = this.requireClient();
    await this.rateLimit();

    const res = await http.get('/v2/userinfo');
    const personId = res.data.sub;
    this.personId = personId;

    return {
      personId,
      name: `${res.data.given_name ?? ''} ${res.data.family_name ?? ''}`.trim(),
      email: res.data.email,
    };
  }

  /** Resolve the current person URN, fetching profile if needed. */
  private async resolvePersonId(): Promise<string> {
    if (this.personId) return this.personId;
    const profile = await this.getProfile();
    return profile.personId;
  }

  // ── Posting ──

  /**
   * Post to LinkedIn feed (personal profile or organization page).
   * Supports text-only, text+image, text+article, and text+video.
   */
  async postToFeed(options: LinkedInPostOptions): Promise<LinkedInPostResult> {
    const http = this.requireClient();
    await this.rateLimit();

    const author = options.organizationId
      ? `urn:li:organization:${options.organizationId}`
      : `urn:li:person:${await this.resolvePersonId()}`;

    const visibility = options.visibility === 'CONNECTIONS' ? 'CONNECTIONS' : 'PUBLIC';

    // Build the post body using the Posts API (v2/posts)
    const postBody: Record<string, any> = {
      author,
      commentary: options.text,
      visibility,
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
    };

    // Article attachment
    if (options.articleUrl) {
      postBody.content = {
        article: {
          source: options.articleUrl,
          title: options.articleTitle ?? options.articleUrl,
          description: options.articleDescription ?? '',
        },
      };
    }

    // Image attachments
    if (options.mediaUrls?.length && !options.articleUrl) {
      const images: Array<{ id: string }> = [];
      for (const mediaUrl of options.mediaUrls) {
        const upload = await this.registerImageUpload(author);
        await this.uploadImage(upload.uploadUrl, mediaUrl);
        images.push({ id: upload.asset });
      }

      if (images.length === 1) {
        postBody.content = {
          media: {
            id: images[0].id,
          },
        };
      } else {
        postBody.content = {
          multiImage: {
            images: images.map((img) => ({ id: img.id })),
          },
        };
      }
    }

    try {
      const res = await http.post('/v2/posts', postBody);
      const postId = res.headers['x-restli-id'] ?? res.data?.id ?? '';
      return {
        id: postId,
        url: `https://www.linkedin.com/feed/update/${postId}`,
      };
    } catch (err: any) {
      if (err.response?.status === 401) {
        throw new Error('LinkedIn: access token expired or invalid. Please refresh your OAuth token.');
      }
      throw err;
    }
  }

  // ── Image Upload ──

  /** Register an image upload with LinkedIn and get the upload URL + asset URN. */
  async registerImageUpload(owner: string): Promise<{ uploadUrl: string; asset: string }> {
    const http = this.requireClient();
    await this.rateLimit();

    const res = await http.post('/v2/images?action=initializeUpload', {
      initializeUploadRequest: {
        owner,
      },
    });

    const uploadUrl = res.data.value?.uploadUrl ?? '';
    const asset = res.data.value?.image ?? '';

    return { uploadUrl, asset };
  }

  /** Upload an image binary to the pre-signed upload URL. */
  async uploadImage(uploadUrl: string, imageSource: string): Promise<void> {
    await this.rateLimit();

    // imageSource can be a URL — download first, then upload
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      const imageRes = await axios.get(imageSource, { responseType: 'arraybuffer' });
      await axios.put(uploadUrl, imageRes.data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      });
    } else {
      // Local file path — read via fs
      const fs = await import('fs');
      const data = fs.readFileSync(imageSource);
      await axios.put(uploadUrl, data, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Authorization': `Bearer ${this.config.accessToken}`,
        },
      });
    }
  }

  // ── Engagement ──

  /** Comment on a LinkedIn post. */
  async commentOnPost(postId: string, text: string): Promise<{ id: string }> {
    const http = this.requireClient();
    await this.rateLimit();

    const personId = await this.resolvePersonId();
    const res = await http.post('/v2/socialActions/' + encodeURIComponent(postId) + '/comments', {
      actor: `urn:li:person:${personId}`,
      message: {
        text,
      },
    });

    return { id: res.data?.id ?? res.headers['x-restli-id'] ?? '' };
  }

  /** Like (react to) a LinkedIn post. */
  async likePost(postId: string): Promise<void> {
    const http = this.requireClient();
    await this.rateLimit();

    const personId = await this.resolvePersonId();
    await http.post('/v2/socialActions/' + encodeURIComponent(postId) + '/likes', {
      actor: `urn:li:person:${personId}`,
    });
  }

  /** Unlike a LinkedIn post. */
  async unlikePost(postId: string): Promise<void> {
    const http = this.requireClient();
    await this.rateLimit();

    const personId = await this.resolvePersonId();
    await http.delete(
      '/v2/socialActions/' + encodeURIComponent(postId) + '/likes/' + encodeURIComponent(`urn:li:person:${personId}`),
    );
  }

  /** Share (reshare) a LinkedIn post with optional commentary. */
  async sharePost(postId: string, commentary?: string): Promise<LinkedInPostResult> {
    const http = this.requireClient();
    await this.rateLimit();

    const personId = await this.resolvePersonId();
    const author = `urn:li:person:${personId}`;

    const postBody: Record<string, any> = {
      author,
      commentary: commentary ?? '',
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      content: {
        reshare: {
          resharedPost: postId,
        },
      },
    };

    const res = await http.post('/v2/posts', postBody);
    const newPostId = res.headers['x-restli-id'] ?? res.data?.id ?? '';
    return {
      id: newPostId,
      url: `https://www.linkedin.com/feed/update/${newPostId}`,
    };
  }

  // ── Search ──

  /** Search LinkedIn for posts, people, or companies. */
  async searchPosts(options: LinkedInSearchOptions): Promise<any[]> {
    const http = this.requireClient();
    await this.rateLimit();

    const limit = Math.min(options.limit ?? 10, 50);
    const searchType = options.type ?? 'posts';

    // The search API endpoint varies by type
    // Using the Community Management API search endpoints
    try {
      if (searchType === 'posts') {
        const res = await http.get('/v2/search', {
          params: {
            q: 'keywords',
            keywords: options.query,
            type: 'FEED_UPDATE',
            count: limit,
          },
        });
        return res.data?.elements ?? [];
      }

      if (searchType === 'people') {
        const res = await http.get('/v2/search', {
          params: {
            q: 'keywords',
            keywords: options.query,
            type: 'PEOPLE',
            count: limit,
          },
        });
        return res.data?.elements ?? [];
      }

      if (searchType === 'companies') {
        const res = await http.get('/v2/search', {
          params: {
            q: 'keywords',
            keywords: options.query,
            type: 'COMPANY',
            count: limit,
          },
        });
        return res.data?.elements ?? [];
      }

      return [];
    } catch (err: any) {
      if (err.response?.status === 401) {
        throw new Error('LinkedIn: access token expired or invalid. Please refresh your OAuth token.');
      }
      throw err;
    }
  }

  // ── Analytics ──

  /** Get engagement analytics for a specific post. */
  async getPostAnalytics(postId: string): Promise<LinkedInAnalyticsResult> {
    const http = this.requireClient();
    await this.rateLimit();

    try {
      // Fetch social actions (likes, comments, shares) for the post
      const actionsRes = await http.get('/v2/socialActions/' + encodeURIComponent(postId));
      const actions = actionsRes.data ?? {};

      // For organization posts, try to get share statistics
      let impressions = 0;
      let clicks = 0;

      if (this.config.organizationId) {
        try {
          const statsRes = await http.get('/v2/organizationalEntityShareStatistics', {
            params: {
              q: 'organizationalEntity',
              organizationalEntity: `urn:li:organization:${this.config.organizationId}`,
              shares: [postId],
            },
          });

          const stats = statsRes.data?.elements?.[0]?.totalShareStatistics ?? {};
          impressions = stats.impressionCount ?? 0;
          clicks = stats.clickCount ?? 0;
        } catch {
          // Stats not available for personal posts — continue with zero values
        }
      }

      const likes = actions.likesSummary?.totalLikes ?? 0;
      const comments = actions.commentsSummary?.totalFirstLevelComments ?? 0;
      const shares = actions.sharesSummary?.totalShares ?? 0;
      const total = likes + comments + shares;
      const engagement = impressions > 0 ? total / impressions : 0;

      return { likes, comments, shares, impressions, clicks, engagement };
    } catch (err: any) {
      if (err.response?.status === 401) {
        throw new Error('LinkedIn: access token expired or invalid. Please refresh your OAuth token.');
      }
      throw err;
    }
  }

  // ── Post Management ──

  /** Delete a LinkedIn post. */
  async deletePost(postId: string): Promise<void> {
    const http = this.requireClient();
    await this.rateLimit();

    await http.delete('/v2/posts/' + encodeURIComponent(postId));
  }

  // ── Organizations ──

  /** List organizations the authenticated user manages. */
  async getOrganizations(): Promise<{ id: string; name: string }[]> {
    const http = this.requireClient();
    await this.rateLimit();

    const personId = await this.resolvePersonId();

    try {
      const res = await http.get('/v2/organizationAcls', {
        params: {
          q: 'roleAssignee',
          role: 'ADMINISTRATOR',
          projection: '(elements*(organizationalTarget))',
        },
      });

      const elements = res.data?.elements ?? [];
      const orgs: { id: string; name: string }[] = [];

      for (const element of elements) {
        const orgUrn = element.organizationalTarget ?? '';
        const orgId = orgUrn.replace('urn:li:organization:', '');
        if (orgId) {
          try {
            const orgRes = await http.get(`/v2/organizations/${orgId}`);
            orgs.push({
              id: orgId,
              name: orgRes.data?.localizedName ?? orgId,
            });
          } catch {
            orgs.push({ id: orgId, name: orgId });
          }
        }
      }

      return orgs;
    } catch (err: any) {
      if (err.response?.status === 401) {
        throw new Error('LinkedIn: access token expired or invalid. Please refresh your OAuth token.');
      }
      throw err;
    }
  }

  // ── Bot Info ──

  /** Get the authenticated user's basic info. */
  async getMe(): Promise<{ id: string; name: string }> {
    const profile = await this.getProfile();
    return { id: profile.personId, name: profile.name };
  }

  // ── Internal ──

  private requireClient(): AxiosInstance {
    if (!this.client) throw new Error('LinkedIn service not initialized');
    return this.client;
  }

  /** Simple rate-limit delay between API calls. */
  private async rateLimit(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
  }
}
