/**
 * Unit tests for PinterestService (Pinterest API v5 wrapper).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mock fns so vi.mock factory can reference them
const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn().mockReturnValue({
      get: mockGet,
      post: mockPost,
      delete: mockDelete,
    }),
  },
}));

import { PinterestService, type PinterestConfig } from '../src/PinterestService';

const TEST_CONFIG: PinterestConfig = {
  accessToken: 'test-access-token-123',
};

describe('PinterestService', () => {
  let service: PinterestService;

  beforeEach(() => {
    service = new PinterestService(TEST_CONFIG);
    mockGet.mockReset();
    mockPost.mockReset();
    mockDelete.mockReset();
  });

  describe('lifecycle', () => {
    it('should not be running initially', () => {
      expect(service.isRunning).toBe(false);
    });

    it('should initialize and mark as running', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should be idempotent on double initialize', async () => {
      await service.initialize();
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should shutdown cleanly', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should no-op shutdown when not running', async () => {
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });
  });

  describe('createPin', () => {
    it('should create a pin with image_url media source', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: { id: 'pin-1', title: 'Test', description: 'desc', board_id: 'b1', created_at: '2026-01-01' },
      });

      const result = await service.createPin({
        boardId: 'b1',
        title: 'Test Pin',
        description: 'A test pin',
        mediaSource: { sourceType: 'image_url', url: 'https://example.com/img.jpg' },
      });

      expect(result.id).toBe('pin-1');
      expect(result.boardId).toBe('b1');
      expect(result.createdAt).toBe('2026-01-01');
      expect(mockPost).toHaveBeenCalledWith('/pins', expect.objectContaining({
        board_id: 'b1',
        title: 'Test Pin',
        media_source: { source_type: 'image_url', url: 'https://example.com/img.jpg' },
      }));
    });

    it('should create a pin with video_id media source', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: { id: 'pin-2' },
      });

      await service.createPin({
        boardId: 'b1',
        mediaSource: {
          sourceType: 'video_id',
          videoId: 'vid-123',
          coverImageUrl: 'https://example.com/cover.jpg',
        },
      });

      expect(mockPost).toHaveBeenCalledWith('/pins', expect.objectContaining({
        media_source: {
          source_type: 'video_id',
          id: 'vid-123',
          cover_image_url: 'https://example.com/cover.jpg',
        },
      }));
    });

    it('should create a pin with multiple_image_urls media source', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { id: 'pin-3' } });

      await service.createPin({
        boardId: 'b1',
        mediaSource: {
          sourceType: 'multiple_image_urls',
          urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
        },
      });

      expect(mockPost).toHaveBeenCalledWith('/pins', expect.objectContaining({
        media_source: {
          source_type: 'multiple_image_urls',
          items: [{ url: 'https://example.com/1.jpg' }, { url: 'https://example.com/2.jpg' }],
        },
      }));
    });

    it('should append hashtags to description', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { id: 'pin-4' } });

      await service.createPin({
        boardId: 'b1',
        description: 'My pin',
        hashtags: ['design', '#art'],
        mediaSource: { sourceType: 'image_url', url: 'https://example.com/img.jpg' },
      });

      expect(mockPost).toHaveBeenCalledWith('/pins', expect.objectContaining({
        description: 'My pin\n\n#design #art',
      }));
    });

    it('should create hashtag-only description when no description provided', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({ data: { id: 'pin-5' } });

      await service.createPin({
        boardId: 'b1',
        hashtags: ['travel'],
        mediaSource: { sourceType: 'image_url', url: 'https://example.com/img.jpg' },
      });

      expect(mockPost).toHaveBeenCalledWith('/pins', expect.objectContaining({
        description: '#travel',
      }));
    });

    it('should throw when not initialized', async () => {
      await expect(
        service.createPin({
          boardId: 'b1',
          mediaSource: { sourceType: 'image_url', url: 'https://example.com/img.jpg' },
        }),
      ).rejects.toThrow('PinterestService not initialized');
    });
  });

  describe('getPin', () => {
    it('should fetch a pin by ID', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: { id: 'pin-1', title: 'Test', description: 'desc' },
      });

      const result = await service.getPin('pin-1');
      expect(result.id).toBe('pin-1');
      expect(mockGet).toHaveBeenCalledWith('/pins/pin-1');
    });
  });

  describe('deletePin', () => {
    it('should delete a pin by ID', async () => {
      await service.initialize();
      mockDelete.mockResolvedValueOnce({});

      await service.deletePin('pin-1');
      expect(mockDelete).toHaveBeenCalledWith('/pins/pin-1');
    });
  });

  describe('createBoard', () => {
    it('should create a board with default PUBLIC privacy', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: { id: 'board-1', name: 'My Board', privacy: 'PUBLIC' },
      });

      const result = await service.createBoard({ name: 'My Board' });
      expect(result.id).toBe('board-1');
      expect(result.name).toBe('My Board');
      expect(mockPost).toHaveBeenCalledWith('/boards', {
        name: 'My Board',
        description: undefined,
        privacy: 'PUBLIC',
      });
    });

    it('should create a board with custom privacy', async () => {
      await service.initialize();
      mockPost.mockResolvedValueOnce({
        data: { id: 'board-2', name: 'Secret', privacy: 'SECRET' },
      });

      await service.createBoard({ name: 'Secret', privacy: 'SECRET' });
      expect(mockPost).toHaveBeenCalledWith('/boards', expect.objectContaining({
        privacy: 'SECRET',
      }));
    });
  });

  describe('getBoards', () => {
    it('should return a list of boards', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          items: [
            { id: 'b1', name: 'Board 1', privacy: 'PUBLIC', pin_count: 10, follower_count: 5 },
            { id: 'b2', name: 'Board 2', privacy: 'SECRET', pin_count: 3, follower_count: 0 },
          ],
        },
      });

      const boards = await service.getBoards();
      expect(boards).toHaveLength(2);
      expect(boards[0].id).toBe('b1');
      expect(boards[0].pinCount).toBe(10);
      expect(boards[1].privacy).toBe('SECRET');
    });

    it('should handle empty items array', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { items: [] } });

      const boards = await service.getBoards();
      expect(boards).toHaveLength(0);
    });
  });

  describe('getBoardPins', () => {
    it('should return pins for a board', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: { items: [{ id: 'p1' }, { id: 'p2' }] },
      });

      const pins = await service.getBoardPins('board-1');
      expect(pins).toHaveLength(2);
      expect(mockGet).toHaveBeenCalledWith('/boards/board-1/pins', {
        params: { page_size: 25 },
      });
    });

    it('should cap maxResults at 100', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { items: [] } });

      await service.getBoardPins('board-1', 200);
      expect(mockGet).toHaveBeenCalledWith('/boards/board-1/pins', {
        params: { page_size: 100 },
      });
    });
  });

  describe('deleteBoard', () => {
    it('should delete a board by ID', async () => {
      await service.initialize();
      mockDelete.mockResolvedValueOnce({});

      await service.deleteBoard('board-1');
      expect(mockDelete).toHaveBeenCalledWith('/boards/board-1');
    });
  });

  describe('searchPins', () => {
    it('should search pins by query', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: { items: [{ id: 'p1', title: 'Found pin' }] },
      });

      const pins = await service.searchPins({ query: 'travel' });
      expect(pins).toHaveLength(1);
      expect(pins[0].id).toBe('p1');
      expect(mockGet).toHaveBeenCalledWith('/search/pins', {
        params: { query: 'travel', page_size: 10, bookmark: undefined },
      });
    });

    it('should cap maxResults at 100', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { items: [] } });

      await service.searchPins({ query: 'test', maxResults: 200 });
      expect(mockGet).toHaveBeenCalledWith('/search/pins', expect.objectContaining({
        params: expect.objectContaining({ page_size: 100 }),
      }));
    });
  });

  describe('searchBoards', () => {
    it('should search boards by query', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: { items: [{ id: 'b1', name: 'Travel Board', privacy: 'PUBLIC' }] },
      });

      const boards = await service.searchBoards({ query: 'travel' });
      expect(boards).toHaveLength(1);
      expect(boards[0].name).toBe('Travel Board');
    });
  });

  describe('getTrending', () => {
    it('should fetch trending pins for a region', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          trends: [
            { keyword: 'summer fashion', normalized_rank: 0.95 },
            { query: 'home decor' },
          ],
        },
      });

      const trends = await service.getTrending('US', 10);
      expect(trends).toHaveLength(2);
      expect(trends[0].keyword).toBe('summer fashion');
      expect(trends[0].rank).toBe(1);
      expect(trends[0].normalizedRank).toBe(0.95);
      expect(trends[0].region).toBe('US');
      expect(trends[1].keyword).toBe('home decor');
      expect(trends[1].rank).toBe(2);
    });

    it('should default to US region and 20 max results', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { trends: [] } });

      await service.getTrending();
      expect(mockGet).toHaveBeenCalledWith('/trends/pins', {
        params: { region: 'US', page_size: 20 },
      });
    });

    it('should cap maxResults at 50', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: { trends: [] } });

      await service.getTrending('US', 100);
      expect(mockGet).toHaveBeenCalledWith('/trends/pins', {
        params: { region: 'US', page_size: 50 },
      });
    });
  });

  describe('getPinAnalytics', () => {
    it('should fetch analytics for a pin', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          all: {
            IMPRESSION: 1000,
            SAVE: 50,
            PIN_CLICK: 200,
            CLOSEUP: 80,
          },
        },
      });

      const analytics = await service.getPinAnalytics('pin-1', '2026-01-01', '2026-01-31');
      expect(analytics.id).toBe('pin-1');
      expect(analytics.type).toBe('pin');
      expect(analytics.metrics.impressions).toBe(1000);
      expect(analytics.metrics.saves).toBe(50);
      expect(analytics.metrics.clicks).toBe(200);
      expect(analytics.metrics.closeups).toBe(80);
      expect(analytics.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    });

    it('should sum array-type metrics', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          all: {
            IMPRESSION: [100, 200, 300],
            SAVE: [10, 20],
            PIN_CLICK: 50,
            CLOSEUP: 0,
          },
        },
      });

      const analytics = await service.getPinAnalytics('pin-1', '2026-01-01', '2026-01-07');
      expect(analytics.metrics.impressions).toBe(600);
      expect(analytics.metrics.saves).toBe(30);
      expect(analytics.metrics.clicks).toBe(50);
      expect(analytics.metrics.closeups).toBe(0);
    });

    it('should return 0 for missing metrics', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({ data: {} });

      const analytics = await service.getPinAnalytics('pin-1', '2026-01-01', '2026-01-31');
      expect(analytics.metrics.impressions).toBe(0);
      expect(analytics.metrics.saves).toBe(0);
    });
  });

  describe('getBoardAnalytics', () => {
    it('should fetch analytics for a board', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          all: {
            IMPRESSION: 5000,
            SAVE: 200,
            PIN_CLICK: 800,
            CLOSEUP: 300,
          },
        },
      });

      const analytics = await service.getBoardAnalytics('board-1', '2026-01-01', '2026-01-31');
      expect(analytics.id).toBe('board-1');
      expect(analytics.type).toBe('board');
      expect(analytics.metrics.impressions).toBe(5000);
      expect(analytics.dateRange).toEqual({ start: '2026-01-01', end: '2026-01-31' });
    });
  });

  describe('getMe', () => {
    it('should return user account info', async () => {
      await service.initialize();
      mockGet.mockResolvedValueOnce({
        data: {
          username: 'alice',
          account_type: 'business',
          website_url: 'https://alice.com',
        },
      });

      const me = await service.getMe();
      expect(me.username).toBe('alice');
      expect(me.accountType).toBe('business');
      expect(me.websiteUrl).toBe('https://alice.com');
    });

    it('should throw when not initialized', async () => {
      await expect(service.getMe()).rejects.toThrow('PinterestService not initialized');
    });
  });
});
