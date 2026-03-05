/**
 * Unit tests for LemmyChannelAdapter (IChannelAdapter implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxios } = vi.hoisted(() => {
  const mockAxios: Record<string, any> = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { mockAxios };
});
vi.mock('axios', () => ({ default: mockAxios }));

import { LemmyChannelAdapter } from '../src/LemmyChannelAdapter';
import type { LemmyService, LemmyPostResult, LemmyCommentResult } from '../src/LemmyService';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService(overrides: Partial<Record<string, any>> = {}): LemmyService {
  return {
    isRunning: false,
    initialize: vi.fn().mockImplementation(async function (this: any) {
      this.isRunning = true;
    }),
    shutdown: vi.fn().mockImplementation(async function (this: any) {
      this.isRunning = false;
    }),
    createPost: vi.fn().mockResolvedValue({
      id: 42,
      name: 'Test Post',
      body: 'Content',
      communityId: 5,
      creatorId: 1,
    } satisfies LemmyPostResult),
    getPost: vi.fn().mockResolvedValue(null),
    deletePost: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue({
      id: 100,
      content: 'Nice!',
      postId: 42,
      creatorId: 1,
    } satisfies LemmyCommentResult),
    vote: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue({ posts: [], comments: [], communities: [] }),
    subscribeToCommunity: vi.fn().mockResolvedValue(undefined),
    getCommunity: vi.fn().mockResolvedValue(null),
    getFeed: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as LemmyService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LemmyChannelAdapter', () => {
  let adapter: LemmyChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new LemmyChannelAdapter(mockService);
  });

  // ========================================================================
  // Platform & Capabilities
  // ========================================================================

  describe('platform and capabilities', () => {
    it('should have platform set to lemmy', () => {
      expect(adapter.platform).toBe('lemmy');
    });

    it('should have display name Lemmy', () => {
      expect(adapter.displayName).toBe('Lemmy');
    });

    it('should expose the correct capabilities', () => {
      expect(adapter.capabilities).toEqual([
        'text', 'links', 'threads', 'reactions', 'communities',
        'content_discovery', 'voting',
      ]);
    });

    it('should have 7 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(7);
    });
  });

  // ========================================================================
  // Lifecycle — initialize
  // ========================================================================

  describe('initialize', () => {
    it('should call service.initialize and set connection info to connected', async () => {
      await adapter.initialize({ platform: 'lemmy', credential: 'https://lemmy.example.com' });

      expect(mockService.initialize).toHaveBeenCalled();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
    });

    it('should record connectedSince as a valid ISO timestamp', async () => {
      const before = new Date().toISOString();
      await adapter.initialize({ platform: 'lemmy', credential: 'test' });
      const after = new Date().toISOString();

      const info = adapter.getConnectionInfo();
      expect(info.connectedSince! >= before).toBe(true);
      expect(info.connectedSince! <= after).toBe(true);
    });

    it('should set error status and re-throw when service.initialize fails', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('Login failed')),
      });
      const failAdapter = new LemmyChannelAdapter(failService);

      await expect(
        failAdapter.initialize({ platform: 'lemmy', credential: 'test' }),
      ).rejects.toThrow('Login failed');

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Login failed');
    });
  });

  // ========================================================================
  // Lifecycle — shutdown
  // ========================================================================

  describe('shutdown', () => {
    it('should call service.shutdown and clear connectedAt', async () => {
      await adapter.initialize({ platform: 'lemmy', credential: 'test' });
      await adapter.shutdown();

      expect(mockService.shutdown).toHaveBeenCalled();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
      expect(info.connectedSince).toBeUndefined();
    });

    it('should be safe to call when not initialized', async () => {
      await adapter.shutdown(); // should not throw
      expect(adapter.getConnectionInfo().status).toBe('disconnected');
    });
  });

  // ========================================================================
  // getConnectionInfo
  // ========================================================================

  describe('getConnectionInfo', () => {
    it('should return disconnected before initialization', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return connected after initialization', async () => {
      await adapter.initialize({ platform: 'lemmy', credential: 'test' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.platformInfo).toEqual({ platform: 'lemmy' });
    });

    it('should return error when initialization failed', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('fail')),
      });
      const failAdapter = new LemmyChannelAdapter(failService);

      try { await failAdapter.initialize({ platform: 'lemmy', credential: 'test' }); } catch {}

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('fail');
    });
  });

  // ========================================================================
  // sendMessage
  // ========================================================================

  describe('sendMessage', () => {
    it('should create a new post when no replyToMessageId is set', async () => {
      const result = await adapter.sendMessage('community-1', {
        blocks: [
          { type: 'title', text: 'My Post Title' },
          { type: 'text', text: 'Post body content' },
        ],
        platformOptions: { communityId: 5 },
      });

      expect(mockService.createPost).toHaveBeenCalledWith(
        5,             // communityId from platformOptions
        'My Post Title', // title from title block
        'Post body content', // text from text block
        undefined,     // no link block
      );
      expect(result.messageId).toBe('42');
      expect(result.timestamp).toBeDefined();
    });

    it('should create a comment when replyToMessageId is set', async () => {
      const result = await adapter.sendMessage('community-1', {
        blocks: [{ type: 'text', text: 'Great post!' }],
        replyToMessageId: '42',
      });

      expect(mockService.createComment).toHaveBeenCalledWith(42, 'Great post!');
      expect(result.messageId).toBe('100');
    });

    it('should use first 100 chars of text as title when no title block', async () => {
      const longText = 'A'.repeat(200);
      await adapter.sendMessage('community-1', {
        blocks: [{ type: 'text', text: longText }],
        platformOptions: { communityId: 1 },
      });

      const call = (mockService.createPost as any).mock.calls[0];
      expect(call[1]).toBe(longText.slice(0, 100)); // title
    });

    it('should extract URL from link blocks', async () => {
      await adapter.sendMessage('community-1', {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'link', url: 'https://example.com' },
        ],
        platformOptions: { communityId: 3 },
      });

      const call = (mockService.createPost as any).mock.calls[0];
      expect(call[3]).toBe('https://example.com'); // url param
    });

    it('should default communityId to 0 when not specified', async () => {
      await adapter.sendMessage('community-1', {
        blocks: [{ type: 'text', text: 'body' }],
      });

      const call = (mockService.createPost as any).mock.calls[0];
      expect(call[0]).toBe(0); // communityId
    });

    it('should handle empty blocks gracefully', async () => {
      await adapter.sendMessage('community-1', {
        blocks: [],
        platformOptions: { communityId: 1 },
      });

      const call = (mockService.createPost as any).mock.calls[0];
      expect(call[1]).toBe(''); // title falls back to text.slice(0, 100) which is ''
      expect(call[2]).toBe(''); // text body is ''
    });
  });

  // ========================================================================
  // sendTypingIndicator
  // ========================================================================

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Lemmy does not support typing indicators)', async () => {
      await adapter.sendTypingIndicator('community-1', true);
      await adapter.sendTypingIndicator('community-1', false);
      // No throw and no side effects
    });
  });

  // ========================================================================
  // on (event handler)
  // ========================================================================

  describe('on', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('should register a handler that can be unsubscribed', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // Should not throw, handler is removed
    });

    it('should support multiple handlers', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      const unsub1 = adapter.on(h1);
      const unsub2 = adapter.on(h2);

      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');

      unsub1();
      unsub2();
    });

    it('should accept eventTypes filter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message', 'reaction']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ========================================================================
  // addReaction
  // ========================================================================

  describe('addReaction', () => {
    it('should map reaction to an upvote on the post', async () => {
      await adapter.addReaction('community-1', '42', '👍');

      expect(mockService.vote).toHaveBeenCalledWith('post', 42, 1);
    });

    it('should parse messageId as integer', async () => {
      await adapter.addReaction('community-1', '123', '❤️');

      expect(mockService.vote).toHaveBeenCalledWith('post', 123, 1);
    });
  });
});
