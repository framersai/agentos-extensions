/**
 * @fileoverview Tests for InstagramChannelAdapter — the IChannelAdapter implementation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InstagramChannelAdapter } from '../src/InstagramChannelAdapter.js';
import type { InstagramService } from '../src/InstagramService.js';

// ---------------------------------------------------------------------------
// Mock service factory
// ---------------------------------------------------------------------------

function createMockService(overrides: Partial<InstagramService> = {}): InstagramService {
  return {
    isRunning: false,
    initialize: vi.fn(async function (this: any) {
      this.isRunning = true;
    }),
    shutdown: vi.fn(async function (this: any) {
      this.isRunning = false;
    }),
    postPhoto: vi.fn().mockResolvedValue({ id: 'photo-123' }),
    postCarousel: vi.fn().mockResolvedValue({ id: 'carousel-456' }),
    postReel: vi.fn().mockResolvedValue({ id: 'reel-789' }),
    postStory: vi.fn().mockResolvedValue({ id: 'story-101' }),
    likeMedia: vi.fn().mockResolvedValue(undefined),
    commentOnMedia: vi.fn().mockResolvedValue({ id: 'comment-202' }),
    searchHashtag: vi.fn().mockResolvedValue({ id: 'h1', name: 'test', mediaCount: 0 }),
    getHashtagTopMedia: vi.fn().mockResolvedValue([]),
    getMediaInsights: vi.fn().mockResolvedValue({ id: 'm1', likes: 10, comments: 2, reach: 100, impressions: 200, saved: 5, shares: 3 }),
    getAccountInsights: vi.fn().mockResolvedValue({ followers: 1000, mediaCount: 50, followsCount: 300 }),
    getRecentMedia: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as InstagramService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InstagramChannelAdapter', () => {
  let service: InstagramService;
  let adapter: InstagramChannelAdapter;

  beforeEach(() => {
    service = createMockService();
    adapter = new InstagramChannelAdapter(service);
  });

  // ── Static properties ──

  it('should have platform set to "instagram"', () => {
    expect(adapter.platform).toBe('instagram');
  });

  it('should have displayName set to "Instagram"', () => {
    expect(adapter.displayName).toBe('Instagram');
  });

  it('should expose the full capabilities array', () => {
    expect(adapter.capabilities).toEqual([
      'text', 'images', 'video', 'stories', 'reels', 'carousel',
      'reactions', 'hashtags', 'dm_automation', 'engagement_metrics', 'content_discovery',
    ]);
  });

  it('should have 11 capabilities', () => {
    expect(adapter.capabilities).toHaveLength(11);
  });

  // ── initialize / shutdown lifecycle ──

  describe('initialize()', () => {
    it('should call service.initialize()', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      expect(service.initialize).toHaveBeenCalledOnce();
    });

    it('should set connection info to connected after init', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
    });

    it('should include connectedSince in connected info', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      if (info.status === 'connected') {
        expect(info.connectedSince).toBeDefined();
        // Should be a valid ISO string
        expect(new Date(info.connectedSince!).toISOString()).toBe(info.connectedSince);
      }
    });

    it('should include platformInfo in connected info', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      const info = adapter.getConnectionInfo();
      if (info.status === 'connected') {
        expect(info.platformInfo).toEqual({ platform: 'instagram' });
      }
    });

    it('should set status to error if service.initialize throws', async () => {
      const failService = createMockService({
        initialize: vi.fn().mockRejectedValue(new Error('auth failed')),
      });
      const failAdapter = new InstagramChannelAdapter(failService);

      await expect(failAdapter.initialize({ platform: 'instagram', credential: 'bad' })).rejects.toThrow('auth failed');

      const info = failAdapter.getConnectionInfo();
      expect(info.status).toBe('error');
      if (info.status === 'error') {
        expect(info.errorMessage).toBe('auth failed');
      }
    });
  });

  describe('shutdown()', () => {
    it('should call service.shutdown()', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      await adapter.shutdown();
      expect(service.shutdown).toHaveBeenCalledOnce();
    });

    it('should set connection info to disconnected after shutdown', async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
      await adapter.shutdown();
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });
  });

  // ── getConnectionInfo ──

  describe('getConnectionInfo()', () => {
    it('should report disconnected before initialization', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });
  });

  // ── sendMessage ──

  describe('sendMessage()', () => {
    beforeEach(async () => {
      await adapter.initialize({ platform: 'instagram', credential: 'tok' });
    });

    it('should post a single image via postPhoto', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'image', url: 'https://example.com/img.jpg' },
          { type: 'text', text: 'Hello world' },
        ],
      });

      expect(service.postPhoto).toHaveBeenCalledWith('https://example.com/img.jpg', 'Hello world');
      expect(result.messageId).toBe('photo-123');
      expect(result.timestamp).toBeDefined();
    });

    it('should post multiple images as a carousel', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'image', url: 'https://example.com/1.jpg', caption: 'A' },
          { type: 'image', url: 'https://example.com/2.jpg', caption: 'B' },
          { type: 'text', text: 'Carousel caption' },
        ],
      });

      expect(service.postCarousel).toHaveBeenCalledWith(
        [
          { imageUrl: 'https://example.com/1.jpg', caption: 'A' },
          { imageUrl: 'https://example.com/2.jpg', caption: 'B' },
        ],
        'Carousel caption',
      );
      expect(result.messageId).toBe('carousel-456');
    });

    it('should post a reel block', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'reel', videoUrl: 'https://example.com/vid.mp4', caption: 'My reel' },
        ],
      });

      expect(service.postReel).toHaveBeenCalledWith('https://example.com/vid.mp4', 'My reel');
      expect(result.messageId).toBe('reel-789');
    });

    it('should use text block caption as fallback for reel caption', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'reel', videoUrl: 'https://example.com/vid.mp4' },
          { type: 'text', text: 'Fallback caption' },
        ],
      });

      expect(service.postReel).toHaveBeenCalledWith('https://example.com/vid.mp4', 'Fallback caption');
    });

    it('should post a story block', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'story', mediaUrl: 'https://example.com/story.jpg' },
        ],
      });

      expect(service.postStory).toHaveBeenCalledWith('https://example.com/story.jpg');
      expect(result.messageId).toBe('story-101');
    });

    it('should post a carousel block with items', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          {
            type: 'carousel',
            items: [
              { url: 'https://example.com/c1.jpg', caption: 'Slide 1' },
              { url: 'https://example.com/c2.jpg', caption: 'Slide 2' },
            ],
          },
          { type: 'text', text: 'Carousel text' },
        ],
      });

      expect(service.postCarousel).toHaveBeenCalledWith(
        [
          { imageUrl: 'https://example.com/c1.jpg', caption: 'Slide 1' },
          { imageUrl: 'https://example.com/c2.jpg', caption: 'Slide 2' },
        ],
        'Carousel text',
      );
      expect(result.messageId).toBe('carousel-456');
    });

    it('should post a video block as a reel', async () => {
      const result = await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'video', url: 'https://example.com/video.mp4' },
          { type: 'text', text: 'Video caption' },
        ],
      });

      expect(service.postReel).toHaveBeenCalledWith('https://example.com/video.mp4', 'Video caption');
      expect(result.messageId).toBe('reel-789');
    });

    it('should throw when no image, video, reel, or story blocks provided', async () => {
      await expect(
        adapter.sendMessage('conv-1', {
          blocks: [{ type: 'text', text: 'Just text' }],
        }),
      ).rejects.toThrow('Instagram requires at least one image, video, reel, or story block');
    });

    it('should throw for empty blocks array', async () => {
      await expect(
        adapter.sendMessage('conv-1', { blocks: [] }),
      ).rejects.toThrow('Instagram requires at least one image, video, reel, or story block');
    });

    it('should use empty string as caption when no text block', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [{ type: 'image', url: 'https://example.com/img.jpg' }],
      });

      expect(service.postPhoto).toHaveBeenCalledWith('https://example.com/img.jpg', '');
    });

    it('should prioritize reel over image blocks', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'reel', videoUrl: 'https://example.com/vid.mp4', caption: 'Reel' },
          { type: 'image', url: 'https://example.com/img.jpg' },
        ],
      });

      expect(service.postReel).toHaveBeenCalled();
      expect(service.postPhoto).not.toHaveBeenCalled();
    });

    it('should prioritize story over image blocks', async () => {
      await adapter.sendMessage('conv-1', {
        blocks: [
          { type: 'story', mediaUrl: 'https://example.com/story.jpg' },
          { type: 'image', url: 'https://example.com/img.jpg' },
        ],
      });

      expect(service.postStory).toHaveBeenCalled();
      expect(service.postPhoto).not.toHaveBeenCalled();
    });
  });

  // ── sendTypingIndicator ──

  describe('sendTypingIndicator()', () => {
    it('should be a no-op and resolve without error', async () => {
      await expect(adapter.sendTypingIndicator('conv-1', true)).resolves.toBeUndefined();
    });

    it('should be a no-op for false as well', async () => {
      await expect(adapter.sendTypingIndicator('conv-1', false)).resolves.toBeUndefined();
    });
  });

  // ── on() ──

  describe('on()', () => {
    it('should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('calling unsubscribe should remove the handler', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // No error, handler removed cleanly
    });

    it('should accept optional eventTypes parameter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message', 'reaction']);
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });

  // ── addReaction ──

  describe('addReaction()', () => {
    it('should delegate to service.likeMedia with the messageId', async () => {
      await adapter.addReaction('conv-1', 'media-999', '❤️');
      expect(service.likeMedia).toHaveBeenCalledWith('media-999');
    });
  });
});
