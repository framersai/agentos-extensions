/**
 * Unit tests for PinterestChannelAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PinterestChannelAdapter } from '../src/PinterestChannelAdapter';
import type { PinterestService } from '../src/PinterestService';
import type { MessageContent } from '@framers/agentos';

function createMockService(): PinterestService {
  return {
    isRunning: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    createPin: vi.fn().mockResolvedValue({ id: 'pin-123', createdAt: '2026-01-01T00:00:00Z' }),
    getPin: vi.fn().mockResolvedValue({ id: 'pin-123' }),
    deletePin: vi.fn().mockResolvedValue(undefined),
    createBoard: vi.fn().mockResolvedValue({ id: 'board-1', name: 'Test Board' }),
    getBoards: vi.fn().mockResolvedValue([
      { id: 'board-1', name: 'My Board', privacy: 'PUBLIC', pinCount: 10, followerCount: 100 },
    ]),
    getBoardPins: vi.fn().mockResolvedValue([]),
    deleteBoard: vi.fn().mockResolvedValue(undefined),
    searchPins: vi.fn().mockResolvedValue([]),
    searchBoards: vi.fn().mockResolvedValue([]),
    getTrending: vi.fn().mockResolvedValue([]),
    getPinAnalytics: vi.fn().mockResolvedValue({ id: 'pin-123', type: 'pin', metrics: {} }),
    getBoardAnalytics: vi.fn().mockResolvedValue({ id: 'board-1', type: 'board', metrics: {} }),
    getMe: vi.fn().mockResolvedValue({ username: 'testuser', accountType: 'business' }),
  } as any;
}

describe('PinterestChannelAdapter', () => {
  let adapter: PinterestChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new PinterestChannelAdapter(mockService);
  });

  describe('identity', () => {
    it('should declare platform as pinterest', () => {
      expect(adapter.platform).toBe('pinterest');
    });

    it('should have displayName of Pinterest', () => {
      expect(adapter.displayName).toBe('Pinterest');
    });

    it('should declare expected capabilities', () => {
      expect(adapter.capabilities).toContain('images');
      expect(adapter.capabilities).toContain('video');
      expect(adapter.capabilities).toContain('carousel');
      expect(adapter.capabilities).toContain('hashtags');
      expect(adapter.capabilities).toContain('engagement_metrics');
      expect(adapter.capabilities).toContain('content_discovery');
      expect(adapter.capabilities).toContain('scheduling');
      expect(adapter.capabilities).toHaveLength(7);
    });
  });

  describe('initialize / shutdown', () => {
    it('should store default board ID from auth params', async () => {
      await adapter.initialize({
        platform: 'pinterest',
        credential: 'test-token',
        params: { boardId: 'default-board-id' },
      });
      // The defaultBoardId is used as fallback when conversationId is empty
      // Verified in sendMessage tests below
    });

    it('should clear handlers and reset board ID on shutdown', async () => {
      const handler = vi.fn();
      adapter.on(handler);
      await adapter.initialize({
        platform: 'pinterest',
        credential: 'test-token',
        params: { boardId: 'board-1' },
      });
      await adapter.shutdown();
      // After shutdown, internal state is cleared
    });
  });

  describe('sendMessage', () => {
    it('should send a pin with image block', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'text', text: 'Check out this pin' },
          { type: 'image', url: 'https://example.com/image.jpg' },
        ],
      };

      const result = await adapter.sendMessage('board-1', content);
      expect(result.messageId).toBe('pin-123');
      expect(result.timestamp).toBe('2026-01-01T00:00:00Z');
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({
          boardId: 'board-1',
          description: 'Check out this pin',
          mediaSource: {
            sourceType: 'image_url',
            url: 'https://example.com/image.jpg',
          },
        }),
      );
    });

    it('should send a pin with carousel block', async () => {
      const content: MessageContent = {
        blocks: [
          {
            type: 'carousel',
            items: [
              { url: 'https://example.com/img1.jpg', type: 'image' },
              { url: 'https://example.com/img2.jpg', type: 'image' },
            ],
          },
        ],
      };

      await adapter.sendMessage('board-1', content);
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSource: {
            sourceType: 'multiple_image_urls',
            urls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
          },
        }),
      );
    });

    it('should send a pin with video block', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'video-id-123', caption: 'https://example.com/cover.jpg' },
        ],
      };

      await adapter.sendMessage('board-1', content);
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaSource: {
            sourceType: 'video_id',
            videoId: 'video-id-123',
            coverImageUrl: 'https://example.com/cover.jpg',
          },
        }),
      );
    });

    it('should throw when no media block is provided', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Text only' }],
      };

      await expect(adapter.sendMessage('board-1', content)).rejects.toThrow(
        'Pinterest requires an image, video, or carousel media source',
      );
    });

    it('should throw when board ID is missing and no default set', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      };

      await expect(adapter.sendMessage('', content)).rejects.toThrow(
        'Board ID is required',
      );
    });

    it('should use default board ID when conversationId is empty', async () => {
      await adapter.initialize({
        platform: 'pinterest',
        credential: 'test-token',
        params: { boardId: 'default-board' },
      });

      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      };

      await adapter.sendMessage('', content);
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({ boardId: 'default-board' }),
      );
    });

    it('should pass link from platformOptions', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
        platformOptions: { link: 'https://example.com/article' },
      };

      await adapter.sendMessage('board-1', content);
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({ link: 'https://example.com/article' }),
      );
    });

    it('should pass hashtags from platformOptions', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
        platformOptions: { hashtags: ['design', 'art'] },
      };

      await adapter.sendMessage('board-1', content);
      expect(mockService.createPin).toHaveBeenCalledWith(
        expect.objectContaining({ hashtags: ['design', 'art'] }),
      );
    });

    it('should use current timestamp when createdAt is missing from result', async () => {
      (mockService.createPin as any).mockResolvedValue({ id: 'pin-456' });
      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      };

      const result = await adapter.sendMessage('board-1', content);
      expect(result.messageId).toBe('pin-456');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Pinterest does not support typing)', async () => {
      await adapter.sendTypingIndicator('board-1', true);
      // No assertions needed — just verifying it does not throw
    });
  });

  describe('event handlers (on/off)', () => {
    it('should register a handler and return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should unsubscribe handler when returned function is called', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // Handler is removed from internal map
    });

    it('should register with event type filter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connected when service is running', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
    });

    it('should return disconnected when service is not running', () => {
      (mockService as any).isRunning = false;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });
  });

  describe('getConversationInfo', () => {
    it('should return board info when found', async () => {
      const info = await adapter.getConversationInfo('board-1');
      expect(info.name).toBe('My Board');
      expect(info.memberCount).toBe(100);
      expect(info.isGroup).toBe(false);
      expect(info.metadata).toEqual({
        pinCount: 10,
        privacy: 'PUBLIC',
      });
    });

    it('should return minimal info when board not found', async () => {
      const info = await adapter.getConversationInfo('nonexistent-board');
      expect(info.isGroup).toBe(false);
    });

    it('should return minimal info when getBoards throws', async () => {
      (mockService.getBoards as any).mockRejectedValue(new Error('API error'));
      const info = await adapter.getConversationInfo('board-1');
      expect(info.isGroup).toBe(false);
    });
  });
});
