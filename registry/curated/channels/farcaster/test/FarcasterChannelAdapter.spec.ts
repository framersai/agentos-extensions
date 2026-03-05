/**
 * @fileoverview Unit tests for FarcasterChannelAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { FarcasterChannelAdapter } from '../src/FarcasterChannelAdapter.js';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isRunning: false,
    publishCast: vi.fn().mockResolvedValue({
      hash: '0xcast-1',
      authorFid: 12345,
      text: 'hello farcaster',
      timestamp: '2026-03-04T12:00:00Z',
    }),
    likeCast: vi.fn().mockResolvedValue(undefined),
    recast: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue({
      hash: '0xreply-1',
      authorFid: 12345,
      text: 'reply text',
    }),
    searchCasts: vi.fn().mockResolvedValue([]),
    getFeed: vi.fn().mockResolvedValue([]),
    getMe: vi.fn().mockResolvedValue({ fid: 12345, username: 'agent', displayName: 'Agent' }),
  };
}

type MockService = ReturnType<typeof createMockService>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FarcasterChannelAdapter', () => {
  let mockService: MockService;
  let adapter: FarcasterChannelAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new FarcasterChannelAdapter(mockService as any);
  });

  // ── Static Properties ──

  describe('static properties', () => {
    it('should have platform set to farcaster', () => {
      expect(adapter.platform).toBe('farcaster');
    });

    it('should have displayName set to Farcaster', () => {
      expect(adapter.displayName).toBe('Farcaster');
    });

    it('should expose the expected capabilities', () => {
      expect(adapter.capabilities).toContain('text');
      expect(adapter.capabilities).toContain('embeds');
      expect(adapter.capabilities).toContain('reactions');
      expect(adapter.capabilities).toContain('threads');
      expect(adapter.capabilities).toContain('channels');
      expect(adapter.capabilities).toContain('content_discovery');
      expect(adapter.capabilities).toContain('engagement_metrics');
      expect(adapter.capabilities).toHaveLength(7);
    });
  });

  // ── Initialize ──

  describe('initialize', () => {
    it('should call service.initialize()', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'api-key' });
      expect(mockService.initialize).toHaveBeenCalledOnce();
    });

    it('should set connection status to connected after success', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      expect(info.platformInfo).toEqual({ platform: 'farcaster' });
    });

    it('should set error state when initialize fails', async () => {
      mockService.initialize.mockRejectedValue(new Error('invalid api key'));
      await expect(
        adapter.initialize({ platform: 'farcaster', credential: 'bad' }),
      ).rejects.toThrow('invalid api key');

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('invalid api key');
    });
  });

  // ── Shutdown ──

  describe('shutdown', () => {
    it('should call service.shutdown()', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalledOnce();
    });

    it('should reset connectedSince after shutdown', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      await adapter.shutdown();
      mockService.isRunning = false;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
      expect(info.connectedSince).toBeUndefined();
    });
  });

  // ── getConnectionInfo ──

  describe('getConnectionInfo', () => {
    it('should return disconnected before initialization', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return connected with timestamp after initialization', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(typeof info.connectedSince).toBe('string');
    });

    it('should return error with message when an error occurred', async () => {
      mockService.initialize.mockRejectedValue(new Error('boom'));
      try { await adapter.initialize({ platform: 'farcaster', credential: '' }); } catch { /* expected */ }

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('boom');
    });
  });

  // ── sendMessage ──

  describe('sendMessage', () => {
    beforeEach(async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
    });

    it('should send a text-only message', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Hello Farcaster!' }],
      });

      expect(result.messageId).toBe('0xcast-1');
      expect(result.timestamp).toBeDefined();
      expect(mockService.publishCast).toHaveBeenCalledWith('Hello Farcaster!', {
        embeds: undefined,
        replyTo: undefined,
        channelId: undefined,
      });
    });

    it('should collect image and link embeds', async () => {
      await adapter.sendMessage('conv-2', {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'image', url: 'https://example.com/img.png' },
          { type: 'link', url: 'https://example.com/article' },
        ],
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('Check this out', {
        embeds: ['https://example.com/img.png', 'https://example.com/article'],
        replyTo: undefined,
        channelId: undefined,
      });
    });

    it('should not include embeds array when no image/link blocks exist', async () => {
      await adapter.sendMessage('conv-3', {
        blocks: [{ type: 'text', text: 'text only' }],
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('text only', {
        embeds: undefined,
        replyTo: undefined,
        channelId: undefined,
      });
    });

    it('should pass replyToMessageId', async () => {
      await adapter.sendMessage('conv-4', {
        blocks: [{ type: 'text', text: 'reply' }],
        replyToMessageId: '0xparent',
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('reply',
        expect.objectContaining({ replyTo: '0xparent' }),
      );
    });

    it('should pass channelId from platformOptions', async () => {
      await adapter.sendMessage('conv-5', {
        blocks: [{ type: 'text', text: 'channel post' }],
        platformOptions: { channelId: 'farcaster' },
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('channel post',
        expect.objectContaining({ channelId: 'farcaster' }),
      );
    });

    it('should default text to empty string when no text block exists', async () => {
      await adapter.sendMessage('conv-6', {
        blocks: [{ type: 'image', url: 'https://img.com/pic.png' }],
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('',
        expect.objectContaining({
          embeds: ['https://img.com/pic.png'],
        }),
      );
    });

    it('should ignore blocks that are not text, image, or link', async () => {
      await adapter.sendMessage('conv-7', {
        blocks: [
          { type: 'text', text: 'hi' },
          { type: 'audio', url: 'https://audio.com/clip.mp3' },
          { type: 'code', text: 'console.log("x")' },
        ],
      });

      expect(mockService.publishCast).toHaveBeenCalledWith('hi', {
        embeds: undefined,
        replyTo: undefined,
        channelId: undefined,
      });
    });
  });

  // ── sendTypingIndicator ──

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Farcaster does not support typing indicators)', async () => {
      await expect(adapter.sendTypingIndicator('conv-1', true)).resolves.toBeUndefined();
    });
  });

  // ── Event Handlers ──

  describe('on', () => {
    it('should register a handler and return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should remove the handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // No error = handler was removed successfully
    });

    it('should support multiple handlers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = adapter.on(h1);
      const unsub2 = adapter.on(h2);
      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');
    });

    it('should accept optional event types filter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message', 'reaction']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ── addReaction ──

  describe('addReaction', () => {
    it('should call likeCast on the service', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      await adapter.addReaction('conv-1', '0xcast-42', '❤️');

      expect(mockService.likeCast).toHaveBeenCalledWith('0xcast-42');
    });

    it('should ignore the emoji parameter (Farcaster uses like)', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      await adapter.addReaction('conv-1', '0xcast-42', '🎉');
      await adapter.addReaction('conv-1', '0xcast-42', '👍');

      // Both calls map to likeCast regardless of emoji
      expect(mockService.likeCast).toHaveBeenCalledTimes(2);
      expect(mockService.likeCast).toHaveBeenCalledWith('0xcast-42');
    });

    it('should ignore the conversationId parameter', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'farcaster', credential: 'key' });
      await adapter.addReaction('any-conv', '0xhash', '❤️');
      await adapter.addReaction('other-conv', '0xhash', '❤️');

      // Same messageId both times, conversationId doesn't matter
      expect(mockService.likeCast).toHaveBeenCalledTimes(2);
      expect(mockService.likeCast).toHaveBeenNthCalledWith(1, '0xhash');
      expect(mockService.likeCast).toHaveBeenNthCalledWith(2, '0xhash');
    });
  });
});
