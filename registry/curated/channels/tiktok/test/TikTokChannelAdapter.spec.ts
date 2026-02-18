/**
 * Unit tests for TikTokChannelAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TikTokChannelAdapter } from '../src/TikTokChannelAdapter';
import type { TikTokService } from '../src/TikTokService';
import type { MessageContent } from '@framers/agentos';

function createMockService(): TikTokService {
  return {
    isRunning: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    uploadVideo: vi.fn().mockResolvedValue({
      id: 'video-123',
      caption: 'Test video',
      createTime: 1706745600, // 2024-02-01T00:00:00Z
      shareUrl: 'https://tiktok.com/@user/video/123',
    }),
    getTrendingHashtags: vi.fn().mockResolvedValue([]),
    getTrendingSounds: vi.fn().mockResolvedValue([]),
    searchVideos: vi.fn().mockResolvedValue([]),
    searchUsers: vi.fn().mockResolvedValue([]),
    getVideoAnalytics: vi.fn().mockResolvedValue({ videoId: 'v1', metrics: {} }),
    getCreatorAnalytics: vi.fn().mockResolvedValue({ followerCount: 0 }),
    likeVideo: vi.fn().mockResolvedValue(undefined),
    commentOnVideo: vi.fn().mockResolvedValue({ commentId: 'c1' }),
    getRecommendedVideos: vi.fn().mockResolvedValue([]),
    getMe: vi.fn().mockResolvedValue({
      id: 'user-1',
      username: 'testuser',
      displayName: 'Test User',
      followerCount: 1000,
      videoCount: 50,
      likeCount: 5000,
    }),
  } as any;
}

describe('TikTokChannelAdapter', () => {
  let adapter: TikTokChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new TikTokChannelAdapter(mockService);
  });

  describe('identity', () => {
    it('should declare platform as tiktok', () => {
      expect(adapter.platform).toBe('tiktok');
    });

    it('should have displayName of TikTok', () => {
      expect(adapter.displayName).toBe('TikTok');
    });

    it('should declare expected capabilities', () => {
      expect(adapter.capabilities).toContain('video');
      expect(adapter.capabilities).toContain('reels');
      expect(adapter.capabilities).toContain('reactions');
      expect(adapter.capabilities).toContain('hashtags');
      expect(adapter.capabilities).toContain('engagement_metrics');
      expect(adapter.capabilities).toContain('content_discovery');
      expect(adapter.capabilities).toHaveLength(6);
    });
  });

  describe('initialize / shutdown', () => {
    it('should initialize without error', async () => {
      await adapter.initialize({ platform: 'tiktok', credential: 'test-token' });
    });

    it('should shutdown and clear handlers', async () => {
      const handler = vi.fn();
      adapter.on(handler);
      await adapter.shutdown();
    });
  });

  describe('sendMessage', () => {
    it('should publish a video from video block', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4', caption: 'My TikTok' },
        ],
      };

      const result = await adapter.sendMessage('', content);
      expect(result.messageId).toBe('video-123');
      expect(result.timestamp).toBeDefined();
      expect(mockService.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoUrl: 'https://example.com/video.mp4',
          caption: 'My TikTok',
        }),
      );
    });

    it('should publish from reel block', async () => {
      const content: MessageContent = {
        blocks: [
          {
            type: 'reel',
            videoUrl: 'https://example.com/reel.mp4',
            caption: 'Reel caption',
            hashtags: ['fyp', 'viral'],
          } as any,
        ],
      };

      const result = await adapter.sendMessage('', content);
      expect(result.messageId).toBe('video-123');
      expect(mockService.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoUrl: 'https://example.com/reel.mp4',
          caption: 'Reel caption',
          hashtags: ['fyp', 'viral'],
        }),
      );
    });

    it('should use text block as caption fallback when video caption is empty', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4' },
          { type: 'text', text: 'Text caption fallback' },
        ],
      };

      await adapter.sendMessage('', content);
      expect(mockService.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          caption: 'Text caption fallback',
        }),
      );
    });

    it('should merge hashtags from platformOptions', async () => {
      const content: MessageContent = {
        blocks: [
          {
            type: 'reel',
            videoUrl: 'https://example.com/reel.mp4',
            caption: 'caption',
            hashtags: ['fyp'],
          } as any,
        ],
        platformOptions: { hashtags: ['trending', 'viral'] },
      };

      await adapter.sendMessage('', content);
      expect(mockService.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          hashtags: ['fyp', 'trending', 'viral'],
        }),
      );
    });

    it('should pass privacyLevel from platformOptions', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4', caption: 'test' },
        ],
        platformOptions: { privacyLevel: 'SELF_ONLY' },
      };

      await adapter.sendMessage('', content);
      expect(mockService.uploadVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          privacyLevel: 'SELF_ONLY',
        }),
      );
    });

    it('should throw when no video or reel block is provided', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Text only' }],
      };

      await expect(adapter.sendMessage('', content)).rejects.toThrow(
        'TikTok requires a video or reel content block for publishing',
      );
    });

    it('should convert createTime (epoch seconds) to ISO timestamp', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4', caption: 'test' },
        ],
      };

      const result = await adapter.sendMessage('', content);
      // 1706745600 epoch seconds = 2024-02-01T00:00:00.000Z
      expect(result.timestamp).toBe('2024-02-01T00:00:00.000Z');
    });

    it('should use current timestamp when createTime is missing', async () => {
      (mockService.uploadVideo as any).mockResolvedValue({ id: 'vid-no-time' });
      const content: MessageContent = {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4', caption: 'test' },
        ],
      };

      const result = await adapter.sendMessage('', content);
      expect(result.messageId).toBe('vid-no-time');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('sendTypingIndicator', () => {
    it('should be a no-op (TikTok does not support typing)', async () => {
      await adapter.sendTypingIndicator('', true);
      await adapter.sendTypingIndicator('', false);
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
    it('should return user info from getMe', async () => {
      const info = await adapter.getConversationInfo('');
      expect(info.name).toBe('Test User');
      expect(info.memberCount).toBe(1000);
      expect(info.isGroup).toBe(false);
      expect(info.metadata).toEqual({
        username: 'testuser',
        videoCount: 50,
        likeCount: 5000,
      });
    });

    it('should fall back to username when displayName is missing', async () => {
      (mockService.getMe as any).mockResolvedValue({
        id: 'user-1',
        username: 'fallbackuser',
        followerCount: 10,
        videoCount: 5,
        likeCount: 100,
      });

      const info = await adapter.getConversationInfo('');
      expect(info.name).toBe('fallbackuser');
    });

    it('should return minimal info when getMe throws', async () => {
      (mockService.getMe as any).mockRejectedValue(new Error('API error'));
      const info = await adapter.getConversationInfo('');
      expect(info.isGroup).toBe(false);
      expect(info.name).toBeUndefined();
    });
  });
});
