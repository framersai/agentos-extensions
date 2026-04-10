// @ts-nocheck
/**
 * Unit tests for LinkedInChannelAdapter (IChannelAdapter implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock axios BEFORE importing the adapter (which transitively imports LinkedInService)
vi.mock('axios', () => {
  const mockAxios = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { default: mockAxios };
});

import { LinkedInChannelAdapter } from '../src/LinkedInChannelAdapter';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService() {
  return {
    isRunning: true,
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    postToFeed: vi.fn().mockResolvedValue({ id: 'li-post-1', url: 'https://linkedin.com/feed/update/li-post-1' }),
    commentOnPost: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    likePost: vi.fn().mockResolvedValue(undefined),
    unlikePost: vi.fn().mockResolvedValue(undefined),
    sharePost: vi.fn().mockResolvedValue({ id: 'share-1', url: 'https://linkedin.com/feed/update/share-1' }),
    searchPosts: vi.fn().mockResolvedValue([]),
    getPostAnalytics: vi.fn().mockResolvedValue({ likes: 0, comments: 0, shares: 0, impressions: 0, clicks: 0, engagement: 0 }),
    getProfile: vi.fn().mockResolvedValue({ personId: 'person-1', name: 'Test User' }),
    getMe: vi.fn().mockResolvedValue({ id: 'person-1', name: 'Test User' }),
    getOrganizations: vi.fn().mockResolvedValue([]),
    deletePost: vi.fn().mockResolvedValue(undefined),
    registerImageUpload: vi.fn().mockResolvedValue({ uploadUrl: 'https://upload.url', asset: 'asset-1' }),
    uploadImage: vi.fn().mockResolvedValue(undefined),
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinkedInChannelAdapter', () => {
  let adapter: LinkedInChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new LinkedInChannelAdapter(mockService);
  });

  // ── platform and capabilities ──

  describe('platform and capabilities', () => {
    it('should have platform set to linkedin', () => {
      expect(adapter.platform).toBe('linkedin');
    });

    it('should have displayName set to LinkedIn', () => {
      expect(adapter.displayName).toBe('LinkedIn');
    });

    it('should expose the full set of capabilities', () => {
      const expected = [
        'text',
        'images',
        'video',
        'reactions',
        'articles',
        'company_pages',
        'engagement_metrics',
        'scheduling',
        'content_discovery',
      ];
      expect(adapter.capabilities).toEqual(expected);
    });

    it('should include text capability', () => {
      expect(adapter.capabilities).toContain('text');
    });

    it('should include images capability', () => {
      expect(adapter.capabilities).toContain('images');
    });

    it('should include video capability', () => {
      expect(adapter.capabilities).toContain('video');
    });

    it('should include reactions capability', () => {
      expect(adapter.capabilities).toContain('reactions');
    });

    it('should include articles capability', () => {
      expect(adapter.capabilities).toContain('articles');
    });

    it('should include company_pages capability', () => {
      expect(adapter.capabilities).toContain('company_pages');
    });

    it('should include engagement_metrics capability', () => {
      expect(adapter.capabilities).toContain('engagement_metrics');
    });

    it('should include scheduling capability', () => {
      expect(adapter.capabilities).toContain('scheduling');
    });

    it('should include content_discovery capability', () => {
      expect(adapter.capabilities).toContain('content_discovery');
    });

    it('should have exactly 9 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(9);
    });
  });

  // ── initialize ──

  describe('initialize', () => {
    it('should call service.initialize', async () => {
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });

      expect(mockService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should set connectedAt timestamp on successful initialization', async () => {
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      // Should be a valid ISO string
      expect(new Date(info.connectedSince!).toISOString()).toBe(info.connectedSince);
    });

    it('should clear errorMessage on successful initialization', async () => {
      // First: fail initialization
      mockService.initialize.mockRejectedValueOnce(new Error('Auth failed'));
      try {
        await adapter.initialize({ platform: 'linkedin', credential: 'bad' });
      } catch {
        // expected
      }

      // Verify error state
      expect(adapter.getConnectionInfo().status).toBe('error');

      // Second: succeed
      mockService.initialize.mockResolvedValueOnce(undefined);
      await adapter.initialize({ platform: 'linkedin', credential: 'good' });

      // Error should be cleared
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.errorMessage).toBeUndefined();
    });

    it('should store errorMessage and re-throw on initialization failure', async () => {
      mockService.initialize.mockRejectedValueOnce(new Error('Token invalid'));

      await expect(
        adapter.initialize({ platform: 'linkedin', credential: 'bad-token' }),
      ).rejects.toThrow('Token invalid');

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Token invalid');
    });
  });

  // ── shutdown ──

  describe('shutdown', () => {
    it('should call service.shutdown', async () => {
      await adapter.shutdown();

      expect(mockService.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should clear connectedAt on shutdown', async () => {
      // Initialize first to set connectedAt
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });
      expect(adapter.getConnectionInfo().connectedSince).toBeDefined();

      // Shutdown
      mockService.isRunning = false;
      await adapter.shutdown();

      const info = adapter.getConnectionInfo();
      expect(info.connectedSince).toBeUndefined();
    });
  });

  // ── getConnectionInfo ──

  describe('getConnectionInfo', () => {
    it('should return connected when service is running after init', async () => {
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
      expect(info.platformInfo).toEqual({ platform: 'linkedin' });
    });

    it('should return disconnected when service is not running', () => {
      mockService.isRunning = false;

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return connected without connectedSince when isRunning but not initialized via adapter', () => {
      // Service is running (mocked true) but adapter.initialize() was never called
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeUndefined();
    });

    it('should return error status when initialization failed', async () => {
      mockService.initialize.mockRejectedValueOnce(new Error('Bad credentials'));

      try {
        await adapter.initialize({ platform: 'linkedin', credential: 'invalid' });
      } catch {
        // expected
      }

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Bad credentials');
    });

    it('should prioritize error status over isRunning check', async () => {
      // Set error state
      mockService.initialize.mockRejectedValueOnce(new Error('Error state'));
      try {
        await adapter.initialize({ platform: 'linkedin', credential: 'bad' });
      } catch {
        // expected
      }

      // Even if service is running, error takes precedence
      mockService.isRunning = true;
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('error');
    });
  });

  // ── sendMessage ──

  describe('sendMessage', () => {
    it('should call postToFeed with text from text blocks', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Hello LinkedIn!' }],
      };

      const result = await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith({
        text: 'Hello LinkedIn!',
        mediaUrls: undefined,
        articleUrl: undefined,
        articleTitle: undefined,
        articleDescription: undefined,
        visibility: 'PUBLIC',
      });
      expect(result.messageId).toBe('li-post-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should use empty string text when no text block is present', async () => {
      const content = {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({ text: '' }),
      );
    });

    it('should extract media URLs from image blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Check this out' },
          { type: 'image', url: 'https://example.com/photo1.jpg' },
          { type: 'image', url: 'https://example.com/photo2.jpg' },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
        }),
      );
    });

    it('should extract media URLs from video blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Watch this' },
          { type: 'video', url: 'https://example.com/clip.mp4' },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrls: ['https://example.com/clip.mp4'],
        }),
      );
    });

    it('should handle mixed image and video blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Mixed media' },
          { type: 'image', url: 'https://example.com/img.jpg' },
          { type: 'video', url: 'https://example.com/vid.mp4' },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrls: ['https://example.com/img.jpg', 'https://example.com/vid.mp4'],
        }),
      );
    });

    it('should skip media blocks without a url property', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'No URL media' },
          { type: 'image' }, // no url
          { type: 'video', url: 'https://example.com/vid.mp4' },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          mediaUrls: ['https://example.com/vid.mp4'],
        }),
      );
    });

    it('should send undefined mediaUrls when no media blocks have URLs', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Text only' }],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({ mediaUrls: undefined }),
      );
    });

    it('should handle article blocks', async () => {
      const content = {
        blocks: [
          { type: 'text', text: 'Great read' },
          {
            type: 'article',
            url: 'https://example.com/article',
            title: 'Article Title',
            description: 'Article description',
          },
        ],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          articleUrl: 'https://example.com/article',
          articleTitle: 'Article Title',
          articleDescription: 'Article description',
        }),
      );
    });

    it('should pass undefined article fields when no article block is present', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'No article' }],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({
          articleUrl: undefined,
          articleTitle: undefined,
          articleDescription: undefined,
        }),
      );
    });

    it('should pass visibility from platformOptions', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Connections only' }],
        platformOptions: { visibility: 'CONNECTIONS' },
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'CONNECTIONS' }),
      );
    });

    it('should default visibility to PUBLIC when platformOptions is not set', async () => {
      const content = {
        blocks: [{ type: 'text', text: 'Default visibility' }],
      };

      await adapter.sendMessage('conv-1', content);

      expect(mockService.postToFeed).toHaveBeenCalledWith(
        expect.objectContaining({ visibility: 'PUBLIC' }),
      );
    });

    it('should return messageId and timestamp from the post result', async () => {
      mockService.postToFeed.mockResolvedValueOnce({
        id: 'custom-post-id',
        url: 'https://linkedin.com/feed/update/custom-post-id',
      });

      const result = await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'text', text: 'Check result' }],
      });

      expect(result.messageId).toBe('custom-post-id');
      expect(result.timestamp).toBeDefined();
      // Timestamp should be a valid ISO string
      expect(new Date(result.timestamp!).toISOString()).toBe(result.timestamp);
    });
  });

  // ── sendTypingIndicator ──

  describe('sendTypingIndicator', () => {
    it('should be a no-op (LinkedIn does not support typing indicators)', async () => {
      await adapter.sendTypingIndicator('conv-1', true);
      await adapter.sendTypingIndicator('conv-1', false);

      // Should not call any service methods
      expect(mockService.postToFeed).not.toHaveBeenCalled();
      expect(mockService.likePost).not.toHaveBeenCalled();
    });
  });

  // ── on / off ──

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

    it('should accept optional eventTypes parameter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message', 'reaction']);

      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ── addReaction ──

  describe('addReaction', () => {
    it('should call service.likePost with the messageId', async () => {
      await adapter.addReaction('conv-1', 'post-to-like', 'heart');

      expect(mockService.likePost).toHaveBeenCalledWith('post-to-like');
    });

    it('should call likePost regardless of the emoji type', async () => {
      await adapter.addReaction('conv-1', 'post-123', 'thumbsup');
      await adapter.addReaction('conv-1', 'post-456', 'celebrate');

      expect(mockService.likePost).toHaveBeenCalledWith('post-123');
      expect(mockService.likePost).toHaveBeenCalledWith('post-456');
      expect(mockService.likePost).toHaveBeenCalledTimes(2);
    });

    it('should ignore the conversationId parameter', async () => {
      await adapter.addReaction('any-conv', 'target-post', 'like');

      expect(mockService.likePost).toHaveBeenCalledWith('target-post');
    });

    it('should propagate errors from service.likePost', async () => {
      mockService.likePost.mockRejectedValueOnce(new Error('Rate limited'));

      await expect(
        adapter.addReaction('conv-1', 'post-1', 'heart'),
      ).rejects.toThrow('Rate limited');
    });
  });

  // ── lifecycle integration ──

  describe('lifecycle', () => {
    it('should call service.initialize on adapter initialize', async () => {
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });
      expect(mockService.initialize).toHaveBeenCalledTimes(1);
    });

    it('should call service.shutdown on adapter shutdown', async () => {
      await adapter.shutdown();
      expect(mockService.shutdown).toHaveBeenCalledTimes(1);
    });

    it('should support full lifecycle: init -> use -> shutdown', async () => {
      // Initialize
      await adapter.initialize({ platform: 'linkedin', credential: 'token' });
      expect(adapter.getConnectionInfo().status).toBe('connected');

      // Use
      const result = await adapter.sendMessage('conv', {
        blocks: [{ type: 'text', text: 'Lifecycle test' }],
      });
      expect(result.messageId).toBe('li-post-1');

      // Shutdown
      mockService.isRunning = false;
      await adapter.shutdown();
      expect(adapter.getConnectionInfo().status).toBe('disconnected');
    });
  });
});
