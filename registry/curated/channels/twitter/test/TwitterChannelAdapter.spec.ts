/**
 * Unit tests for TwitterChannelAdapter (IChannelAdapter implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('twitter-api-v2', () => ({
  TwitterApi: class MockTwitterApi {
    constructor() {}
  },
}));

import { TwitterChannelAdapter } from '../src/TwitterChannelAdapter';

function createMockService() {
  return {
    isRunning: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    postTweet: vi.fn().mockResolvedValue({ id: 'tweet-1', text: 'hello' }),
    postThread: vi.fn().mockResolvedValue([
      { id: 'tweet-1', text: 'first' },
      { id: 'tweet-2', text: 'second' },
    ]),
    uploadMedia: vi.fn().mockResolvedValue('media-1'),
    like: vi.fn().mockResolvedValue(undefined),
    unlike: vi.fn().mockResolvedValue(undefined),
    retweet: vi.fn().mockResolvedValue(undefined),
    unretweet: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getTrending: vi.fn().mockResolvedValue([]),
    getTimeline: vi.fn().mockResolvedValue([]),
    sendDm: vi.fn().mockResolvedValue({ eventId: 'dm-1' }),
    getTweetMetrics: vi.fn().mockResolvedValue(null),
    getMe: vi.fn().mockResolvedValue({ id: '1', name: 'Test', username: 'test' }),
  } as any;
}

describe('TwitterChannelAdapter', () => {
  let adapter: TwitterChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new TwitterChannelAdapter(mockService);
  });

  describe('platform and capabilities', () => {
    it('should have platform set to twitter', () => {
      expect(adapter.platform).toBe('twitter');
    });

    it('should expose the full set of capabilities', () => {
      const expected = [
        'text',
        'images',
        'video',
        'reactions',
        'threads',
        'polls',
        'hashtags',
        'engagement_metrics',
        'scheduling',
        'content_discovery',
      ];
      expect(adapter.capabilities).toEqual(expected);
    });
  });

  describe('sendMessage', () => {
    it('should call service.postTweet for text blocks', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Hello Twitter!' }],
      };

      const result = await adapter.sendMessage('conv-1', content);

      expect(mockService.postTweet).toHaveBeenCalledWith({
        text: 'Hello Twitter!',
        mediaIds: undefined,
        pollOptions: undefined,
        pollDurationMinutes: undefined,
        replyToId: undefined,
      });
      expect(result.messageId).toBe('tweet-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should call service.uploadMedia then service.postTweet for image blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'image', url: 'https://example.com/img.png', mimeType: 'image/png' },
        ],
      };

      const result = await adapter.sendMessage('conv-1', content);

      expect(mockService.uploadMedia).toHaveBeenCalledWith(
        'https://example.com/img.png',
        'image/png',
      );
      expect(mockService.postTweet).toHaveBeenCalledWith({
        text: 'Check this out',
        mediaIds: ['media-1'],
        pollOptions: undefined,
        pollDurationMinutes: undefined,
        replyToId: undefined,
      });
      expect(result.messageId).toBe('tweet-1');
    });

    it('should call service.postTweet with pollOptions for poll blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'What do you prefer?' },
          { type: 'poll', options: ['Option A', 'Option B', 'Option C'], durationHours: 24 },
        ],
      };

      const result = await adapter.sendMessage('conv-1', content);

      expect(mockService.postTweet).toHaveBeenCalledWith({
        text: 'What do you prefer?',
        mediaIds: undefined,
        pollOptions: ['Option A', 'Option B', 'Option C'],
        pollDurationMinutes: 1440,
        replyToId: undefined,
      });
      expect(result.messageId).toBe('tweet-1');
    });

    it('should pass replyToMessageId when present', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Reply here' }],
        replyToMessageId: 'original-tweet-99',
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postTweet).toHaveBeenCalledWith(
        expect.objectContaining({ replyToId: 'original-tweet-99' }),
      );
    });

    it('should skip failed media uploads gracefully', async () => {
      mockService.uploadMedia.mockRejectedValueOnce(new Error('upload failed'));

      const content = {
        blocks: [
          { type: 'text', text: 'Photo attempt' },
          { type: 'image', url: 'https://example.com/bad.jpg', mimeType: 'image/jpeg' },
        ],
      };

      const result = await adapter.sendMessage('conv-1', content);

      expect(mockService.uploadMedia).toHaveBeenCalled();
      expect(mockService.postTweet).toHaveBeenCalledWith(
        expect.objectContaining({ mediaIds: undefined }),
      );
      expect(result.messageId).toBe('tweet-1');
    });

    it('should handle video blocks the same as image blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Watch this' },
          { type: 'video', url: 'https://example.com/vid.mp4', mimeType: 'video/mp4' },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.uploadMedia).toHaveBeenCalledWith(
        'https://example.com/vid.mp4',
        'video/mp4',
      );
      expect(mockService.postTweet).toHaveBeenCalledWith(
        expect.objectContaining({ mediaIds: ['media-1'] }),
      );
    });
  });

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Twitter does not support typing indicators)', async () => {
      // Should not throw and should not call any service methods
      await adapter.sendTypingIndicator('conv-1', true);
      await adapter.sendTypingIndicator('conv-1', false);
      // No service methods should have been called
      expect(mockService.postTweet).not.toHaveBeenCalled();
    });
  });

  describe('on / off', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should remove handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // After unsubscribing, no throw confirms cleanup
    });
  });

  describe('getConnectionInfo', () => {
    it('should return connected when service is running', () => {
      mockService.isRunning = true;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeUndefined();
      expect(info.platformInfo).toEqual({ platform: 'twitter' });
    });

    it('should return disconnected when service is not running', () => {
      mockService.isRunning = false;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return connected with connectedSince after initialization', async () => {
      await adapter.initialize({ platform: 'twitter', credential: 'token' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
    });

    it('should return error status when initialization failed', async () => {
      mockService.initialize.mockRejectedValueOnce(new Error('Auth failed'));
      try {
        await adapter.initialize({ platform: 'twitter', credential: 'bad-token' });
      } catch {
        // expected
      }
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Auth failed');
    });
  });

  describe('addReaction', () => {
    it('should call service.like with the messageId', async () => {
      await adapter.addReaction('conv-1', 'tweet-123', 'heart');

      expect(mockService.like).toHaveBeenCalledWith('tweet-123');
    });
  });

  describe('lifecycle', () => {
    it('should call service.initialize on adapter initialize', async () => {
      await adapter.initialize({ platform: 'twitter', credential: 'token' });
      expect(mockService.initialize).toHaveBeenCalled();
    });

    it('should call service.shutdown on adapter shutdown', async () => {
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalled();
    });
  });
});
