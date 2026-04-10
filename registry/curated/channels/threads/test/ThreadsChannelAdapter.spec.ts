// @ts-nocheck
/**
 * @fileoverview Unit tests for ThreadsChannelAdapter.
 *
 * Validates platform metadata, capabilities, initialize/shutdown lifecycle,
 * sendMessage routing, typing indicators, event handlers, addReaction,
 * and connection info reporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThreadsChannelAdapter } from '../src/ThreadsChannelAdapter.js';
import type { ThreadsService } from '../src/ThreadsService.js';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService(): ThreadsService {
  return {
    isRunning: false,
    initialize: vi.fn(async function (this: any) { this.isRunning = true; }),
    shutdown: vi.fn(async function (this: any) { this.isRunning = false; }),
    createTextPost: vi.fn().mockResolvedValue({ id: 'text-1', text: 'hello' }),
    createImagePost: vi.fn().mockResolvedValue({ id: 'img-1', text: 'pic', mediaUrl: 'https://img/1.jpg' }),
    createVideoPost: vi.fn().mockResolvedValue({ id: 'vid-1', text: 'video', mediaUrl: 'https://vid/1.mp4' }),
    createCarouselPost: vi.fn().mockResolvedValue({ id: 'carousel-1', text: 'swipe' }),
    replyToPost: vi.fn().mockResolvedValue({ id: 'reply-1', text: 'replying' }),
    likePost: vi.fn().mockResolvedValue(undefined),
    unlikePost: vi.fn().mockResolvedValue(undefined),
    quotePost: vi.fn().mockResolvedValue({ id: 'quote-1', text: 'quoted' }),
    getUserThreads: vi.fn().mockResolvedValue([]),
    getPostInsights: vi.fn().mockResolvedValue({ postId: 'p1', views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0 }),
    deletePost: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue({ id: '1', username: 'test' }),
  } as unknown as ThreadsService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThreadsChannelAdapter', () => {
  let mockService: ThreadsService;
  let adapter: ThreadsChannelAdapter;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new ThreadsChannelAdapter(mockService);
  });

  // ── Platform metadata ──────────────────────────────────────────────────

  describe('platform metadata', () => {
    it('should expose platform as "threads"', () => {
      expect(adapter.platform).toBe('threads');
    });

    it('should expose displayName as "Threads"', () => {
      expect(adapter.displayName).toBe('Threads');
    });

    it('should list all expected capabilities', () => {
      expect(adapter.capabilities).toEqual([
        'text', 'images', 'video', 'carousels', 'reactions',
        'threads', 'quotes', 'engagement_metrics',
      ]);
    });

    it('should have 8 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(8);
    });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────

  describe('initialize / shutdown', () => {
    it('should delegate to service.initialize()', async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
      expect(mockService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should set connection status to connected after init', async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      expect(info.platformInfo).toEqual({ platform: 'threads' });
    });

    it('should set error status when service.initialize() throws', async () => {
      (mockService.initialize as any).mockRejectedValueOnce(new Error('auth failed'));

      await expect(
        adapter.initialize({ platform: 'threads', credential: 'bad' }),
      ).rejects.toThrow('auth failed');

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('auth failed');
    });

    it('should delegate to service.shutdown()', async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should report disconnected after shutdown', async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
      await adapter.shutdown();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });
  });

  // ── getConnectionInfo ─────────────────────────────────────────────────

  describe('getConnectionInfo', () => {
    it('should return disconnected when service is not running', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    beforeEach(async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
    });

    it('should route text-only content to createTextPost', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Hello world' }],
      });

      expect(mockService.createTextPost).toHaveBeenCalledWith('Hello world');
      expect(result.messageId).toBe('text-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should route image content to createImagePost', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'image', url: 'https://img.test/photo.jpg' },
        ],
      });

      expect(mockService.createImagePost).toHaveBeenCalledWith(
        'Check this out',
        'https://img.test/photo.jpg',
      );
      expect(result.messageId).toBe('img-1');
    });

    it('should route video content to createVideoPost', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Watch this' },
          { type: 'video', url: 'https://vid.test/clip.mp4' },
        ],
      });

      expect(mockService.createVideoPost).toHaveBeenCalledWith(
        'Watch this',
        'https://vid.test/clip.mp4',
      );
      expect(result.messageId).toBe('vid-1');
    });

    it('should route carousel content to createCarouselPost', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Swipe!' },
          { type: 'carousel_item', mediaType: 'IMAGE', url: 'https://img/a.jpg' },
          { type: 'carousel_item', mediaType: 'VIDEO', url: 'https://vid/b.mp4' },
        ],
      });

      expect(mockService.createCarouselPost).toHaveBeenCalledWith('Swipe!', [
        { type: 'IMAGE', url: 'https://img/a.jpg' },
        { type: 'VIDEO', url: 'https://vid/b.mp4' },
      ]);
      expect(result.messageId).toBe('carousel-1');
    });

    it('should route replies via replyToPost when replyToMessageId is set', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Great post!' }],
        replyToMessageId: 'original-post-42',
      });

      expect(mockService.replyToPost).toHaveBeenCalledWith(
        'original-post-42',
        'Great post!',
        undefined,
      );
      expect(result.messageId).toBe('reply-1');
    });

    it('should send reply with media when replyToMessageId and image block present', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Reply with image' },
          { type: 'image', url: 'https://img.test/reply.jpg' },
        ],
        replyToMessageId: 'parent-id-5',
      });

      expect(mockService.replyToPost).toHaveBeenCalledWith(
        'parent-id-5',
        'Reply with image',
        'https://img.test/reply.jpg',
      );
    });

    it('should handle content with no text block gracefully', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'image', url: 'https://img.test/notext.jpg' }],
      });

      // Falls through to image post since no carousel items
      expect(mockService.createImagePost).toHaveBeenCalledWith(
        '',
        'https://img.test/notext.jpg',
      );
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────────────

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Threads has no typing indicators)', async () => {
      await expect(adapter.sendTypingIndicator('conv-1', true)).resolves.toBeUndefined();
    });
  });

  // ── Event handlers ─────────────────────────────────────────────────────

  describe('on', () => {
    it('should register a handler and return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should remove handler when unsubscribe is called', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // No error — simply verifies the function runs without issues
    });
  });

  // ── addReaction ────────────────────────────────────────────────────────

  describe('addReaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ platform: 'threads', credential: 'tok' });
    });

    it('should delegate to service.likePost', async () => {
      await adapter.addReaction('conv-1', 'post-77', 'heart');
      expect(mockService.likePost).toHaveBeenCalledWith('post-77');
    });

    it('should ignore the emoji parameter (Threads only supports likes)', async () => {
      await adapter.addReaction('conv-1', 'post-77', '');
      expect(mockService.likePost).toHaveBeenCalledWith('post-77');
    });
  });
});
