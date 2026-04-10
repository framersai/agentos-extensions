// @ts-nocheck
/**
 * Unit tests for BlogPublisherChannelAdapter (IChannelAdapter implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxios } = vi.hoisted(() => {
  const mockAxios: Record<string, any> = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { mockAxios };
});
vi.mock('axios', () => ({ default: mockAxios }));

import { BlogPublisherChannelAdapter } from '../src/BlogPublisherChannelAdapter';
import type { BlogPublisherService, PublishedArticle } from '../src/BlogPublisherService';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService(overrides: Partial<BlogPublisherService> = {}): BlogPublisherService {
  return {
    getConfiguredPlatforms: vi.fn().mockReturnValue(['devto', 'hashnode']),
    publishToAll: vi.fn().mockResolvedValue([
      {
        platform: 'devto',
        id: 'art-1',
        url: 'https://dev.to/art-1',
        title: 'Test',
        published: true,
      } satisfies PublishedArticle,
    ]),
    publishToDevto: vi.fn(),
    publishToHashnode: vi.fn(),
    publishToMedium: vi.fn(),
    publishToWordPress: vi.fn(),
    publishToPlatform: vi.fn(),
    updateOnDevto: vi.fn(),
    updateOnHashnode: vi.fn(),
    updateOnWordPress: vi.fn(),
    updateOnPlatform: vi.fn(),
    listArticles: vi.fn(),
    listDevtoArticles: vi.fn(),
    listHashnodeArticles: vi.fn(),
    listWordPressArticles: vi.fn(),
    getDevtoArticle: vi.fn(),
    getDevtoAnalytics: vi.fn(),
    getAnalytics: vi.fn(),
    getMediumUser: vi.fn(),
    fetchArticleContent: vi.fn(),
    ...overrides,
  } as unknown as BlogPublisherService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlogPublisherChannelAdapter', () => {
  let adapter: BlogPublisherChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new BlogPublisherChannelAdapter(mockService);
  });

  // ========================================================================
  // Platform & Capabilities
  // ========================================================================

  describe('platform and capabilities', () => {
    it('should have platform set to devto (primary)', () => {
      expect(adapter.platform).toBe('devto');
    });

    it('should have display name Blog Publisher', () => {
      expect(adapter.displayName).toBe('Blog Publisher');
    });

    it('should expose the correct capabilities', () => {
      expect(adapter.capabilities).toEqual(['text', 'rich_text', 'hashtags', 'scheduling']);
    });

    it('should have capabilities as readonly array', () => {
      expect(Array.isArray(adapter.capabilities)).toBe(true);
      expect(adapter.capabilities.length).toBe(4);
    });
  });

  // ========================================================================
  // Lifecycle — initialize
  // ========================================================================

  describe('initialize', () => {
    it('should set connected state when platforms are configured', async () => {
      await adapter.initialize({ platform: 'devto', credential: 'multi' });

      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
    });

    it('should verify that at least one platform is configured', async () => {
      expect(mockService.getConfiguredPlatforms).toBeDefined();
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      expect(mockService.getConfiguredPlatforms).toHaveBeenCalled();
    });

    it('should throw if no platforms are configured', async () => {
      const emptyService = createMockService({
        getConfiguredPlatforms: vi.fn().mockReturnValue([]),
      });
      const emptyAdapter = new BlogPublisherChannelAdapter(emptyService);

      await expect(
        emptyAdapter.initialize({ platform: 'devto', credential: 'none' }),
      ).rejects.toThrow('No platforms configured');
    });

    it('should record connectedSince as an ISO timestamp', async () => {
      const before = new Date().toISOString();
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      const info = adapter.getConnectionInfo();
      const after = new Date().toISOString();

      expect(info.connectedSince).toBeDefined();
      expect(info.connectedSince! >= before).toBe(true);
      expect(info.connectedSince! <= after).toBe(true);
    });
  });

  // ========================================================================
  // Lifecycle — shutdown
  // ========================================================================

  describe('shutdown', () => {
    it('should set status to disconnected', async () => {
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      expect(adapter.getConnectionInfo().status).toBe('connected');

      await adapter.shutdown();
      expect(adapter.getConnectionInfo().status).toBe('disconnected');
    });

    it('should clear connectedSince', async () => {
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      await adapter.shutdown();

      const info = adapter.getConnectionInfo();
      expect(info.connectedSince).toBeUndefined();
    });

    it('should be safe to call when already disconnected', async () => {
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
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
    });

    it('should include configuredPlatforms in platformInfo', async () => {
      await adapter.initialize({ platform: 'devto', credential: 'test' });
      const info = adapter.getConnectionInfo();
      expect(info.platformInfo).toBeDefined();
      expect(info.platformInfo!.configuredPlatforms).toEqual(['devto', 'hashnode']);
    });
  });

  // ========================================================================
  // sendMessage
  // ========================================================================

  describe('sendMessage', () => {
    it('should publish article body from text block', async () => {
      const result = await adapter.sendMessage('all', {
        blocks: [{ type: 'text', text: '# Article body here' }],
        platformOptions: { title: 'My Article', tags: ['ts'] },
      });

      expect(mockService.publishToAll).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Article',
          body: '# Article body here',
          tags: ['ts'],
        }),
        undefined, // 'all' => no specific platforms
      );
      expect(result.messageId).toBe('art-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should target specific platforms when conversationId is not all', async () => {
      await adapter.sendMessage('devto,hashnode', {
        blocks: [{ type: 'text', text: 'body' }],
      });

      const call = (mockService.publishToAll as any).mock.calls[0];
      expect(call[1]).toEqual(['devto', 'hashnode']);
    });

    it('should target a single platform from conversationId', async () => {
      await adapter.sendMessage('medium', {
        blocks: [{ type: 'text', text: 'body' }],
      });

      const call = (mockService.publishToAll as any).mock.calls[0];
      expect(call[1]).toEqual(['medium']);
    });

    it('should use "Untitled" when no title is in platformOptions', async () => {
      await adapter.sendMessage('devto', {
        blocks: [{ type: 'text', text: 'body' }],
      });

      const article = (mockService.publishToAll as any).mock.calls[0][0];
      expect(article.title).toBe('Untitled');
    });

    it('should throw when no text block is present', async () => {
      await expect(
        adapter.sendMessage('devto', { blocks: [{ type: 'image', url: '/img.png' }] }),
      ).rejects.toThrow('requires at least one text content block');
    });

    it('should return "none" messageId when all platforms fail', async () => {
      const failingService = createMockService({
        publishToAll: vi.fn().mockResolvedValue([
          { platform: 'devto', error: 'API down' },
        ]),
      });
      const failingAdapter = new BlogPublisherChannelAdapter(failingService);

      const result = await failingAdapter.sendMessage('devto', {
        blocks: [{ type: 'text', text: 'body' }],
      });
      expect(result.messageId).toBe('none');
    });

    it('should pass through optional platformOptions fields', async () => {
      await adapter.sendMessage('devto', {
        blocks: [{ type: 'text', text: 'body' }],
        platformOptions: {
          title: 'Title',
          published: true,
          coverImage: 'https://img.com/cover.jpg',
          canonicalUrl: 'https://mysite.com/post',
          series: 'My Series',
        },
      });

      const article = (mockService.publishToAll as any).mock.calls[0][0];
      expect(article.published).toBe(true);
      expect(article.coverImage).toBe('https://img.com/cover.jpg');
      expect(article.canonicalUrl).toBe('https://mysite.com/post');
      expect(article.series).toBe('My Series');
    });
  });

  // ========================================================================
  // sendTypingIndicator
  // ========================================================================

  describe('sendTypingIndicator', () => {
    it('should be a no-op (blog platforms have no typing indicators)', async () => {
      await adapter.sendTypingIndicator('devto', true);
      await adapter.sendTypingIndicator('devto', false);
      // No throw and no side effects
    });
  });

  // ========================================================================
  // on (event handler)
  // ========================================================================

  describe('on', () => {
    it('should return a no-op unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);

      expect(typeof unsub).toBe('function');
      unsub(); // should not throw
    });

    it('should accept eventTypes filter without error', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });
});
