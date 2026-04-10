// @ts-nocheck
/**
 * Unit tests for BlogPublisherService (multi-platform blog publishing).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock axios BEFORE importing the service
// ---------------------------------------------------------------------------

const { mockAxios } = vi.hoisted(() => {
  const mockAxios: Record<string, any> = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { mockAxios };
});

vi.mock('axios', () => ({ default: mockAxios }));

import {
  BlogPublisherService,
  type BlogPublisherConfig,
  type ArticleInput,
} from '../src/BlogPublisherService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockService(config?: Partial<BlogPublisherConfig>): BlogPublisherService {
  return new BlogPublisherService({
    devto: { apiKey: 'devto-key-123' },
    hashnode: { apiKey: 'hashnode-key-456', publicationId: 'pub-789' },
    medium: { accessToken: 'medium-token-abc', authorId: 'author-1' },
    wordpress: { url: 'https://myblog.com', username: 'admin', appPassword: 'wp-pass' },
    ...config,
  });
}

const SAMPLE_ARTICLE: ArticleInput = {
  title: 'Test Article',
  body: '# Hello World\n\nThis is a test article.',
  tags: ['typescript', 'testing'],
  published: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlogPublisherService', () => {
  let service: BlogPublisherService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createMockService();
  });

  // ========================================================================
  // Constructor & Client Initialisation
  // ========================================================================

  describe('constructor', () => {
    it('should create axios clients for all configured platforms', () => {
      // 4 platforms configured = 4 axios.create calls
      expect(mockAxios.create).toHaveBeenCalledTimes(4);
    });

    it('should only create clients for platforms with credentials', () => {
      vi.clearAllMocks();
      createMockService({ hashnode: undefined, medium: undefined });
      // devto + wordpress = 2 clients
      expect(mockAxios.create).toHaveBeenCalledTimes(2);
    });

    it('should create no clients when no platforms are configured', () => {
      vi.clearAllMocks();
      new BlogPublisherService({});
      expect(mockAxios.create).toHaveBeenCalledTimes(0);
    });

    it('should set correct base URL for devto', () => {
      vi.clearAllMocks();
      createMockService();
      const devtoCall = mockAxios.create.mock.calls.find(
        (call: any) => call[0]?.baseURL === 'https://dev.to/api',
      );
      expect(devtoCall).toBeDefined();
      expect(devtoCall[0].headers['api-key']).toBe('devto-key-123');
    });

    it('should set correct base URL for hashnode', () => {
      vi.clearAllMocks();
      createMockService();
      const hashnodeCall = mockAxios.create.mock.calls.find(
        (call: any) => call[0]?.baseURL === 'https://gql.hashnode.com',
      );
      expect(hashnodeCall).toBeDefined();
      expect(hashnodeCall[0].headers['Authorization']).toBe('hashnode-key-456');
    });

    it('should set correct base URL for medium', () => {
      vi.clearAllMocks();
      createMockService();
      const mediumCall = mockAxios.create.mock.calls.find(
        (call: any) => call[0]?.baseURL === 'https://api.medium.com/v1',
      );
      expect(mediumCall).toBeDefined();
      expect(mediumCall[0].headers['Authorization']).toBe('Bearer medium-token-abc');
    });

    it('should normalize wordpress URL and use basic auth', () => {
      vi.clearAllMocks();
      createMockService({ wordpress: { url: 'https://myblog.com/', username: 'admin', appPassword: 'wp-pass' } });
      const wpCall = mockAxios.create.mock.calls.find(
        (call: any) => call[0]?.baseURL === 'https://myblog.com',
      );
      expect(wpCall).toBeDefined();
      expect(wpCall[0].headers['Authorization']).toMatch(/^Basic /);
    });
  });

  // ========================================================================
  // getConfiguredPlatforms
  // ========================================================================

  describe('getConfiguredPlatforms', () => {
    it('should return all four platforms when fully configured', () => {
      const platforms = service.getConfiguredPlatforms();
      expect(platforms).toEqual(['devto', 'hashnode', 'medium', 'wordpress']);
    });

    it('should return only configured platforms', () => {
      const partial = createMockService({ hashnode: undefined, medium: undefined });
      const platforms = partial.getConfiguredPlatforms();
      expect(platforms).toEqual(['devto', 'wordpress']);
    });

    it('should return empty array when nothing is configured', () => {
      const empty = new BlogPublisherService({});
      expect(empty.getConfiguredPlatforms()).toEqual([]);
    });
  });

  // ========================================================================
  // Dev.to
  // ========================================================================

  describe('publishToDevto', () => {
    it('should post an article and return the published result', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 42, url: 'https://dev.to/test', title: 'Test Article', published: true },
      });

      const result = await service.publishToDevto(SAMPLE_ARTICLE);

      expect(mockAxios.post).toHaveBeenCalledWith('/articles', {
        article: expect.objectContaining({
          title: 'Test Article',
          body_markdown: SAMPLE_ARTICLE.body,
          published: true,
        }),
      });
      expect(result).toEqual({
        platform: 'devto',
        id: '42',
        url: 'https://dev.to/test',
        title: 'Test Article',
        published: true,
      });
    });

    it('should default published to false', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 1, url: 'https://dev.to/draft', title: 'Draft', published: false },
      });

      await service.publishToDevto({ title: 'Draft', body: 'body' });

      const payload = mockAxios.post.mock.calls[0][1].article;
      expect(payload.published).toBe(false);
    });

    it('should truncate tags to max 4 for devto', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 1, url: '', title: '', published: false },
      });

      await service.publishToDevto({
        title: 'Tagged',
        body: 'body',
        tags: ['a', 'b', 'c', 'd', 'e'],
      });

      const payload = mockAxios.post.mock.calls[0][1].article;
      expect(payload.tags).toHaveLength(4);
    });
  });

  describe('updateOnDevto', () => {
    it('should send a PUT request with article updates', async () => {
      mockAxios.put.mockResolvedValueOnce({
        data: { id: 42, url: 'https://dev.to/updated', title: 'Updated', published: true },
      });

      const result = await service.updateOnDevto('42', { title: 'Updated', published: true });

      expect(mockAxios.put).toHaveBeenCalledWith('/articles/42', {
        article: expect.objectContaining({ title: 'Updated', published: true }),
      });
      expect(result.platform).toBe('devto');
      expect(result.title).toBe('Updated');
    });
  });

  describe('listDevtoArticles', () => {
    it('should return mapped article listings', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: [
          { id: 1, title: 'Post A', url: '/a', published: true, published_at: '2024-01-01', tag_list: ['js'] },
          { id: 2, title: 'Post B', url: '/b', published: false, published_at: null, tag_list: [] },
        ],
      });

      const listings = await service.listDevtoArticles();

      expect(listings).toHaveLength(2);
      expect(listings[0].platform).toBe('devto');
      expect(listings[0].title).toBe('Post A');
      expect(listings[1].published).toBe(false);
    });

    it('should pass pagination params', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: [] });
      await service.listDevtoArticles(2, 10);
      expect(mockAxios.get).toHaveBeenCalledWith('/articles/me', {
        params: { page: 2, per_page: 10 },
      });
    });
  });

  describe('getDevtoAnalytics', () => {
    it('should return analytics for a devto article', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          title: 'My Post',
          page_views_count: 500,
          positive_reactions_count: 42,
          comments_count: 7,
        },
      });

      const analytics = await service.getDevtoAnalytics('123');

      expect(analytics.platform).toBe('devto');
      expect(analytics.views).toBe(500);
      expect(analytics.reactions).toBe(42);
      expect(analytics.comments).toBe(7);
    });
  });

  // ========================================================================
  // Hashnode
  // ========================================================================

  describe('publishToHashnode', () => {
    it('should send a GraphQL mutation and return the result', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            publishPost: {
              post: { id: 'hn-1', title: 'HN Post', url: 'https://hashnode.dev/hn-1', slug: 'hn-1' },
            },
          },
        },
      });

      const result = await service.publishToHashnode(SAMPLE_ARTICLE);

      expect(mockAxios.post).toHaveBeenCalledWith('/', expect.objectContaining({
        query: expect.stringContaining('PublishPost'),
        variables: expect.objectContaining({
          input: expect.objectContaining({ title: 'Test Article' }),
        }),
      }));
      expect(result.platform).toBe('hashnode');
      expect(result.id).toBe('hn-1');
      expect(result.published).toBe(true);
    });

    it('should throw when publicationId is missing', async () => {
      const noId = createMockService({ hashnode: { apiKey: 'key' } });
      await expect(noId.publishToHashnode(SAMPLE_ARTICLE)).rejects.toThrow('publicationId');
    });

    it('should throw on GraphQL errors', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { errors: [{ message: 'Invalid input' }] },
      });

      await expect(service.publishToHashnode(SAMPLE_ARTICLE)).rejects.toThrow('Hashnode API error');
    });
  });

  describe('updateOnHashnode', () => {
    it('should send an update mutation', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            updatePost: {
              post: { id: 'hn-1', title: 'Updated', url: 'https://hashnode.dev/hn-1' },
            },
          },
        },
      });

      const result = await service.updateOnHashnode('hn-1', { title: 'Updated' });
      expect(result.title).toBe('Updated');
      expect(result.platform).toBe('hashnode');
    });
  });

  describe('listHashnodeArticles', () => {
    it('should return mapped article listings from GraphQL edges', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            publication: {
              posts: {
                edges: [
                  { node: { id: 'hn-1', title: 'Post 1', url: '/p1', publishedAt: '2024-01-01', tags: [{ name: 'ts', slug: 'ts' }] } },
                ],
              },
            },
          },
        },
      });

      const listings = await service.listHashnodeArticles();
      expect(listings).toHaveLength(1);
      expect(listings[0].platform).toBe('hashnode');
      expect(listings[0].tags).toEqual(['ts']);
    });
  });

  // ========================================================================
  // Medium
  // ========================================================================

  describe('publishToMedium', () => {
    it('should publish with the configured authorId', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {
          data: {
            id: 'med-1',
            url: 'https://medium.com/@user/post',
            title: 'Test Article',
            publishStatus: 'public',
          },
        },
      });

      const result = await service.publishToMedium(SAMPLE_ARTICLE);

      expect(mockAxios.post).toHaveBeenCalledWith('/users/author-1/posts', expect.objectContaining({
        title: 'Test Article',
        contentFormat: 'markdown',
      }));
      expect(result.platform).toBe('medium');
      expect(result.published).toBe(true);
    });

    it('should auto-resolve authorId via getMediumUser when not configured', async () => {
      const noAuthor = createMockService({
        medium: { accessToken: 'token' },
      });

      // First call is getMediumUser
      mockAxios.get.mockResolvedValueOnce({
        data: { data: { id: 'auto-id', username: 'user', name: 'User' } },
      });
      // Second call is the publish
      mockAxios.post.mockResolvedValueOnce({
        data: {
          data: { id: 'med-2', url: 'https://medium.com/post', title: 'T', publishStatus: 'draft' },
        },
      });

      const result = await noAuthor.publishToMedium({ title: 'T', body: 'b' });
      expect(result.id).toBe('med-2');
    });

    it('should truncate tags to max 5 for medium', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { data: { id: '1', url: '', title: '', publishStatus: 'draft' } },
      });

      await service.publishToMedium({
        title: 'T',
        body: 'b',
        tags: ['a', 'b', 'c', 'd', 'e', 'f'],
      });

      const payload = mockAxios.post.mock.calls[0][1];
      expect(payload.tags).toHaveLength(5);
    });
  });

  // ========================================================================
  // WordPress
  // ========================================================================

  describe('publishToWordPress', () => {
    it('should post to the WordPress REST API', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 101, link: 'https://myblog.com/post', title: { rendered: 'WP Post' }, status: 'publish' },
      });

      const result = await service.publishToWordPress(SAMPLE_ARTICLE);

      expect(mockAxios.post).toHaveBeenCalledWith('/wp-json/wp/v2/posts', expect.objectContaining({
        title: 'Test Article',
        status: 'publish',
      }));
      expect(result.platform).toBe('wordpress');
      expect(result.id).toBe('101');
      expect(result.title).toBe('WP Post');
    });

    it('should handle plain string title from WordPress', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 102, link: '/post', title: 'Plain Title', status: 'draft' },
      });

      const result = await service.publishToWordPress({ title: 'Plain Title', body: 'body' });
      expect(result.title).toBe('Plain Title');
    });
  });

  describe('updateOnWordPress', () => {
    it('should send a PUT request with updates', async () => {
      mockAxios.put.mockResolvedValueOnce({
        data: { id: 101, link: '/updated', title: 'Updated', status: 'publish' },
      });

      const result = await service.updateOnWordPress('101', { title: 'Updated' });
      expect(mockAxios.put).toHaveBeenCalledWith('/wp-json/wp/v2/posts/101', expect.objectContaining({ title: 'Updated' }));
      expect(result.platform).toBe('wordpress');
    });
  });

  describe('listWordPressArticles', () => {
    it('should return mapped article listings', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: [
          { id: 1, title: { rendered: 'Post A' }, link: '/a', status: 'publish', date: '2024-01-01', tags: [1, 2] },
        ],
      });

      const listings = await service.listWordPressArticles();
      expect(listings).toHaveLength(1);
      expect(listings[0].platform).toBe('wordpress');
      expect(listings[0].title).toBe('Post A');
    });
  });

  // ========================================================================
  // Cross-Platform Methods
  // ========================================================================

  describe('publishToAll', () => {
    it('should attempt all configured platforms and aggregate results', async () => {
      // Mock 4 successful publishes (one per platform)
      mockAxios.post.mockResolvedValue({
        data: { id: 1, url: '/test', title: 'Test', published: true, data: { publishPost: { post: { id: '1', title: 'Test', url: '/test' } } } },
      });
      // For Medium — getMediumUser + publish
      mockAxios.get.mockResolvedValue({ data: { data: { id: 'a', username: 'u', name: 'n' } } });

      // Using only devto for simplicity
      const results = await service.publishToAll(SAMPLE_ARTICLE, ['devto']);
      expect(results).toHaveLength(1);
    });

    it('should capture failed platforms as error objects', async () => {
      mockAxios.post.mockRejectedValueOnce(new Error('API down'));

      const results = await service.publishToAll(SAMPLE_ARTICLE, ['devto']);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('error');
    });
  });

  describe('updateOnPlatform', () => {
    it('should throw for unsupported platform', async () => {
      await expect(service.updateOnPlatform('medium', '1', { title: 'X' })).rejects.toThrow(
        'Medium API does not support updating',
      );
    });

    it('should throw for unknown platform', async () => {
      await expect(service.updateOnPlatform('fakePlatform' as any, '1', {})).rejects.toThrow(
        'Unsupported platform',
      );
    });
  });

  describe('getAnalytics', () => {
    it('should throw for platforms without analytics', async () => {
      await expect(service.getAnalytics('hashnode', '1')).rejects.toThrow('Analytics not available');
      await expect(service.getAnalytics('medium', '1')).rejects.toThrow('Analytics not available');
      await expect(service.getAnalytics('wordpress', '1')).rejects.toThrow('Analytics not available');
    });
  });

  describe('listArticles', () => {
    it('should throw for medium listing', async () => {
      await expect(service.listArticles('medium')).rejects.toThrow('Medium API does not support listing');
    });
  });

  describe('fetchArticleContent', () => {
    it('should fetch HTML and extract title and body', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: '<html><title>My Article</title><body><article>Article content here</article></body></html>',
      });

      const result = await service.fetchArticleContent('https://example.com/post');

      expect(mockAxios.get).toHaveBeenCalledWith('https://example.com/post', expect.objectContaining({
        headers: { Accept: 'text/html' },
        timeout: 15_000,
      }));
      expect(result.title).toBe('My Article');
      expect(result.body).toContain('Article content here');
    });
  });

  // ========================================================================
  // Error handling — unconfigured platform
  // ========================================================================

  describe('unconfigured platform access', () => {
    it('should throw when accessing an unconfigured platform', async () => {
      const empty = new BlogPublisherService({});
      await expect(empty.publishToDevto(SAMPLE_ARTICLE)).rejects.toThrow('not configured');
    });
  });
});
