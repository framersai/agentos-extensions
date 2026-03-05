/**
 * Unit tests for GoogleBusinessChannelAdapter (IChannelAdapter implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAxios } = vi.hoisted(() => {
  const mockAxios: Record<string, any> = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
    create: vi.fn(),
    defaults: { headers: { common: {} } },
  };
  mockAxios.create.mockReturnValue(mockAxios);
  return { mockAxios };
});
vi.mock('axios', () => ({ default: mockAxios }));

import { GoogleBusinessChannelAdapter } from '../src/GoogleBusinessChannelAdapter';
import type { GoogleBusinessService, LocalPostResult } from '../src/GoogleBusinessService';

// ---------------------------------------------------------------------------
// Mock Service Factory
// ---------------------------------------------------------------------------

function createMockService(overrides: Partial<Record<string, any>> = {}): GoogleBusinessService {
  return {
    isRunning: false,
    initialize: vi.fn().mockImplementation(async function (this: any) {
      this.isRunning = true;
    }),
    shutdown: vi.fn().mockImplementation(async function (this: any) {
      this.isRunning = false;
    }),
    getLocations: vi.fn().mockResolvedValue([]),
    createLocalPost: vi.fn().mockResolvedValue({
      name: 'locations/123/localPosts/post-1',
      summary: 'Test post',
      topicType: 'STANDARD',
      state: 'LIVE',
      createTime: '2024-01-15T10:00:00Z',
    } satisfies LocalPostResult),
    deleteLocalPost: vi.fn().mockResolvedValue(undefined),
    getReviews: vi.fn().mockResolvedValue([]),
    replyToReview: vi.fn().mockResolvedValue(undefined),
    getInsights: vi.fn().mockResolvedValue({ locationName: '', metrics: [] }),
    updateBusinessInfo: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as GoogleBusinessService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoogleBusinessChannelAdapter', () => {
  let adapter: GoogleBusinessChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockService = createMockService();
    adapter = new GoogleBusinessChannelAdapter(mockService);
  });

  // ========================================================================
  // Platform & Capabilities
  // ========================================================================

  describe('platform and capabilities', () => {
    it('should have platform set to google-business', () => {
      expect(adapter.platform).toBe('google-business');
    });

    it('should have display name Google Business Profile', () => {
      expect(adapter.displayName).toBe('Google Business Profile');
    });

    it('should expose the correct capabilities', () => {
      expect(adapter.capabilities).toEqual([
        'text', 'images', 'reviews', 'analytics',
        'business_info', 'local_posts',
      ]);
    });

    it('should have 6 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(6);
    });
  });

  // ========================================================================
  // Lifecycle — initialize
  // ========================================================================

  describe('initialize', () => {
    it('should call service.initialize and set connection to connected', async () => {
      await adapter.initialize({ platform: 'google-business', credential: 'token' });

      expect(mockService.initialize).toHaveBeenCalled();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.connectedSince).toBeDefined();
    });

    it('should store locationName from auth params', async () => {
      await adapter.initialize({
        platform: 'google-business',
        credential: 'token',
        params: { locationName: 'locations/123' },
      });

      const info = adapter.getConnectionInfo();
      expect(info.platformInfo).toEqual({
        platform: 'google-business',
        locationName: 'locations/123',
      });
    });

    it('should set locationName to null when not provided in params', async () => {
      await adapter.initialize({ platform: 'google-business', credential: 'token' });

      const info = adapter.getConnectionInfo();
      expect(info.platformInfo!.locationName).toBeNull();
    });

    it('should record connectedSince as a valid ISO timestamp', async () => {
      const before = new Date().toISOString();
      await adapter.initialize({ platform: 'google-business', credential: 'token' });
      const after = new Date().toISOString();

      const info = adapter.getConnectionInfo();
      expect(info.connectedSince! >= before).toBe(true);
      expect(info.connectedSince! <= after).toBe(true);
    });

    it('should set error status and re-throw when service.initialize fails', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('No access token')),
      });
      const failAdapter = new GoogleBusinessChannelAdapter(failService);

      await expect(
        failAdapter.initialize({ platform: 'google-business', credential: 'test' }),
      ).rejects.toThrow('No access token');

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('No access token');
    });
  });

  // ========================================================================
  // Lifecycle — shutdown
  // ========================================================================

  describe('shutdown', () => {
    it('should call service.shutdown and clear connectedAt', async () => {
      await adapter.initialize({ platform: 'google-business', credential: 'token' });
      await adapter.shutdown();

      expect(mockService.shutdown).toHaveBeenCalled();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
      expect(info.connectedSince).toBeUndefined();
    });

    it('should be safe to call when not initialized', async () => {
      await adapter.shutdown();
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
      await adapter.initialize({ platform: 'google-business', credential: 'token' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
    });

    it('should include platform and locationName in platformInfo', async () => {
      await adapter.initialize({
        platform: 'google-business',
        credential: 'token',
        params: { locationName: 'locations/xyz' },
      });
      const info = adapter.getConnectionInfo();
      expect(info.platformInfo).toEqual({
        platform: 'google-business',
        locationName: 'locations/xyz',
      });
    });

    it('should return error when initialization failed', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('Auth error')),
      });
      const failAdapter = new GoogleBusinessChannelAdapter(failService);

      try {
        await failAdapter.initialize({ platform: 'google-business', credential: 'test' });
      } catch {}

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      expect(info.errorMessage).toBe('Auth error');
    });
  });

  // ========================================================================
  // sendMessage
  // ========================================================================

  describe('sendMessage', () => {
    it('should create a local post from text block', async () => {
      await adapter.initialize({
        platform: 'google-business',
        credential: 'token',
        params: { locationName: 'locations/123' },
      });

      const result = await adapter.sendMessage('locations/123', {
        blocks: [{ type: 'text', text: 'Check out our new products!' }],
      });

      expect(mockService.createLocalPost).toHaveBeenCalledWith('locations/123', {
        summary: 'Check out our new products!',
        media: undefined,
      });
      expect(result.messageId).toBe('locations/123/localPosts/post-1');
      expect(result.timestamp).toBeDefined();
    });

    it('should reply to a review when replyToMessageId is set', async () => {
      const result = await adapter.sendMessage('locations/123', {
        blocks: [{ type: 'text', text: 'Thank you for the review!' }],
        replyToMessageId: 'reviews/r-1',
      });

      expect(mockService.replyToReview).toHaveBeenCalledWith('reviews/r-1', 'Thank you for the review!');
      expect(result.messageId).toBe('reviews/r-1');
    });

    it('should use locationName from platformOptions over adapter default', async () => {
      await adapter.initialize({
        platform: 'google-business',
        credential: 'token',
        params: { locationName: 'locations/default' },
      });

      await adapter.sendMessage('locations/default', {
        blocks: [{ type: 'text', text: 'Post content' }],
        platformOptions: { locationName: 'locations/override' },
      });

      expect(mockService.createLocalPost).toHaveBeenCalledWith(
        'locations/override',
        expect.any(Object),
      );
    });

    it('should fall back to conversationId for location when no other source', async () => {
      await adapter.sendMessage('locations/fallback', {
        blocks: [{ type: 'text', text: 'Fallback post' }],
      });

      expect(mockService.createLocalPost).toHaveBeenCalledWith(
        'locations/fallback',
        expect.any(Object),
      );
    });

    it('should include media when an image block is present', async () => {
      await adapter.sendMessage('locations/123', {
        blocks: [
          { type: 'text', text: 'New photo!' },
          { type: 'image', url: 'https://img.com/photo.jpg' },
        ],
      });

      expect(mockService.createLocalPost).toHaveBeenCalledWith('locations/123', {
        summary: 'New photo!',
        media: { mediaFormat: 'PHOTO', sourceUrl: 'https://img.com/photo.jpg' },
      });
    });

    it('should not include media when no image block is present', async () => {
      await adapter.sendMessage('locations/123', {
        blocks: [{ type: 'text', text: 'Text only' }],
      });

      const call = (mockService.createLocalPost as any).mock.calls[0];
      expect(call[1].media).toBeUndefined();
    });

    it('should handle empty blocks gracefully', async () => {
      await adapter.sendMessage('locations/123', {
        blocks: [],
      });

      expect(mockService.createLocalPost).toHaveBeenCalledWith('locations/123', {
        summary: '',
        media: undefined,
      });
    });
  });

  // ========================================================================
  // sendTypingIndicator
  // ========================================================================

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Google Business has no typing indicators)', async () => {
      await adapter.sendTypingIndicator('locations/123', true);
      await adapter.sendTypingIndicator('locations/123', false);
      // No throw = success
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
      // Should not throw
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
      const unsub = adapter.on(handler, ['review', 'post']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ========================================================================
  // addReaction
  // ========================================================================

  describe('addReaction', () => {
    it('should be a no-op (Google Business does not support reactions)', async () => {
      await adapter.addReaction('locations/123', 'post-1', '👍');
      // No throw and no service calls expected for reactions
    });
  });
});
