// @ts-nocheck
/**
 * Unit tests for LemmyService (Lemmy HTTP API v3 wrapper).
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

import { LemmyService, type LemmyConfig } from '../src/LemmyService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<LemmyConfig> = {}): LemmyConfig {
  return {
    instanceUrl: 'https://lemmy.example.com',
    username: 'testuser',
    password: 'testpass',
    ...overrides,
  };
}

async function createInitializedService(config?: LemmyConfig): Promise<LemmyService> {
  mockAxios.post.mockResolvedValueOnce({ data: { jwt: 'mock-jwt-token' } });
  const service = new LemmyService(config ?? createConfig());
  await service.initialize();
  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LemmyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset defaults that initialize sets
    mockAxios.defaults = { headers: { common: {} } };
  });

  // ========================================================================
  // Constructor
  // ========================================================================

  describe('constructor', () => {
    it('should store config and start with isRunning false', () => {
      const service = new LemmyService(createConfig());
      expect(service.isRunning).toBe(false);
    });

    it('should not create an HTTP client in the constructor', () => {
      new LemmyService(createConfig());
      expect(mockAxios.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // initialize
  // ========================================================================

  describe('initialize', () => {
    it('should create an axios client, login, and set isRunning to true', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { jwt: 'jwt-123' } });

      const service = new LemmyService(createConfig());
      await service.initialize();

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://lemmy.example.com',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/user/login', {
        username_or_email: 'testuser',
        password: 'testpass',
      });
      expect(service.isRunning).toBe(true);
    });

    it('should normalize instance URL by removing trailing slash', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { jwt: 'jwt-123' } });

      const service = new LemmyService(createConfig({ instanceUrl: 'https://lemmy.example.com///' }));
      await service.initialize();

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://lemmy.example.com' }),
      );
    });

    it('should set Authorization header with the JWT', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { jwt: 'jwt-xyz' } });

      const service = new LemmyService(createConfig());
      await service.initialize();

      expect(mockAxios.defaults.headers.common['Authorization']).toBe('Bearer jwt-xyz');
    });

    it('should throw when no instance URL is provided', async () => {
      const service = new LemmyService(createConfig({ instanceUrl: '' }));
      await expect(service.initialize()).rejects.toThrow('no instance URL');
    });

    it('should throw when no username is provided', async () => {
      const service = new LemmyService(createConfig({ username: '' }));
      await expect(service.initialize()).rejects.toThrow('no credentials');
    });

    it('should throw when no password is provided', async () => {
      const service = new LemmyService(createConfig({ password: '' }));
      await expect(service.initialize()).rejects.toThrow('no credentials');
    });

    it('should throw when login returns no JWT', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      const service = new LemmyService(createConfig());
      await expect(service.initialize()).rejects.toThrow('login failed');
    });
  });

  // ========================================================================
  // shutdown
  // ========================================================================

  describe('shutdown', () => {
    it('should set isRunning to false and clear client', async () => {
      const service = await createInitializedService();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should be safe to call when not initialized', async () => {
      const service = new LemmyService(createConfig());
      await service.shutdown(); // should not throw
      expect(service.isRunning).toBe(false);
    });

    it('should cause subsequent API calls to throw', async () => {
      const service = await createInitializedService();
      await service.shutdown();

      await expect(service.createPost(1, 'Test')).rejects.toThrow('not initialized');
    });
  });

  // ========================================================================
  // Posts
  // ========================================================================

  describe('createPost', () => {
    it('should POST to /api/v3/post and return mapped result', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          post_view: {
            post: {
              id: 42,
              name: 'Test Post',
              body: 'Body content',
              url: 'https://link.com',
              community_id: 5,
              creator_id: 1,
              published: '2024-01-01',
            },
          },
        },
      });

      const result = await service.createPost(5, 'Test Post', 'Body content', 'https://link.com');

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/post', {
        community_id: 5,
        name: 'Test Post',
        body: 'Body content',
        url: 'https://link.com',
      });
      expect(result.id).toBe(42);
      expect(result.name).toBe('Test Post');
      expect(result.communityId).toBe(5);
    });

    it('should throw when service is not initialized', async () => {
      const service = new LemmyService(createConfig());
      await expect(service.createPost(1, 'Test')).rejects.toThrow('not initialized');
    });
  });

  describe('getPost', () => {
    it('should GET /api/v3/post with id param and return mapped result', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          post_view: {
            post: { id: 10, name: 'Found', body: 'Content', community_id: 2, creator_id: 1 },
            counts: { score: 15 },
          },
        },
      });

      const result = await service.getPost(10);

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/post', { params: { id: 10 } });
      expect(result).not.toBeNull();
      expect(result!.id).toBe(10);
      expect(result!.score).toBe(15);
    });

    it('should return null when post is not found', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockRejectedValueOnce(new Error('Not found'));

      const result = await service.getPost(999);
      expect(result).toBeNull();
    });

    it('should return null when response has no post data', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: { post_view: {} } });

      const result = await service.getPost(999);
      expect(result).toBeNull();
    });
  });

  describe('deletePost', () => {
    it('should POST to /api/v3/post/delete with post_id and deleted flag', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.deletePost(42);

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/post/delete', {
        post_id: 42,
        deleted: true,
      });
    });
  });

  // ========================================================================
  // Comments
  // ========================================================================

  describe('createComment', () => {
    it('should POST to /api/v3/comment and return mapped result', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          comment_view: {
            comment: {
              id: 100,
              content: 'Nice post!',
              post_id: 42,
              creator_id: 1,
              published: '2024-01-02',
            },
          },
        },
      });

      const result = await service.createComment(42, 'Nice post!');

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/comment', {
        post_id: 42,
        content: 'Nice post!',
      });
      expect(result.id).toBe(100);
      expect(result.content).toBe('Nice post!');
      expect(result.postId).toBe(42);
    });

    it('should include parent_id for nested replies', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          comment_view: {
            comment: { id: 101, content: 'Reply', post_id: 42, parent_id: 100, creator_id: 1 },
          },
        },
      });

      const result = await service.createComment(42, 'Reply', 100);

      const callBody = mockAxios.post.mock.calls[mockAxios.post.mock.calls.length - 1][1];
      expect(callBody.parent_id).toBe(100);
      expect(result.parentId).toBe(100);
    });
  });

  // ========================================================================
  // Voting
  // ========================================================================

  describe('vote', () => {
    it('should POST to /api/v3/post/like for post votes', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.vote('post', 42, 1);

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/post/like', {
        post_id: 42,
        score: 1,
      });
    });

    it('should POST to /api/v3/comment/like for comment votes', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.vote('comment', 100, -1);

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/comment/like', {
        comment_id: 100,
        score: -1,
      });
    });

    it('should support neutral votes (score 0)', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.vote('post', 42, 0);

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/post/like', {
        post_id: 42,
        score: 0,
      });
    });
  });

  // ========================================================================
  // Search
  // ========================================================================

  describe('search', () => {
    it('should GET /api/v3/search with query params and return mapped results', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          posts: [
            { post: { id: 1, name: 'P1', community_id: 2, creator_id: 1 }, counts: { score: 5 } },
          ],
          comments: [
            { comment: { id: 10, content: 'C1', post_id: 1, creator_id: 1 }, counts: { score: 3 } },
          ],
          communities: [
            { community: { id: 2, name: 'tech', title: 'Technology', description: 'Tech stuff' } },
          ],
        },
      });

      const result = await service.search('test query', 'All', 10);

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/search', {
        params: { q: 'test query', type_: 'All', limit: 10 },
      });
      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].score).toBe(5);
      expect(result.comments).toHaveLength(1);
      expect(result.communities).toHaveLength(1);
      expect(result.communities[0].name).toBe('tech');
    });

    it('should use defaults for optional parameters', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: { posts: [], comments: [], communities: [] } });

      await service.search('query');

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/search', {
        params: { q: 'query', type_: 'All', limit: 10 },
      });
    });

    it('should handle empty search results', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const result = await service.search('empty');
      expect(result.posts).toEqual([]);
      expect(result.comments).toEqual([]);
      expect(result.communities).toEqual([]);
    });
  });

  // ========================================================================
  // Communities
  // ========================================================================

  describe('subscribeToCommunity', () => {
    it('should POST to /api/v3/community/follow', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.subscribeToCommunity(5, true);

      expect(mockAxios.post).toHaveBeenCalledWith('/api/v3/community/follow', {
        community_id: 5,
        follow: true,
      });
    });

    it('should support unsubscribing with follow=false', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      await service.subscribeToCommunity(5, false);

      const callBody = mockAxios.post.mock.calls[mockAxios.post.mock.calls.length - 1][1];
      expect(callBody.follow).toBe(false);
    });
  });

  describe('getCommunity', () => {
    it('should GET /api/v3/community and return community info', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          community_view: {
            community: { id: 5, name: 'tech', title: 'Technology', description: 'Tech forum' },
          },
        },
      });

      const result = await service.getCommunity('tech');

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/community', { params: { name: 'tech' } });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('tech');
      expect(result!.title).toBe('Technology');
    });

    it('should return null when community is not found', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockRejectedValueOnce(new Error('Not found'));

      const result = await service.getCommunity('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ========================================================================
  // Feed
  // ========================================================================

  describe('getFeed', () => {
    it('should GET /api/v3/post/list and return mapped posts', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          posts: [
            {
              post: { id: 1, name: 'Feed Post', body: 'Content', community_id: 2, creator_id: 1 },
              counts: { score: 10 },
            },
          ],
        },
      });

      const results = await service.getFeed('All', 'Hot', 20);

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/post/list', {
        params: { type_: 'All', sort: 'Hot', limit: 20 },
      });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Feed Post');
      expect(results[0].score).toBe(10);
    });

    it('should use default params when not specified', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: { posts: [] } });

      await service.getFeed();

      expect(mockAxios.get).toHaveBeenCalledWith('/api/v3/post/list', {
        params: { type_: 'All', sort: 'Hot', limit: 20 },
      });
    });

    it('should handle empty feed', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const results = await service.getFeed();
      expect(results).toEqual([]);
    });
  });
});
