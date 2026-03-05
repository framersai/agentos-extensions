/**
 * @fileoverview Unit tests for BlueskyChannelAdapter.
 *
 * Validates platform metadata, capabilities, initialize/shutdown lifecycle,
 * sendMessage routing (text, images, replies), typing indicators,
 * event handlers, addReaction, and connection info reporting.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlueskyChannelAdapter } from '../src/BlueskyChannelAdapter.js';
import type { BlueskyService } from '../src/BlueskyService.js';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService(): BlueskyService {
  return {
    isRunning: false,
    handle: 'alice.bsky.social',
    initialize: vi.fn(async function (this: any) { this.isRunning = true; }),
    shutdown: vi.fn(async function (this: any) { this.isRunning = false; }),
    createPost: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:test/app.bsky.feed.post/abc',
      cid: 'cid-1',
      url: 'https://bsky.app/profile/alice.bsky.social/post/abc',
    }),
    reply: vi.fn().mockResolvedValue({
      uri: 'at://did:plc:test/app.bsky.feed.post/reply1',
      cid: 'cid-reply1',
      url: 'https://bsky.app/profile/alice.bsky.social/post/reply1',
    }),
    like: vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.like/l1' }),
    unlike: vi.fn().mockResolvedValue(undefined),
    repost: vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.repost/rp1' }),
    unrepost: vi.fn().mockResolvedValue(undefined),
    searchPosts: vi.fn().mockResolvedValue([]),
    searchActors: vi.fn().mockResolvedValue([]),
    getTimeline: vi.fn().mockResolvedValue({ posts: [], cursor: undefined }),
    getAuthorFeed: vi.fn().mockResolvedValue([]),
    follow: vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.graph.follow/f1' }),
    unfollow: vi.fn().mockResolvedValue(undefined),
    getProfile: vi.fn().mockResolvedValue({
      did: 'did:plc:test',
      handle: 'alice.bsky.social',
      followersCount: 0,
      followsCount: 0,
      postsCount: 0,
    }),
    getPostThread: vi.fn().mockResolvedValue({
      post: {
        uri: 'at://did:plc:test/app.bsky.feed.post/th1',
        cid: 'cid-th1',
      },
    }),
    deletePost: vi.fn().mockResolvedValue(undefined),
    resolveHandle: vi.fn().mockResolvedValue('did:plc:resolved'),
    buildPostUrl: vi.fn().mockReturnValue('https://bsky.app/profile/alice.bsky.social/post/abc'),
  } as unknown as BlueskyService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlueskyChannelAdapter', () => {
  let mockService: BlueskyService;
  let adapter: BlueskyChannelAdapter;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new BlueskyChannelAdapter(mockService);
  });

  // ── Platform metadata ──────────────────────────────────────────────────

  describe('platform metadata', () => {
    it('should expose platform as "bluesky"', () => {
      expect(adapter.platform).toBe('bluesky');
    });

    it('should expose displayName as "Bluesky"', () => {
      expect(adapter.displayName).toBe('Bluesky');
    });

    it('should list all expected capabilities', () => {
      expect(adapter.capabilities).toEqual([
        'text', 'images', 'reactions', 'threads',
        'hashtags', 'engagement_metrics', 'content_discovery',
      ]);
    });

    it('should have 7 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(7);
    });
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────

  describe('initialize / shutdown', () => {
    it('should delegate to service.initialize()', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'alice.bsky.social' });
      expect(mockService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should set connection status to connected after init', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'alice.bsky.social' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      expect(info.platformInfo).toEqual({ platform: 'bluesky' });
    });

    it('should set error status when service.initialize() throws', async () => {
      (mockService.initialize as any).mockRejectedValueOnce(new Error('Invalid app password'));

      await expect(
        adapter.initialize({ platform: 'bluesky', credential: 'bad' }),
      ).rejects.toThrow('Invalid app password');

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Invalid app password');
    });

    it('should delegate to service.shutdown()', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'alice.bsky.social' });
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should report disconnected after shutdown', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'alice.bsky.social' });
      await adapter.shutdown();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should clear connectedSince on shutdown', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'alice.bsky.social' });
      const infoBeforeShutdown = adapter.getConnectionInfo();
      expect(infoBeforeShutdown.connectedSince).toBeDefined();

      await adapter.shutdown();
      const infoAfterShutdown = adapter.getConnectionInfo();
      expect(infoAfterShutdown.connectedSince).toBeUndefined();
    });
  });

  // ── getConnectionInfo ─────────────────────────────────────────────────

  describe('getConnectionInfo', () => {
    it('should return disconnected when service is not running', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should not include connectedSince when disconnected', () => {
      const info = adapter.getConnectionInfo();
      expect(info.connectedSince).toBeUndefined();
    });

    it('should include platformInfo when connected', async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'cred' });
      const info = adapter.getConnectionInfo();
      expect(info.platformInfo).toEqual({ platform: 'bluesky' });
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    beforeEach(async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'cred' });
    });

    it('should route text-only content to createPost', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Hello Bluesky!' }],
      });

      expect(mockService.createPost).toHaveBeenCalledWith('Hello Bluesky!', {
        images: undefined,
        replyTo: undefined,
      });
      expect(result.messageId).toBe('at://did:plc:test/app.bsky.feed.post/abc');
      expect(result.timestamp).toBeDefined();
    });

    it('should collect image blocks and pass to createPost', async () => {
      const imageData = new Uint8Array([1, 2, 3]);
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'With images' },
          { type: 'image', data: imageData, mimeType: 'image/png', alt: 'Test' },
        ],
      });

      expect(mockService.createPost).toHaveBeenCalledWith('With images', {
        images: [{ data: imageData, mimeType: 'image/png', alt: 'Test' }],
        replyTo: undefined,
      });
      expect(result.messageId).toBeDefined();
    });

    it('should default image mimeType to image/jpeg when not provided', async () => {
      const imageData = new Uint8Array([4, 5, 6]);
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Default mime' },
          { type: 'image', data: imageData },
        ],
      });

      expect(mockService.createPost).toHaveBeenCalledWith('Default mime', {
        images: [{ data: imageData, mimeType: 'image/jpeg', alt: undefined }],
        replyTo: undefined,
      });
    });

    it('should pass replyTo when replyToMessageId is set', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Replying!' }],
        replyToMessageId: 'at://did:plc:parent/app.bsky.feed.post/p1',
        platformOptions: { cid: 'cid-parent' },
      });

      expect(mockService.createPost).toHaveBeenCalledWith('Replying!', {
        images: undefined,
        replyTo: {
          uri: 'at://did:plc:parent/app.bsky.feed.post/p1',
          cid: 'cid-parent',
        },
      });
    });

    it('should default CID to empty string when platformOptions.cid missing', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Reply no cid' }],
        replyToMessageId: 'at://did:plc:p/app.bsky.feed.post/p2',
      });

      expect(mockService.createPost).toHaveBeenCalledWith('Reply no cid', {
        images: undefined,
        replyTo: {
          uri: 'at://did:plc:p/app.bsky.feed.post/p2',
          cid: '',
        },
      });
    });

    it('should handle content with no text block gracefully', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'some-other-type', value: 42 }],
      });

      expect(mockService.createPost).toHaveBeenCalledWith('', {
        images: undefined,
        replyTo: undefined,
      });
    });

    it('should collect multiple image blocks', async () => {
      const img1 = new Uint8Array([1]);
      const img2 = new Uint8Array([2]);

      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Multi-image' },
          { type: 'image', data: img1, mimeType: 'image/jpeg' },
          { type: 'image', data: img2, mimeType: 'image/png', alt: 'Second' },
        ],
      });

      const callArgs = (mockService.createPost as any).mock.calls[0];
      expect(callArgs[1].images).toHaveLength(2);
    });

    it('should skip image blocks without data property', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'text', text: 'Image without data' },
          { type: 'image', url: 'https://example.com/no-data.jpg' },
        ],
      });

      // Image block has no .data, so images array should be empty / undefined
      const callArgs = (mockService.createPost as any).mock.calls[0];
      expect(callArgs[1].images).toBeUndefined();
    });
  });

  // ── sendTypingIndicator ────────────────────────────────────────────────

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Bluesky has no typing indicators)', async () => {
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
      // No error means success
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

  // ── addReaction ────────────────────────────────────────────────────────

  describe('addReaction', () => {
    beforeEach(async () => {
      await adapter.initialize({ platform: 'bluesky', credential: 'cred' });
    });

    it('should fetch post thread then like the post', async () => {
      await adapter.addReaction('conv-1', 'at://did:plc:test/app.bsky.feed.post/th1', 'heart');

      expect(mockService.getPostThread).toHaveBeenCalledWith(
        'at://did:plc:test/app.bsky.feed.post/th1',
      );
      expect(mockService.like).toHaveBeenCalledWith(
        'at://did:plc:test/app.bsky.feed.post/th1',
        'cid-th1',
      );
    });

    it('should not call like when thread has no post CID', async () => {
      (mockService.getPostThread as any).mockResolvedValueOnce({ post: { uri: 'some-uri' } });

      await adapter.addReaction('conv-1', 'some-uri', 'star');

      expect(mockService.getPostThread).toHaveBeenCalled();
      expect(mockService.like).not.toHaveBeenCalled();
    });

    it('should not call like when thread is null', async () => {
      (mockService.getPostThread as any).mockResolvedValueOnce(null);

      await adapter.addReaction('conv-1', 'bad-uri', 'thumbsup');

      expect(mockService.like).not.toHaveBeenCalled();
    });
  });
});
