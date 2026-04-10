// @ts-nocheck
/**
 * @fileoverview Unit tests for FacebookChannelAdapter — IChannelAdapter for Facebook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FacebookChannelAdapter } from '../src/FacebookChannelAdapter.js';
import type { FacebookService } from '../src/FacebookService.js';
import type {
  ChannelAuthConfig,
  ChannelConnectionInfo,
  MessageContent,
} from '../src/FacebookChannelAdapter.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(overrides: Partial<Record<keyof FacebookService, any>> = {}): FacebookService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isRunning: true,
    getProfile: vi.fn().mockResolvedValue({ id: 'u1', name: 'Test User' }),
    getPages: vi.fn().mockResolvedValue([]),
    postToPage: vi.fn().mockResolvedValue({ id: 'post-1', message: 'msg' }),
    postToProfile: vi.fn().mockResolvedValue({ id: 'prof-1', message: 'msg' }),
    commentOnPost: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    likePost: vi.fn().mockResolvedValue(undefined),
    unlikePost: vi.fn().mockResolvedValue(undefined),
    sharePost: vi.fn().mockResolvedValue({ id: 'share-1' }),
    searchPosts: vi.fn().mockResolvedValue([]),
    getPostAnalytics: vi.fn().mockResolvedValue({ postId: 'p1' }),
    deletePost: vi.fn().mockResolvedValue(undefined),
    uploadPhoto: vi.fn().mockResolvedValue({ id: 'ph-1' }),
    uploadVideo: vi.fn().mockResolvedValue({ id: 'vid-1' }),
    ...overrides,
  } as unknown as FacebookService;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUTH_CONFIG: ChannelAuthConfig = {
  platform: 'facebook',
  credential: 'test-credential',
};

function textContent(text: string): MessageContent {
  return { blocks: [{ type: 'text', text }] };
}

function imageContent(text: string, url: string): MessageContent {
  return {
    blocks: [
      { type: 'text', text },
      { type: 'image', url },
    ],
  };
}

function videoContent(text: string, url: string): MessageContent {
  return {
    blocks: [
      { type: 'text', text },
      { type: 'video', url },
    ],
  };
}

function linkContent(text: string, url: string): MessageContent {
  return {
    blocks: [
      { type: 'text', text },
      { type: 'link', url },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacebookChannelAdapter', () => {
  let mockService: FacebookService;
  let adapter: FacebookChannelAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new FacebookChannelAdapter(mockService);
  });

  // ── Static properties ────────────────────────────────────────────────────

  describe('static properties', () => {
    it('should expose platform as "facebook"', () => {
      expect(adapter.platform).toBe('facebook');
    });

    it('should expose displayName as "Facebook"', () => {
      expect(adapter.displayName).toBe('Facebook');
    });

    it('should list the expected capabilities', () => {
      expect(adapter.capabilities).toEqual([
        'text', 'images', 'video', 'reactions', 'comments',
        'links', 'scheduling', 'analytics', 'pages',
      ]);
    });

    it('should include at least text, images, reactions, and analytics capabilities', () => {
      expect(adapter.capabilities).toContain('text');
      expect(adapter.capabilities).toContain('images');
      expect(adapter.capabilities).toContain('reactions');
      expect(adapter.capabilities).toContain('analytics');
    });

    it('capabilities should be readonly and not empty', () => {
      expect(adapter.capabilities.length).toBeGreaterThan(0);
    });
  });

  // ── Initialize ───────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('should delegate to service.initialize()', async () => {
      await adapter.initialize(AUTH_CONFIG);

      expect(mockService.initialize).toHaveBeenCalledOnce();
    });

    it('should set connectedSince on successful init', async () => {
      await adapter.initialize(AUTH_CONFIG);

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
    });

    it('should propagate error and set error status on failure', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('Auth failed')),
        isRunning: false,
      });
      const failAdapter = new FacebookChannelAdapter(failService);

      await expect(failAdapter.initialize(AUTH_CONFIG)).rejects.toThrow('Auth failed');

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Auth failed');
    });
  });

  // ── Shutdown ─────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should delegate to service.shutdown()', async () => {
      await adapter.initialize(AUTH_CONFIG);
      await adapter.shutdown();

      expect(mockService.shutdown).toHaveBeenCalledOnce();
    });

    it('should clear connectedSince after shutdown', async () => {
      await adapter.initialize(AUTH_CONFIG);
      await adapter.shutdown();

      // After shutdown, isRunning is still true on the mock, so override it
      (mockService as any).isRunning = false;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
      expect(info.connectedSince).toBeUndefined();
    });
  });

  // ── getConnectionInfo ────────────────────────────────────────────────────

  describe('getConnectionInfo', () => {
    it('should return "disconnected" before initialization', () => {
      const freshService = createMockService({ isRunning: false });
      const freshAdapter = new FacebookChannelAdapter(freshService);

      const info = freshAdapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return "connected" with timestamp after successful init', async () => {
      await adapter.initialize(AUTH_CONFIG);

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toMatch(/^\d{4}-\d{2}-\d{2}/);
      expect(info.platformInfo).toEqual({ platform: 'facebook' });
    });

    it('should return "error" with message after failed init', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('Token expired')),
        isRunning: false,
      });
      const failAdapter = new FacebookChannelAdapter(failService);

      try {
        await failAdapter.initialize(AUTH_CONFIG);
      } catch { /* expected */ }

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Token expired');
    });

    it('should prioritize error status over isRunning check', async () => {
      // Even if isRunning is true, errorMessage should produce error status
      const svc = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('Oops')),
        isRunning: true,
      });
      const a = new FacebookChannelAdapter(svc);

      try {
        await a.initialize(AUTH_CONFIG);
      } catch { /* expected */ }

      const info = a.getConnectionInfo();
      expect(info.status).toBe('error');
    });
  });

  // ── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    beforeEach(async () => {
      await adapter.initialize(AUTH_CONFIG);
    });

    it('should post text-only content to the page', async () => {
      const result = await adapter.sendMessage('page-42', textContent('Hello!'));

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: 'Hello!',
        link: undefined,
      });
      expect(result.messageId).toBe('post-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should post an image with caption via photoUrl', async () => {
      const result = await adapter.sendMessage(
        'page-42',
        imageContent('Look at this', 'https://img.com/pic.jpg'),
      );

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: 'Look at this',
        photoUrl: 'https://img.com/pic.jpg',
      });
      expect(result.messageId).toBe('post-1');
    });

    it('should post a video with description via videoUrl', async () => {
      const result = await adapter.sendMessage(
        'page-42',
        videoContent('Watch this clip', 'https://vid.com/clip.mp4'),
      );

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: 'Watch this clip',
        videoUrl: 'https://vid.com/clip.mp4',
      });
      expect(result.messageId).toBe('post-1');
    });

    it('should post with a link block', async () => {
      const result = await adapter.sendMessage(
        'page-42',
        linkContent('Check this out', 'https://example.com'),
      );

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: 'Check this out',
        link: 'https://example.com',
      });
      expect(result.messageId).toBe('post-1');
    });

    it('should use pageId from platformOptions over conversationId', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Custom page' }],
        platformOptions: { pageId: 'override-page' },
      };

      await adapter.sendMessage('default-page', content);

      expect(mockService.postToPage).toHaveBeenCalledWith(
        'override-page',
        expect.objectContaining({ message: 'Custom page' }),
      );
    });

    it('should fall back to conversationId when platformOptions.pageId is absent', async () => {
      await adapter.sendMessage('conv-page-55', textContent('Fallback'));

      expect(mockService.postToPage).toHaveBeenCalledWith(
        'conv-page-55',
        expect.objectContaining({ message: 'Fallback' }),
      );
    });

    it('should use empty string for text when no text block is present', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'image', url: 'https://img.com/x.jpg' }],
      };

      await adapter.sendMessage('page-42', content);

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: '',
        photoUrl: 'https://img.com/x.jpg',
      });
    });

    it('should prioritize image block over video block', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'text', text: 'Both media' },
          { type: 'image', url: 'https://img.com/a.jpg' },
          { type: 'video', url: 'https://vid.com/b.mp4' },
        ],
      };

      await adapter.sendMessage('page-42', content);

      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: 'Both media',
        photoUrl: 'https://img.com/a.jpg',
      });
    });

    it('should return a valid ISO timestamp', async () => {
      const result = await adapter.sendMessage('page-42', textContent('Ts test'));
      const date = new Date(result.timestamp!);
      expect(date.getTime()).not.toBeNaN();
    });
  });

  // ── sendTypingIndicator ──────────────────────────────────────────────────

  describe('sendTypingIndicator', () => {
    it('should resolve without error (no-op for Facebook pages)', async () => {
      await expect(
        adapter.sendTypingIndicator('page-42', true),
      ).resolves.toBeUndefined();
    });
  });

  // ── addReaction ──────────────────────────────────────────────────────────

  describe('addReaction', () => {
    beforeEach(async () => {
      await adapter.initialize(AUTH_CONFIG);
    });

    it('should delegate to service.likePost with the messageId', async () => {
      await adapter.addReaction('page-42', 'post-88', 'thumbsup');

      expect(mockService.likePost).toHaveBeenCalledWith('post-88');
    });

    it('should ignore the emoji parameter and always call likePost', async () => {
      await adapter.addReaction('page-42', 'post-88', 'heart');

      // likePost is the only Facebook reaction via Graph API
      expect(mockService.likePost).toHaveBeenCalledOnce();
      expect(mockService.likePost).toHaveBeenCalledWith('post-88');
    });

    it('should ignore the conversationId parameter', async () => {
      await adapter.addReaction('any-conv-id', 'post-99', 'fire');

      expect(mockService.likePost).toHaveBeenCalledWith('post-99');
    });
  });

  // ── Event handlers (on) ──────────────────────────────────────────────────

  describe('on (event handler)', () => {
    it('should register a handler and return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);

      expect(typeof unsub).toBe('function');
    });

    it('should allow unsubscribing via the returned function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);

      // Should not throw
      unsub();
    });

    it('should accept optional event type filters', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message', 'reaction']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty blocks array gracefully', async () => {
      await adapter.initialize(AUTH_CONFIG);

      const content: MessageContent = { blocks: [] };
      const result = await adapter.sendMessage('page-42', content);

      // text defaults to empty string, no image/video/link
      expect(mockService.postToPage).toHaveBeenCalledWith('page-42', {
        message: '',
        link: undefined,
      });
      expect(result.messageId).toBe('post-1');
    });

    it('should propagate service errors through sendMessage', async () => {
      await adapter.initialize(AUTH_CONFIG);

      const failService = createMockService({
        postToPage: vi.fn().mockRejectedValue(new Error('Graph API error')),
        isRunning: true,
      });
      const failAdapter = new FacebookChannelAdapter(failService);
      await failAdapter.initialize(AUTH_CONFIG);

      await expect(
        failAdapter.sendMessage('page-42', textContent('Fail')),
      ).rejects.toThrow('Graph API error');
    });

    it('should handle multiple initializations gracefully', async () => {
      await adapter.initialize(AUTH_CONFIG);
      await adapter.initialize(AUTH_CONFIG);

      expect(mockService.initialize).toHaveBeenCalledTimes(2);
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
    });

    it('should handle initialize-shutdown-initialize cycle', async () => {
      await adapter.initialize(AUTH_CONFIG);
      await adapter.shutdown();

      // Reset isRunning for the disconnected check
      (mockService as any).isRunning = false;
      expect(adapter.getConnectionInfo().status).toBe('disconnected');

      // Re-initialize
      (mockService as any).isRunning = true;
      await adapter.initialize(AUTH_CONFIG);
      expect(adapter.getConnectionInfo().status).toBe('connected');
    });
  });
});
