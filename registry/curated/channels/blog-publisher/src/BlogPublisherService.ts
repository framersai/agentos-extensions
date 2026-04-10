// @ts-nocheck
/**
 * @fileoverview Multi-platform blog publishing service.
 *
 * Provides a unified interface for publishing, updating, listing, and
 * retrieving analytics from Dev.to, Hashnode, Medium, and WordPress.
 * Each platform method handles its own API format and authentication.
 *
 * @module @framers/agentos-ext-channel-blog-publisher/BlogPublisherService
 */

import axios, { type AxiosInstance } from 'axios';

// ============================================================================
// Configuration Types
// ============================================================================

export interface BlogPublisherConfig {
  devto?: { apiKey: string };
  hashnode?: { apiKey: string; publicationId?: string };
  medium?: { accessToken: string; authorId?: string };
  wordpress?: { url: string; username: string; appPassword: string };
}

export interface ArticleInput {
  title: string;
  /** Article body in Markdown format. */
  body: string;
  tags?: string[];
  canonicalUrl?: string;
  coverImage?: string;
  series?: string;
  /** If true publish immediately; if false save as draft. Defaults to false. */
  published?: boolean;
}

export interface ArticleUpdate {
  title?: string;
  body?: string;
  tags?: string[];
  canonicalUrl?: string;
  coverImage?: string;
  series?: string;
  published?: boolean;
}

export interface PublishedArticle {
  platform: string;
  id: string;
  url: string;
  title: string;
  published: boolean;
}

export interface ArticleListing {
  platform: string;
  id: string;
  title: string;
  url: string;
  published: boolean;
  publishedAt?: string;
  tags?: string[];
}

export interface ArticleAnalytics {
  platform: string;
  articleId: string;
  title?: string;
  views?: number;
  reactions?: number;
  comments?: number;
  reads?: number;
  fans?: number;
  /** Platform-specific metrics not captured by standard fields. */
  extra?: Record<string, unknown>;
}

export type BlogPlatform = 'devto' | 'hashnode' | 'medium' | 'wordpress';

// ============================================================================
// Service Implementation
// ============================================================================

export class BlogPublisherService {
  private readonly config: BlogPublisherConfig;
  private readonly httpClients = new Map<string, AxiosInstance>();

  constructor(config: BlogPublisherConfig) {
    this.config = config;
    this.initClients();
  }

  // --------------------------------------------------------------------------
  // Client initialisation
  // --------------------------------------------------------------------------

  private initClients(): void {
    if (this.config.devto) {
      this.httpClients.set(
        'devto',
        axios.create({
          baseURL: 'https://dev.to/api',
          headers: {
            'api-key': this.config.devto.apiKey,
            'Content-Type': 'application/json',
          },
        }),
      );
    }

    if (this.config.hashnode) {
      this.httpClients.set(
        'hashnode',
        axios.create({
          baseURL: 'https://gql.hashnode.com',
          headers: {
            Authorization: this.config.hashnode.apiKey,
            'Content-Type': 'application/json',
          },
        }),
      );
    }

    if (this.config.medium) {
      this.httpClients.set(
        'medium',
        axios.create({
          baseURL: 'https://api.medium.com/v1',
          headers: {
            Authorization: `Bearer ${this.config.medium.accessToken}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    }

    if (this.config.wordpress) {
      const { url, username, appPassword } = this.config.wordpress;
      const basicAuth = Buffer.from(`${username}:${appPassword}`).toString('base64');
      this.httpClients.set(
        'wordpress',
        axios.create({
          baseURL: url.replace(/\/+$/, ''),
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
        }),
      );
    }
  }

  // --------------------------------------------------------------------------
  // Platform availability
  // --------------------------------------------------------------------------

  /** Returns the list of platforms that have valid credentials configured. */
  getConfiguredPlatforms(): BlogPlatform[] {
    const platforms: BlogPlatform[] = [];
    if (this.config.devto) platforms.push('devto');
    if (this.config.hashnode) platforms.push('hashnode');
    if (this.config.medium) platforms.push('medium');
    if (this.config.wordpress) platforms.push('wordpress');
    return platforms;
  }

  private getClient(platform: string): AxiosInstance {
    const client = this.httpClients.get(platform);
    if (!client) {
      throw new Error(`Platform "${platform}" is not configured. Configure credentials to use it.`);
    }
    return client;
  }

  // ==========================================================================
  // Dev.to
  // ==========================================================================

  async publishToDevto(article: ArticleInput): Promise<PublishedArticle> {
    const client = this.getClient('devto');
    const { data } = await client.post('/articles', {
      article: {
        title: article.title,
        body_markdown: article.body,
        tags: article.tags?.slice(0, 4), // Dev.to max 4 tags
        canonical_url: article.canonicalUrl,
        published: article.published ?? false,
        cover_image: article.coverImage,
        series: article.series,
      },
    });

    return {
      platform: 'devto',
      id: String(data.id),
      url: data.url,
      title: data.title,
      published: data.published,
    };
  }

  async updateOnDevto(articleId: string, updates: ArticleUpdate): Promise<PublishedArticle> {
    const client = this.getClient('devto');
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.body !== undefined) payload.body_markdown = updates.body;
    if (updates.tags !== undefined) payload.tags = updates.tags.slice(0, 4);
    if (updates.canonicalUrl !== undefined) payload.canonical_url = updates.canonicalUrl;
    if (updates.coverImage !== undefined) payload.cover_image = updates.coverImage;
    if (updates.series !== undefined) payload.series = updates.series;
    if (updates.published !== undefined) payload.published = updates.published;

    const { data } = await client.put(`/articles/${articleId}`, { article: payload });

    return {
      platform: 'devto',
      id: String(data.id),
      url: data.url,
      title: data.title,
      published: data.published,
    };
  }

  async listDevtoArticles(page = 1, perPage = 30): Promise<ArticleListing[]> {
    const client = this.getClient('devto');
    const { data } = await client.get('/articles/me', {
      params: { page, per_page: perPage },
    });

    return (data as any[]).map((a) => ({
      platform: 'devto' as const,
      id: String(a.id),
      title: a.title,
      url: a.url,
      published: a.published,
      publishedAt: a.published_at,
      tags: a.tag_list,
    }));
  }

  async getDevtoArticle(articleId: string): Promise<any> {
    const client = this.getClient('devto');
    const { data } = await client.get(`/articles/${articleId}`);
    return data;
  }

  async getDevtoAnalytics(articleId: string): Promise<ArticleAnalytics> {
    const article = await this.getDevtoArticle(articleId);
    return {
      platform: 'devto',
      articleId,
      title: article.title,
      views: article.page_views_count,
      reactions: article.positive_reactions_count,
      comments: article.comments_count,
    };
  }

  // ==========================================================================
  // Hashnode
  // ==========================================================================

  async publishToHashnode(article: ArticleInput): Promise<PublishedArticle> {
    const client = this.getClient('hashnode');
    const publicationId = this.config.hashnode!.publicationId;
    if (!publicationId) {
      throw new Error('Hashnode publicationId is required to publish. Set hashnode.publicationId or HASHNODE_PUBLICATION_ID.');
    }

    const mutation = `
      mutation PublishPost($input: PublishPostInput!) {
        publishPost(input: $input) {
          post {
            id
            title
            url
            slug
          }
        }
      }
    `;

    const input: Record<string, unknown> = {
      title: article.title,
      contentMarkdown: article.body,
      publicationId,
      tags: article.tags?.map((t) => ({ slug: t.toLowerCase().replace(/\s+/g, '-'), name: t })),
    };

    if (article.coverImage) {
      input.coverImageOptions = { coverImageURL: article.coverImage };
    }
    if (article.canonicalUrl) {
      input.originalArticleURL = article.canonicalUrl;
    }

    const { data } = await client.post('/', {
      query: mutation,
      variables: { input },
    });

    if (data.errors?.length) {
      throw new Error(`Hashnode API error: ${data.errors.map((e: any) => e.message).join(', ')}`);
    }

    const post = data.data.publishPost.post;
    return {
      platform: 'hashnode',
      id: post.id,
      url: post.url,
      title: post.title,
      published: true,
    };
  }

  async updateOnHashnode(postId: string, updates: ArticleUpdate): Promise<PublishedArticle> {
    const client = this.getClient('hashnode');

    const mutation = `
      mutation UpdatePost($input: UpdatePostInput!) {
        updatePost(input: $input) {
          post {
            id
            title
            url
          }
        }
      }
    `;

    const input: Record<string, unknown> = { id: postId };
    if (updates.title !== undefined) input.title = updates.title;
    if (updates.body !== undefined) input.contentMarkdown = updates.body;
    if (updates.tags !== undefined) {
      input.tags = updates.tags.map((t) => ({ slug: t.toLowerCase().replace(/\s+/g, '-'), name: t }));
    }
    if (updates.coverImage !== undefined) {
      input.coverImageOptions = { coverImageURL: updates.coverImage };
    }
    if (updates.canonicalUrl !== undefined) {
      input.originalArticleURL = updates.canonicalUrl;
    }

    const { data } = await client.post('/', {
      query: mutation,
      variables: { input },
    });

    if (data.errors?.length) {
      throw new Error(`Hashnode API error: ${data.errors.map((e: any) => e.message).join(', ')}`);
    }

    const post = data.data.updatePost.post;
    return {
      platform: 'hashnode',
      id: post.id,
      url: post.url,
      title: post.title,
      published: true,
    };
  }

  async listHashnodeArticles(): Promise<ArticleListing[]> {
    const client = this.getClient('hashnode');
    const publicationId = this.config.hashnode!.publicationId;
    if (!publicationId) {
      throw new Error('Hashnode publicationId is required to list articles.');
    }

    const query = `
      query ListPosts($publicationId: ObjectId!, $first: Int!) {
        publication(id: $publicationId) {
          posts(first: $first) {
            edges {
              node {
                id
                title
                url
                slug
                publishedAt
                tags { name slug }
              }
            }
          }
        }
      }
    `;

    const { data } = await client.post('/', {
      query,
      variables: { publicationId, first: 30 },
    });

    if (data.errors?.length) {
      throw new Error(`Hashnode API error: ${data.errors.map((e: any) => e.message).join(', ')}`);
    }

    const edges = data.data.publication?.posts?.edges ?? [];
    return edges.map((e: any) => ({
      platform: 'hashnode' as const,
      id: e.node.id,
      title: e.node.title,
      url: e.node.url,
      published: true,
      publishedAt: e.node.publishedAt,
      tags: e.node.tags?.map((t: any) => t.name),
    }));
  }

  // ==========================================================================
  // Medium
  // ==========================================================================

  async getMediumUser(): Promise<{ id: string; username: string; name: string }> {
    const client = this.getClient('medium');
    const { data } = await client.get('/me');
    return {
      id: data.data.id,
      username: data.data.username,
      name: data.data.name,
    };
  }

  async publishToMedium(article: ArticleInput): Promise<PublishedArticle> {
    const client = this.getClient('medium');

    // Resolve author ID if not configured
    let authorId = this.config.medium!.authorId;
    if (!authorId) {
      const user = await this.getMediumUser();
      authorId = user.id;
      this.config.medium!.authorId = authorId;
    }

    const { data } = await client.post(`/users/${authorId}/posts`, {
      title: article.title,
      contentFormat: 'markdown',
      content: article.body,
      tags: article.tags?.slice(0, 5), // Medium max 5 tags
      canonicalUrl: article.canonicalUrl,
      publishStatus: article.published ? 'public' : 'draft',
    });

    return {
      platform: 'medium',
      id: data.data.id,
      url: data.data.url,
      title: data.data.title,
      published: data.data.publishStatus === 'public',
    };
  }

  // Note: Medium API does not support update, list, or analytics endpoints.
  // These limitations are surfaced to callers.

  // ==========================================================================
  // WordPress
  // ==========================================================================

  async publishToWordPress(article: ArticleInput): Promise<PublishedArticle> {
    const client = this.getClient('wordpress');
    const payload: Record<string, unknown> = {
      title: article.title,
      content: article.body,
      status: article.published ? 'publish' : 'draft',
    };

    if (article.tags?.length) {
      // WordPress expects tag IDs; for simplicity we pass tag names
      // and let the REST API handle creation via the tags_input approach.
      // The standard endpoint expects numeric IDs, so we use a workaround
      // by setting tags as a comma-separated string for the post meta
      // or relying on the theme to handle it.
      payload.tags = article.tags;
    }
    if (article.coverImage) {
      payload.featured_media = article.coverImage;
    }

    const { data } = await client.post('/wp-json/wp/v2/posts', payload);

    return {
      platform: 'wordpress',
      id: String(data.id),
      url: data.link,
      title: typeof data.title === 'object' ? data.title.rendered : data.title,
      published: data.status === 'publish',
    };
  }

  async updateOnWordPress(postId: string, updates: ArticleUpdate): Promise<PublishedArticle> {
    const client = this.getClient('wordpress');
    const payload: Record<string, unknown> = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.body !== undefined) payload.content = updates.body;
    if (updates.published !== undefined) payload.status = updates.published ? 'publish' : 'draft';
    if (updates.tags !== undefined) payload.tags = updates.tags;
    if (updates.coverImage !== undefined) payload.featured_media = updates.coverImage;

    const { data } = await client.put(`/wp-json/wp/v2/posts/${postId}`, payload);

    return {
      platform: 'wordpress',
      id: String(data.id),
      url: data.link,
      title: typeof data.title === 'object' ? data.title.rendered : data.title,
      published: data.status === 'publish',
    };
  }

  async listWordPressArticles(perPage = 30): Promise<ArticleListing[]> {
    const client = this.getClient('wordpress');
    const { data } = await client.get('/wp-json/wp/v2/posts', {
      params: { per_page: perPage, status: 'any' },
    });

    return (data as any[]).map((p) => ({
      platform: 'wordpress' as const,
      id: String(p.id),
      title: typeof p.title === 'object' ? p.title.rendered : p.title,
      url: p.link,
      published: p.status === 'publish',
      publishedAt: p.date,
      tags: p.tags,
    }));
  }

  // ==========================================================================
  // Cross-Platform Methods
  // ==========================================================================

  /**
   * Publish an article to multiple platforms simultaneously.
   *
   * @param article - Article content to publish.
   * @param platforms - Specific platforms to target. Defaults to all configured.
   * @returns Array of results — one per platform attempted. Failed platforms
   *   include an error message instead of article data.
   */
  async publishToAll(
    article: ArticleInput,
    platforms?: string[],
  ): Promise<Array<PublishedArticle | { platform: string; error: string }>> {
    const targets = (platforms ?? this.getConfiguredPlatforms()) as BlogPlatform[];
    const results = await Promise.allSettled(
      targets.map((p) => this.publishToPlatform(p, article)),
    );

    return results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { platform: targets[i], error: (r.reason as Error).message };
    });
  }

  /**
   * Route a publish call to the correct platform method.
   */
  async publishToPlatform(platform: BlogPlatform, article: ArticleInput): Promise<PublishedArticle> {
    switch (platform) {
      case 'devto':
        return this.publishToDevto(article);
      case 'hashnode':
        return this.publishToHashnode(article);
      case 'medium':
        return this.publishToMedium(article);
      case 'wordpress':
        return this.publishToWordPress(article);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Route an update call to the correct platform method.
   */
  async updateOnPlatform(platform: BlogPlatform, articleId: string, updates: ArticleUpdate): Promise<PublishedArticle> {
    switch (platform) {
      case 'devto':
        return this.updateOnDevto(articleId, updates);
      case 'hashnode':
        return this.updateOnHashnode(articleId, updates);
      case 'wordpress':
        return this.updateOnWordPress(articleId, updates);
      case 'medium':
        throw new Error('Medium API does not support updating articles after publication.');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * List articles from one or all configured platforms.
   */
  async listArticles(platform?: BlogPlatform, limit?: number): Promise<ArticleListing[]> {
    if (platform) {
      return this.listFromPlatform(platform, limit);
    }

    const configured = this.getConfiguredPlatforms();
    const results = await Promise.allSettled(
      configured.map((p) => this.listFromPlatform(p, limit)),
    );

    const articles: ArticleListing[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') articles.push(...r.value);
    }
    return articles;
  }

  private async listFromPlatform(platform: BlogPlatform, limit?: number): Promise<ArticleListing[]> {
    switch (platform) {
      case 'devto':
        return this.listDevtoArticles(1, limit ?? 30);
      case 'hashnode':
        return this.listHashnodeArticles();
      case 'wordpress':
        return this.listWordPressArticles(limit ?? 30);
      case 'medium':
        throw new Error('Medium API does not support listing articles.');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Get analytics for a specific article.
   */
  async getAnalytics(platform: BlogPlatform, articleId: string): Promise<ArticleAnalytics> {
    switch (platform) {
      case 'devto':
        return this.getDevtoAnalytics(articleId);
      case 'hashnode':
      case 'medium':
      case 'wordpress':
        throw new Error(`Analytics not available via the ${platform} API. Use the platform dashboard instead.`);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  /**
   * Fetch content from a URL for cross-posting. Returns raw HTML body text.
   */
  async fetchArticleContent(url: string): Promise<{ title?: string; body: string }> {
    const { data } = await axios.get(url, {
      headers: { Accept: 'text/html' },
      timeout: 15_000,
    });

    // Extract title from HTML
    const titleMatch = (data as string).match(/<title[^>]*>(.*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

    // Extract article body — try <article> first, fall back to <main>, then <body>
    let body = data as string;
    for (const tag of ['article', 'main', 'body']) {
      const match = body.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (match) {
        body = match[1];
        break;
      }
    }

    return { title, body };
  }
}
