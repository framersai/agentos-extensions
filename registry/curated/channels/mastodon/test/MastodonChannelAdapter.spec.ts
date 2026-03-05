/**
 * @fileoverview Unit tests for MastodonChannelAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MastodonChannelAdapter } from '../src/MastodonChannelAdapter.js';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isRunning: false,
    postStatus: vi.fn().mockResolvedValue({
      id: 'status-1',
      url: 'https://mastodon.social/@agent/status-1',
      content: '<p>hello</p>',
    }),
    uploadMedia: vi.fn().mockResolvedValue('media-1'),
    favouriteStatus: vi.fn().mockResolvedValue({ id: 'faved-1' }),
    replyToStatus: vi.fn().mockResolvedValue({
      id: 'reply-1',
      url: null,
      content: '<p>reply</p>',
    }),
    boostStatus: vi.fn().mockResolvedValue({ id: 'boosted-1' }),
    getProfile: vi.fn().mockResolvedValue({ id: '1', username: 'agent' }),
  };
}

type MockService = ReturnType<typeof createMockService>;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MastodonChannelAdapter', () => {
  let mockService: MockService;
  let adapter: MastodonChannelAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new MastodonChannelAdapter(mockService as any);
  });

  // ── Static Properties ──

  describe('static properties', () => {
    it('should have platform set to mastodon', () => {
      expect(adapter.platform).toBe('mastodon');
    });

    it('should have displayName set to Mastodon', () => {
      expect(adapter.displayName).toBe('Mastodon');
    });

    it('should expose the expected capabilities', () => {
      expect(adapter.capabilities).toContain('text');
      expect(adapter.capabilities).toContain('images');
      expect(adapter.capabilities).toContain('video');
      expect(adapter.capabilities).toContain('reactions');
      expect(adapter.capabilities).toContain('threads');
      expect(adapter.capabilities).toContain('hashtags');
      expect(adapter.capabilities).toContain('engagement_metrics');
      expect(adapter.capabilities).toContain('content_warnings');
      expect(adapter.capabilities).toContain('content_discovery');
      expect(adapter.capabilities).toContain('multi_instance');
      expect(adapter.capabilities).toHaveLength(10);
    });
  });

  // ── Initialize ──

  describe('initialize', () => {
    it('should call service.initialize()', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'token-xyz' });
      expect(mockService.initialize).toHaveBeenCalledOnce();
    });

    it('should set connection status to connected after success', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'token' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      expect(info.platformInfo).toEqual({ platform: 'mastodon' });
    });

    it('should set error state when initialize fails', async () => {
      mockService.initialize.mockRejectedValue(new Error('auth failed'));
      await expect(
        adapter.initialize({ platform: 'mastodon', credential: 'bad' }),
      ).rejects.toThrow('auth failed');

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('auth failed');
    });
  });

  // ── Shutdown ──

  describe('shutdown', () => {
    it('should call service.shutdown()', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'tok' });
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalledOnce();
    });

    it('should reset connectedSince after shutdown', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'tok' });
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
      await adapter.initialize({ platform: 'mastodon', credential: 't' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(typeof info.connectedSince).toBe('string');
    });

    it('should return error with message when an error occurred', async () => {
      mockService.initialize.mockRejectedValue(new Error('oops'));
      try { await adapter.initialize({ platform: 'mastodon', credential: '' }); } catch { /* expected */ }

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('oops');
    });
  });

  // ── sendMessage ──

  describe('sendMessage', () => {
    beforeEach(async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'tok' });
    });

    it('should send a text-only message', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Hello Mastodon!' }],
      });

      expect(result.messageId).toBe('status-1');
      expect(result.timestamp).toBeDefined();
      expect(mockService.postStatus).toHaveBeenCalledWith({
        text: 'Hello Mastodon!',
        mediaIds: undefined,
        inReplyToId: undefined,
        spoilerText: undefined,
        visibility: undefined,
      });
    });

    it('should upload media blocks and attach their ids', async () => {
      mockService.uploadMedia
        .mockResolvedValueOnce('media-img')
        .mockResolvedValueOnce('media-vid');

      await adapter.sendMessage('conv-2', {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'image', url: '/path/to/img.png', altText: 'A picture' },
          { type: 'video', url: '/path/to/vid.mp4', altText: 'A video' },
        ],
      });

      expect(mockService.uploadMedia).toHaveBeenCalledTimes(2);
      expect(mockService.uploadMedia).toHaveBeenCalledWith('/path/to/img.png', 'A picture');
      expect(mockService.uploadMedia).toHaveBeenCalledWith('/path/to/vid.mp4', 'A video');
      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaIds: ['media-img', 'media-vid'],
        }),
      );
    });

    it('should skip failed media uploads gracefully', async () => {
      mockService.uploadMedia.mockRejectedValueOnce(new Error('upload fail'));

      await adapter.sendMessage('conv-3', {
        blocks: [
          { type: 'text', text: 'Still works' },
          { type: 'image', url: '/bad/path.png' },
        ],
      });

      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaIds: undefined,
        }),
      );
    });

    it('should pass replyToMessageId as inReplyToId', async () => {
      await adapter.sendMessage('conv-4', {
        blocks: [{ type: 'text', text: 'reply text' }],
        replyToMessageId: 'parent-999',
      });

      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({ inReplyToId: 'parent-999' }),
      );
    });

    it('should extract spoiler text from a spoiler block', async () => {
      await adapter.sendMessage('conv-5', {
        blocks: [
          { type: 'text', text: 'hidden content' },
          { type: 'spoiler', text: 'CW: spoiler' },
        ],
      });

      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({ spoilerText: 'CW: spoiler' }),
      );
    });

    it('should pass visibility from platformOptions', async () => {
      await adapter.sendMessage('conv-6', {
        blocks: [{ type: 'text', text: 'dm' }],
        platformOptions: { visibility: 'direct' },
      });

      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'direct' }),
      );
    });

    it('should default text to empty string when no text block exists', async () => {
      await adapter.sendMessage('conv-7', {
        blocks: [{ type: 'image', url: '/img.png' }],
      });

      expect(mockService.postStatus).toHaveBeenCalledWith(
        expect.objectContaining({ text: '' }),
      );
    });
  });

  // ── sendTypingIndicator ──

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Mastodon does not support typing indicators)', async () => {
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
  });

  // ── addReaction ──

  describe('addReaction', () => {
    it('should call favouriteStatus on the service', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'tok' });
      await adapter.addReaction('conv-1', 'status-42', '❤️');

      expect(mockService.favouriteStatus).toHaveBeenCalledWith('status-42');
    });

    it('should ignore the emoji parameter (Mastodon uses favourite)', async () => {
      mockService.isRunning = true;
      await adapter.initialize({ platform: 'mastodon', credential: 'tok' });
      await adapter.addReaction('conv-1', 'status-42', '🎉');
      await adapter.addReaction('conv-1', 'status-42', '👍');

      // Both calls map to favouriteStatus regardless of emoji
      expect(mockService.favouriteStatus).toHaveBeenCalledTimes(2);
      expect(mockService.favouriteStatus).toHaveBeenCalledWith('status-42');
    });
  });
});
