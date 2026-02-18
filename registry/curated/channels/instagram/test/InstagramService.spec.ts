/**
 * @fileoverview Tests for InstagramService — the HTTP service layer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock axios before importing the service
// ---------------------------------------------------------------------------

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: mockGet,
      post: mockPost,
    }),
  },
}));

import axios from 'axios';
import { InstagramService } from '../src/InstagramService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(config = { accessToken: 'test-token', igUserId: 'ig-user-123' }) {
  return new InstagramService(config);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstagramService', () => {
  let service: InstagramService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  // ── Constructor ──

  describe('constructor', () => {
    it('should store config without initializing the HTTP client', () => {
      const svc = new InstagramService({ accessToken: 'tok123' });
      expect(svc.isRunning).toBe(false);
    });
  });

  // ── initialize ──

  describe('initialize()', () => {
    it('should create an axios client with the correct base URL and access token', async () => {
      await service.initialize();

      expect(axios.create).toHaveBeenCalledWith({
        baseURL: 'https://graph.facebook.com/v21.0',
        params: { access_token: 'test-token' },
      });
    });

    it('should set isRunning to true after initialization', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should use provided igUserId without calling /me', async () => {
      await service.initialize();
      // /me should NOT have been called because igUserId was provided
      expect(mockGet).not.toHaveBeenCalledWith('/me', expect.anything());
    });

    it('should resolve igUserId from /me when not provided in config', async () => {
      const svc = new InstagramService({ accessToken: 'tok' });
      mockGet.mockResolvedValueOnce({ data: { id: 'resolved-id-456' } });

      await svc.initialize();

      expect(mockGet).toHaveBeenCalledWith('/me', { params: { fields: 'id' } });
      expect(svc.isRunning).toBe(true);
    });
  });

  // ── shutdown ──

  describe('shutdown()', () => {
    it('should set isRunning to false', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should null out the client so subsequent calls throw', async () => {
      await service.initialize();
      await service.shutdown();

      await expect(service.postPhoto('url', 'cap')).rejects.toThrow('Instagram service not initialized');
    });
  });

  // ── Error when not initialized ──

  describe('methods throw when not initialized', () => {
    it('postPhoto should throw', async () => {
      await expect(service.postPhoto('url')).rejects.toThrow('Instagram service not initialized');
    });

    it('postCarousel should throw', async () => {
      await expect(service.postCarousel([{ imageUrl: 'url' }])).rejects.toThrow('Instagram service not initialized');
    });

    it('postReel should throw', async () => {
      await expect(service.postReel('url')).rejects.toThrow('Instagram service not initialized');
    });

    it('postStory should throw', async () => {
      await expect(service.postStory('url')).rejects.toThrow('Instagram service not initialized');
    });

    it('commentOnMedia should throw', async () => {
      await expect(service.commentOnMedia('id', 'text')).rejects.toThrow('Instagram service not initialized');
    });

    it('searchHashtag should throw', async () => {
      await expect(service.searchHashtag('test')).rejects.toThrow('Instagram service not initialized');
    });

    it('getHashtagTopMedia should throw', async () => {
      await expect(service.getHashtagTopMedia('h1')).rejects.toThrow('Instagram service not initialized');
    });

    it('getMediaInsights should throw', async () => {
      await expect(service.getMediaInsights('m1')).rejects.toThrow('Instagram service not initialized');
    });

    it('getAccountInsights should throw', async () => {
      await expect(service.getAccountInsights()).rejects.toThrow('Instagram service not initialized');
    });

    it('getRecentMedia should throw', async () => {
      await expect(service.getRecentMedia()).rejects.toThrow('Instagram service not initialized');
    });
  });

  // ── postPhoto ──

  describe('postPhoto()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should create a media container then publish it', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'container-1' } }) // create container
        .mockResolvedValueOnce({ data: { id: 'published-1' } }); // publish

      const result = await service.postPhoto('https://example.com/photo.jpg', 'My caption');

      expect(mockPost).toHaveBeenCalledTimes(2);

      // Step 1: Create container
      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: { image_url: 'https://example.com/photo.jpg', caption: 'My caption' },
      });

      // Step 2: Publish
      expect(mockPost).toHaveBeenNthCalledWith(2, '/ig-user-123/media_publish', null, {
        params: { creation_id: 'container-1' },
      });

      expect(result).toEqual({ id: 'published-1' });
    });

    it('should default caption to empty string when not provided', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'c1' } })
        .mockResolvedValueOnce({ data: { id: 'p1' } });

      await service.postPhoto('https://example.com/photo.jpg');

      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: { image_url: 'https://example.com/photo.jpg', caption: '' },
      });
    });
  });

  // ── postCarousel ──

  describe('postCarousel()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should create child containers, carousel container, then publish', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'child-1' } })
        .mockResolvedValueOnce({ data: { id: 'child-2' } })
        .mockResolvedValueOnce({ data: { id: 'carousel-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-carousel' } });

      const items = [
        { imageUrl: 'https://example.com/a.jpg' },
        { imageUrl: 'https://example.com/b.jpg' },
      ];
      const result = await service.postCarousel(items, 'Carousel cap');

      expect(mockPost).toHaveBeenCalledTimes(4);

      // Child 1
      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: { image_url: 'https://example.com/a.jpg', is_carousel_item: true },
      });

      // Child 2
      expect(mockPost).toHaveBeenNthCalledWith(2, '/ig-user-123/media', null, {
        params: { image_url: 'https://example.com/b.jpg', is_carousel_item: true },
      });

      // Carousel container
      expect(mockPost).toHaveBeenNthCalledWith(3, '/ig-user-123/media', null, {
        params: {
          media_type: 'CAROUSEL',
          children: 'child-1,child-2',
          caption: 'Carousel cap',
        },
      });

      // Publish
      expect(mockPost).toHaveBeenNthCalledWith(4, '/ig-user-123/media_publish', null, {
        params: { creation_id: 'carousel-container' },
      });

      expect(result).toEqual({ id: 'published-carousel' });
    });
  });

  // ── postReel ──

  describe('postReel()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should create a REELS container, wait for processing, then publish', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'reel-container' } }) // create
        .mockResolvedValueOnce({ data: { id: 'published-reel' } }); // publish

      // waitForMediaReady polls via GET
      mockGet.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

      const result = await service.postReel('https://example.com/vid.mp4', 'Reel cap');

      // Container creation
      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: {
          media_type: 'REELS',
          video_url: 'https://example.com/vid.mp4',
          caption: 'Reel cap',
        },
      });

      // Status check
      expect(mockGet).toHaveBeenCalledWith('/reel-container', { params: { fields: 'status_code' } });

      // Publish
      expect(mockPost).toHaveBeenNthCalledWith(2, '/ig-user-123/media_publish', null, {
        params: { creation_id: 'reel-container' },
      });

      expect(result).toEqual({ id: 'published-reel' });
    });

    it('should include cover_url when provided', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'reel-c' } })
        .mockResolvedValueOnce({ data: { id: 'pub-reel' } });
      mockGet.mockResolvedValueOnce({ data: { status_code: 'FINISHED' } });

      await service.postReel('https://example.com/vid.mp4', 'cap', 'https://example.com/cover.jpg');

      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: {
          media_type: 'REELS',
          video_url: 'https://example.com/vid.mp4',
          caption: 'cap',
          cover_url: 'https://example.com/cover.jpg',
        },
      });
    });

    it('should throw when media processing returns ERROR', async () => {
      mockPost.mockResolvedValueOnce({ data: { id: 'reel-err' } });
      mockGet.mockResolvedValueOnce({ data: { status_code: 'ERROR' } });

      await expect(service.postReel('url')).rejects.toThrow('Media processing failed');
    });

    it('should throw when media processing times out', async () => {
      mockPost.mockResolvedValueOnce({ data: { id: 'reel-timeout' } });
      // Always return IN_PROGRESS
      mockGet.mockResolvedValue({ data: { status_code: 'IN_PROGRESS' } });

      // Use a very small maxWait so the test doesn't actually wait
      // We need to access the private method indirectly via postReel
      // The waitForMediaReady has maxWait=60000 by default — we'll test timeout via a custom approach
      // Instead, let's mock Date.now to simulate time passing
      const realDateNow = Date.now;
      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call (start): return 0
        // Second call (while check): return past the max wait
        if (callCount <= 1) return 0;
        return 70000; // past 60000ms maxWait
      });

      await expect(service.postReel('url')).rejects.toThrow('Media processing timed out');

      vi.spyOn(Date, 'now').mockRestore();
    });
  });

  // ── postStory ──

  describe('postStory()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should create a STORIES container then publish', async () => {
      mockPost
        .mockResolvedValueOnce({ data: { id: 'story-container' } })
        .mockResolvedValueOnce({ data: { id: 'published-story' } });

      const result = await service.postStory('https://example.com/story.jpg');

      expect(mockPost).toHaveBeenNthCalledWith(1, '/ig-user-123/media', null, {
        params: { image_url: 'https://example.com/story.jpg', media_type: 'STORIES' },
      });

      expect(mockPost).toHaveBeenNthCalledWith(2, '/ig-user-123/media_publish', null, {
        params: { creation_id: 'story-container' },
      });

      expect(result).toEqual({ id: 'published-story' });
    });
  });

  // ── likeMedia ──

  describe('likeMedia()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should log intent without making an API call', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.likeMedia('media-555');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[InstagramService] Like requested for media-555 — requires browser automation',
      );
      expect(mockPost).not.toHaveBeenCalled();
      expect(mockGet).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  // ── commentOnMedia ──

  describe('commentOnMedia()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should POST a comment and return the comment ID', async () => {
      mockPost.mockResolvedValueOnce({ data: { id: 'comment-abc' } });

      const result = await service.commentOnMedia('media-123', 'Great post!');

      expect(mockPost).toHaveBeenCalledWith('/media-123/comments', null, {
        params: { message: 'Great post!' },
      });
      expect(result).toEqual({ id: 'comment-abc' });
    });
  });

  // ── searchHashtag ──

  describe('searchHashtag()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should search and return a HashtagResult', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [{ id: 'ht-1' }] } });

      const result = await service.searchHashtag('travel');

      expect(mockGet).toHaveBeenCalledWith('/ig_hashtag_search', {
        params: { q: 'travel', user_id: 'ig-user-123' },
      });
      expect(result).toEqual({ id: 'ht-1', name: 'travel', mediaCount: 0 });
    });

    it('should return null when no hashtag found', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      const result = await service.searchHashtag('nonexistent');
      expect(result).toBeNull();
    });

    it('should return null when data is undefined', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });

      const result = await service.searchHashtag('missing');
      expect(result).toBeNull();
    });
  });

  // ── getHashtagTopMedia ──

  describe('getHashtagTopMedia()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should return mapped ExploreResult array', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'media-1',
              media_type: 'IMAGE',
              media_url: 'https://example.com/m1.jpg',
              caption: 'Travel pic',
              like_count: 50,
              comments_count: 5,
              timestamp: '2026-01-01T00:00:00Z',
            },
          ],
        },
      });

      const result = await service.getHashtagTopMedia('ht-1');

      expect(mockGet).toHaveBeenCalledWith('/ht-1/top_media', {
        params: {
          user_id: 'ig-user-123',
          fields: 'id,media_type,media_url,caption,like_count,comments_count,timestamp',
        },
      });

      expect(result).toEqual([
        {
          id: 'media-1',
          mediaType: 'IMAGE',
          mediaUrl: 'https://example.com/m1.jpg',
          caption: 'Travel pic',
          likeCount: 50,
          commentsCount: 5,
          timestamp: '2026-01-01T00:00:00Z',
        },
      ]);
    });

    it('should return empty array when data is missing', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });
      const result = await service.getHashtagTopMedia('ht-1');
      expect(result).toEqual([]);
    });

    it('should default missing fields to empty string or 0', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: [{ id: 'media-x' }],
        },
      });

      const result = await service.getHashtagTopMedia('ht-1');
      expect(result).toEqual([
        {
          id: 'media-x',
          mediaType: undefined,
          mediaUrl: '',
          caption: '',
          likeCount: 0,
          commentsCount: 0,
          timestamp: '',
        },
      ]);
    });
  });

  // ── getMediaInsights ──

  describe('getMediaInsights()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should fetch media data and insights, returning combined MediaInsights', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { id: 'media-1', like_count: 42, comments_count: 7 } })
        .mockResolvedValueOnce({
          data: {
            data: [
              { name: 'reach', values: [{ value: 1000 }] },
              { name: 'impressions', values: [{ value: 2000 }] },
              { name: 'saved', values: [{ value: 15 }] },
              { name: 'shares', values: [{ value: 8 }] },
            ],
          },
        });

      const result = await service.getMediaInsights('media-1');

      expect(mockGet).toHaveBeenNthCalledWith(1, '/media-1', {
        params: { fields: 'id,like_count,comments_count' },
      });
      expect(mockGet).toHaveBeenNthCalledWith(2, '/media-1/insights', {
        params: { metric: 'reach,impressions,saved,shares' },
      });

      expect(result).toEqual({
        id: 'media-1',
        likes: 42,
        comments: 7,
        reach: 1000,
        impressions: 2000,
        saved: 15,
        shares: 8,
      });
    });

    it('should default reach/impressions/saved/shares to 0 if insights API fails', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { id: 'media-2', like_count: 10, comments_count: 1 } })
        .mockRejectedValueOnce(new Error('Insights not available'));

      const result = await service.getMediaInsights('media-2');

      expect(result).toEqual({
        id: 'media-2',
        likes: 10,
        comments: 1,
        reach: 0,
        impressions: 0,
        saved: 0,
        shares: 0,
      });
    });

    it('should handle missing like_count and comments_count', async () => {
      mockGet
        .mockResolvedValueOnce({ data: { id: 'media-3' } })
        .mockResolvedValueOnce({ data: { data: [] } });

      const result = await service.getMediaInsights('media-3');

      expect(result.likes).toBe(0);
      expect(result.comments).toBe(0);
    });
  });

  // ── getAccountInsights ──

  describe('getAccountInsights()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should fetch account insights from the igUserId endpoint', async () => {
      mockGet.mockResolvedValueOnce({
        data: { followers_count: 5000, media_count: 120, follows_count: 800 },
      });

      const result = await service.getAccountInsights();

      expect(mockGet).toHaveBeenCalledWith('/ig-user-123', {
        params: { fields: 'followers_count,media_count,follows_count' },
      });
      expect(result).toEqual({ followers: 5000, mediaCount: 120, followsCount: 800 });
    });

    it('should default missing counts to 0', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });

      const result = await service.getAccountInsights();

      expect(result).toEqual({ followers: 0, mediaCount: 0, followsCount: 0 });
    });
  });

  // ── getRecentMedia ──

  describe('getRecentMedia()', () => {
    beforeEach(async () => {
      await service.initialize();
      vi.clearAllMocks();
    });

    it('should fetch recent media with default limit of 20', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      await service.getRecentMedia();

      expect(mockGet).toHaveBeenCalledWith('/ig-user-123/media', {
        params: {
          fields: 'id,media_type,media_url,caption,like_count,comments_count,timestamp',
          limit: 20,
        },
      });
    });

    it('should respect a custom limit', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      await service.getRecentMedia(5);

      expect(mockGet).toHaveBeenCalledWith('/ig-user-123/media', {
        params: {
          fields: 'id,media_type,media_url,caption,like_count,comments_count,timestamp',
          limit: 5,
        },
      });
    });

    it('should return mapped ExploreResult array', async () => {
      mockGet.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'recent-1',
              media_type: 'VIDEO',
              media_url: 'https://example.com/v1.mp4',
              caption: 'Recent vid',
              like_count: 100,
              comments_count: 20,
              timestamp: '2026-02-15T12:00:00Z',
            },
          ],
        },
      });

      const result = await service.getRecentMedia(10);

      expect(result).toEqual([
        {
          id: 'recent-1',
          mediaType: 'VIDEO',
          mediaUrl: 'https://example.com/v1.mp4',
          caption: 'Recent vid',
          likeCount: 100,
          commentsCount: 20,
          timestamp: '2026-02-15T12:00:00Z',
        },
      ]);
    });

    it('should return empty array when data is undefined', async () => {
      mockGet.mockResolvedValueOnce({ data: {} });
      const result = await service.getRecentMedia();
      expect(result).toEqual([]);
    });
  });
});
