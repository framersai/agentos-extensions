/**
 * @fileoverview Unit tests for ThreadsService.
 *
 * Validates lifecycle management, text/image/video/carousel posting,
 * replies, likes, quotes, user threads retrieval, insights, and deletion.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxios } = vi.hoisted(() => {
  const mockAxios: Record<string, any> = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { mockAxios };
});
vi.mock('axios', () => ({ default: mockAxios }));
import { ThreadsService, type ThreadsConfig } from '../src/ThreadsService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<ThreadsConfig>): ThreadsConfig {
  return {
    accessToken: 'test-token-123',
    userId: 'user-42',
    ...overrides,
  };
}

function resetMocks(): void {
  mockAxios.get.mockReset();
  mockAxios.post.mockReset();
  mockAxios.delete.mockReset();
  mockAxios.create.mockReset();
  mockAxios.create.mockReturnValue(mockAxios);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadsService', () => {
  let service: ThreadsService;

  beforeEach(() => {
    resetMocks();
    service = new ThreadsService(makeConfig());
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should initialise with userId from config and set running = true', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://graph.threads.net/v1.0',
        }),
      );
    });

    it('should resolve userId from /me when not provided in config', async () => {
      service = new ThreadsService(makeConfig({ userId: undefined }));
      mockAxios.get.mockResolvedValueOnce({
        data: { id: 'resolved-id', username: 'alice' },
      });

      await service.initialize();

      expect(service.isRunning).toBe(true);
      expect(mockAxios.get).toHaveBeenCalledWith('/me', expect.any(Object));
    });

    it('should throw if accessToken is missing', async () => {
      service = new ThreadsService(makeConfig({ accessToken: '' }));
      await expect(service.initialize()).rejects.toThrow('no access token');
    });

    it('should shut down cleanly', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should throw when calling methods before initialize', () => {
      expect(() => (service as any).requireClient()).toThrow('not initialized');
    });
  });

  // ── Profile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return mapped profile fields', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          id: 'u-1',
          username: 'alice',
          threads_profile_picture_url: 'https://img.test/pic.jpg',
        },
      });

      const profile = await service.getProfile();

      expect(profile).toEqual({
        id: 'u-1',
        username: 'alice',
        threadsProfilePictureUrl: 'https://img.test/pic.jpg',
      });
    });
  });

  // ── Text Post ───────────────────────────────────────────────────────────

  describe('createTextPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create container then publish', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'container-1' } })   // create container
        .mockResolvedValueOnce({ data: { id: 'published-1' } });  // publish

      const result = await service.createTextPost('Hello Threads!');

      expect(result).toEqual({ id: 'published-1', text: 'Hello Threads!' });
      expect(mockAxios.post).toHaveBeenCalledTimes(2);
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        1,
        '/user-42/threads',
        null,
        expect.objectContaining({
          params: { media_type: 'TEXT', text: 'Hello Threads!' },
        }),
      );
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        2,
        '/user-42/threads_publish',
        null,
        expect.objectContaining({
          params: { creation_id: 'container-1' },
        }),
      );
    });
  });

  // ── Image Post ──────────────────────────────────────────────────────────

  describe('createImagePost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create container, poll until FINISHED, then publish', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'img-container-1' } })
        .mockResolvedValueOnce({ data: { id: 'published-img' } });

      // Poll returns FINISHED immediately
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      const result = await service.createImagePost('Look at this!', 'https://img.test/photo.jpg');

      expect(result).toEqual({
        id: 'published-img',
        text: 'Look at this!',
        mediaUrl: 'https://img.test/photo.jpg',
      });
      // get called once for polling
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/img-container-1',
        expect.objectContaining({ params: { fields: 'status,error_message' } }),
      );
    });

    it('should throw if container polling returns ERROR', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'bad-container' } });
      mockAxios.get.mockResolvedValueOnce({
        data: { status: 'ERROR', error_message: 'Invalid image format' },
      });

      await expect(
        service.createImagePost('Fail', 'https://img.test/bad.bmp'),
      ).rejects.toThrow('Invalid image format');
    });
  });

  // ── Video Post ──────────────────────────────────────────────────────────

  describe('createVideoPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create video container with poll parameters', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'vid-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-vid' } });
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      const result = await service.createVideoPost('Watch this', 'https://cdn.test/clip.mp4');

      expect(result).toEqual({
        id: 'published-vid',
        text: 'Watch this',
        mediaUrl: 'https://cdn.test/clip.mp4',
      });
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        1,
        '/user-42/threads',
        null,
        expect.objectContaining({
          params: { media_type: 'VIDEO', text: 'Watch this', video_url: 'https://cdn.test/clip.mp4' },
        }),
      );
    });
  });

  // ── Carousel Post ───────────────────────────────────────────────────────

  describe('createCarouselPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create child containers, poll each, create carousel, and publish', async () => {
      // Two child containers, then carousel container, then publish
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'child-1' } })
        .mockResolvedValueOnce({ data: { id: 'child-2' } })
        .mockResolvedValueOnce({ data: { id: 'carousel-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-carousel' } });

      // Two poll calls for children (both FINISHED immediately)
      mockAxios.get
        .mockResolvedValueOnce({ data: { status: 'FINISHED' } })
        .mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      const items = [
        { type: 'IMAGE' as const, url: 'https://img.test/a.jpg' },
        { type: 'VIDEO' as const, url: 'https://vid.test/b.mp4' },
      ];

      const result = await service.createCarouselPost('Swipe!', items);

      expect(result).toEqual({ id: 'published-carousel', text: 'Swipe!' });
      // 4 POST calls total: 2 children + 1 carousel + 1 publish
      expect(mockAxios.post).toHaveBeenCalledTimes(4);
    });
  });

  // ── Reply ───────────────────────────────────────────────────────────────

  describe('replyToPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create a text reply without polling', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'reply-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-reply' } });

      const result = await service.replyToPost('parent-post-1', 'Nice post!');

      expect(result).toEqual({ id: 'published-reply', text: 'Nice post!' });
      // No polling for text-only reply
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it('should poll when media is attached to reply', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'reply-media-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-media-reply' } });
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      const result = await service.replyToPost(
        'parent-post-2',
        'Here is a pic!',
        'https://img.test/reply.jpg',
      );

      expect(result).toEqual({ id: 'published-media-reply', text: 'Here is a pic!' });
      expect(mockAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should detect video URLs and set media_type to VIDEO', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'vid-reply-c' } })
        .mockResolvedValueOnce({ data: { id: 'vid-reply-pub' } });
      mockAxios.get.mockResolvedValueOnce({ data: { status: 'FINISHED' } });

      await service.replyToPost('parent-3', 'Video reply', 'https://cdn.test/clip.mp4');

      expect(mockAxios.post).toHaveBeenNthCalledWith(
        1,
        '/user-42/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({ media_type: 'VIDEO', video_url: 'https://cdn.test/clip.mp4' }),
        }),
      );
    });
  });

  // ── Like / Unlike ──────────────────────────────────────────────────────

  describe('likePost / unlikePost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should POST to /{postId}/likes', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });
      await service.likePost('post-99');
      expect(mockAxios.post).toHaveBeenCalledWith('/post-99/likes');
    });

    it('should DELETE /{postId}/likes for unlike', async () => {
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });
      await service.unlikePost('post-99');
      expect(mockAxios.delete).toHaveBeenCalledWith('/post-99/likes');
    });
  });

  // ── Quote ──────────────────────────────────────────────────────────────

  describe('quotePost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create a quote container and publish', async () => {
      mockAxios.post
        .mockResolvedValueOnce({ data: { id: 'quote-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-quote' } });

      const result = await service.quotePost('original-post-1', 'So true!');

      expect(result).toEqual({ id: 'published-quote', text: 'So true!' });
      expect(mockAxios.post).toHaveBeenNthCalledWith(
        1,
        '/user-42/threads',
        null,
        expect.objectContaining({
          params: expect.objectContaining({ quote_post_id: 'original-post-1' }),
        }),
      );
    });
  });

  // ── User Threads ────────────────────────────────────────────────────────

  describe('getUserThreads', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return mapped thread results', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { id: 't-1', text: 'First', timestamp: '2025-01-01', media_url: null, permalink: 'https://threads.net/t/t-1' },
            { id: 't-2', text: 'Second', timestamp: '2025-01-02', media_url: 'https://img/2.jpg', permalink: 'https://threads.net/t/t-2' },
          ],
        },
      });

      const threads = await service.getUserThreads();

      expect(threads).toHaveLength(2);
      expect(threads[0]).toEqual({
        id: 't-1',
        text: 'First',
        timestamp: '2025-01-01',
        mediaUrl: null,
        permalink: 'https://threads.net/t/t-1',
      });
    });

    it('should cap limit at 100', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });
      await service.getUserThreads(undefined, 999);
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/user-42/threads',
        expect.objectContaining({
          params: expect.objectContaining({ limit: 100 }),
        }),
      );
    });

    it('should allow querying a different user', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });
      await service.getUserThreads('other-user-7');
      expect(mockAxios.get).toHaveBeenCalledWith(
        '/other-user-7/threads',
        expect.any(Object),
      );
    });
  });

  // ── Insights ────────────────────────────────────────────────────────────

  describe('getPostInsights', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should map insight metrics correctly', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { name: 'views', values: [{ value: 1500 }] },
            { name: 'likes', values: [{ value: 42 }] },
            { name: 'replies', values: [{ value: 10 }] },
            { name: 'reposts', values: [{ value: 5 }] },
            { name: 'quotes', values: [{ value: 3 }] },
          ],
        },
      });

      const insights = await service.getPostInsights('post-abc');

      expect(insights).toEqual({
        postId: 'post-abc',
        views: 1500,
        likes: 42,
        replies: 10,
        reposts: 5,
        quotes: 3,
      });
    });

    it('should default missing metrics to 0', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });

      const insights = await service.getPostInsights('post-empty');

      expect(insights).toEqual({
        postId: 'post-empty',
        views: 0,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
      });
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('should DELETE /{postId}', async () => {
      await service.initialize();
      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });
      await service.deletePost('post-to-delete');
      expect(mockAxios.delete).toHaveBeenCalledWith('/post-to-delete');
    });
  });

  // ── Poll container timeout ─────────────────────────────────────────────

  describe('pollContainerStatus', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should throw after maxAttempts when status stays IN_PROGRESS', async () => {
      // Set up createImagePost to get a container, then poll times out
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'stuck-container' } });
      // All poll responses return IN_PROGRESS
      for (let i = 0; i < 20; i++) {
        mockAxios.get.mockResolvedValueOnce({ data: { status: 'IN_PROGRESS' } });
      }

      await expect(
        service.createImagePost('Stuck', 'https://img.test/stuck.jpg'),
      ).rejects.toThrow('did not reach FINISHED status');
    }, 60_000);
  });
});
