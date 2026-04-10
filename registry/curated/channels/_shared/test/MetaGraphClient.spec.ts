// @ts-nocheck
/**
 * @fileoverview Unit tests for MetaGraphClient.
 *
 * Tests cover: constructor configuration, GET/POST/DELETE requests, error handling
 * (401 token errors, 429 rate limits, Meta error codes 190/4/17), media upload
 * (container creation + polling), page listing, post insights, rate limiting
 * (200 calls/hour window), and accessor properties.
 *
 * Axios is mocked via vi.mock so no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MetaGraphClient,
  MetaTokenExpiredError,
  MetaRateLimitError,
  type MetaGraphConfig,
} from '../MetaGraphClient.js';

/* ------------------------------------------------------------------ */
/*  Axios mock                                                         */
/* ------------------------------------------------------------------ */

const { mockInstance, mockCreate } = vi.hoisted(() => {
  const mockInstance = {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  };
  const mockCreate = vi.fn(() => mockInstance);
  return { mockInstance, mockCreate };
});

vi.mock('axios', () => ({
  default: { create: mockCreate },
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function createClient(overrides?: Partial<MetaGraphConfig>): MetaGraphClient {
  return new MetaGraphClient({
    accessToken: 'test-token-123',
    apiVersion: 'v19.0',
    pageId: 'page-001',
    igUserId: 'ig-001',
    threadsUserId: 'threads-001',
    ...overrides,
  });
}

function createAxiosError(
  status: number,
  data?: any,
  headers?: Record<string, string>,
) {
  const error: any = new Error(`Request failed with status ${status}`);
  error.response = { status, data, headers: headers ?? {} };
  error.isAxiosError = true;
  return error;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('MetaGraphClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReturnValue(mockInstance);
  });

  /* ── Constructor / Configuration ──────────────────────────────── */

  describe('constructor', () => {
    it('should create an axios instance with the correct baseURL and auth header', () => {
      createClient();

      expect(mockCreate).toHaveBeenCalledWith({
        baseURL: 'https://graph.facebook.com/v19.0',
        headers: { Authorization: 'Bearer test-token-123' },
        timeout: 30_000,
      });
    });

    it('should default API version to v19.0 when not specified', () => {
      createClient({ apiVersion: undefined });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://graph.facebook.com/v19.0',
        }),
      );
    });

    it('should use a custom API version when provided', () => {
      createClient({ apiVersion: 'v20.0' });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://graph.facebook.com/v20.0',
        }),
      );
    });
  });

  /* ── Accessors ────────────────────────────────────────────────── */

  describe('accessors', () => {
    it('should expose pageId, igUserId, threadsUserId, and accessToken', () => {
      const client = createClient();
      expect(client.pageId).toBe('page-001');
      expect(client.igUserId).toBe('ig-001');
      expect(client.threadsUserId).toBe('threads-001');
      expect(client.accessToken).toBe('test-token-123');
    });

    it('should return undefined for optional IDs when not provided', () => {
      const client = createClient({ pageId: undefined, igUserId: undefined, threadsUserId: undefined });
      expect(client.pageId).toBeUndefined();
      expect(client.igUserId).toBeUndefined();
      expect(client.threadsUserId).toBeUndefined();
    });
  });

  /* ── GET requests ─────────────────────────────────────────────── */

  describe('get()', () => {
    it('should send a GET request and return response data', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { id: '123', name: 'Test Page' } });

      const result = await client.get('/me', { fields: 'id,name' });

      expect(mockInstance.get).toHaveBeenCalledWith('/me', { params: { fields: 'id,name' } });
      expect(result).toEqual({ id: '123', name: 'Test Page' });
    });

    it('should work without params', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { ok: true } });

      const result = await client.get('/me');

      expect(mockInstance.get).toHaveBeenCalledWith('/me', { params: undefined });
      expect(result).toEqual({ ok: true });
    });
  });

  /* ── POST requests ────────────────────────────────────────────── */

  describe('post()', () => {
    it('should send a POST request and return response data', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'post-123' } });

      const result = await client.post('/page-001/feed', null, { message: 'Hello' });

      expect(mockInstance.post).toHaveBeenCalledWith('/page-001/feed', null, { params: { message: 'Hello' } });
      expect(result).toEqual({ id: 'post-123' });
    });
  });

  /* ── DELETE requests ──────────────────────────────────────────── */

  describe('delete()', () => {
    it('should send a DELETE request', async () => {
      const client = createClient();
      mockInstance.delete.mockResolvedValue({ data: { success: true } });

      await client.delete('/post-123/likes');

      expect(mockInstance.delete).toHaveBeenCalledWith('/post-123/likes');
    });
  });

  /* ── Token errors (401 / code 190) ────────────────────────────── */

  describe('token error handling', () => {
    it('should throw MetaTokenExpiredError on 401 status', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(401, {
        error: { message: 'Invalid OAuth access token', code: 190 },
      });
      mockInstance.get.mockRejectedValue(axiosErr);

      await expect(client.get('/me')).rejects.toThrow(MetaTokenExpiredError);
    });

    it('should throw MetaTokenExpiredError on error code 190 regardless of HTTP status', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(400, {
        error: { message: 'Token has expired', code: 190 },
      });
      mockInstance.get.mockRejectedValue(axiosErr);

      await expect(client.get('/me')).rejects.toThrow(MetaTokenExpiredError);
    });

    it('should include Meta error message in the thrown error', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(401, {
        error: { message: 'Session has expired at unix time 1234567890', code: 190 },
      });
      mockInstance.get.mockRejectedValue(axiosErr);

      await expect(client.get('/me')).rejects.toThrow('Session has expired');
    });
  });

  /* ── Rate limit errors (429 / code 4/17) ──────────────────────── */

  describe('rate limit error handling', () => {
    it('should throw MetaRateLimitError on 429 status', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(
        429,
        { error: { message: 'Rate limit reached', code: 4 } },
        { 'retry-after': '120' },
      );
      mockInstance.get.mockRejectedValue(axiosErr);

      try {
        await client.get('/me');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MetaRateLimitError);
        expect((err as MetaRateLimitError).retryAfter).toBe(120);
      }
    });

    it('should throw MetaRateLimitError on error code 4 (app-level)', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(400, {
        error: { message: 'Application request limit reached', code: 4 },
      });
      mockInstance.get.mockRejectedValue(axiosErr);

      await expect(client.get('/me')).rejects.toThrow(MetaRateLimitError);
    });

    it('should throw MetaRateLimitError on error code 17 (user-level)', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(400, {
        error: { message: 'User request limit reached', code: 17 },
      });
      mockInstance.post.mockRejectedValue(axiosErr);

      await expect(client.post('/me/feed', null, { message: 'test' })).rejects.toThrow(MetaRateLimitError);
    });

    it('should default retry-after to 60 when header is missing', async () => {
      const client = createClient();
      const axiosErr = createAxiosError(429, {
        error: { message: 'Too many requests', code: 4 },
      });
      mockInstance.get.mockRejectedValue(axiosErr);

      try {
        await client.get('/me');
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as MetaRateLimitError).retryAfter).toBe(60);
      }
    });
  });

  /* ── Client-side rate limiting (200/hour) ─────────────────────── */

  describe('client-side rate limiting', () => {
    it('should throw MetaRateLimitError after 200 requests within an hour', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { ok: true } });

      // Access the internal requestCount via direct manipulation
      // to avoid making 200 real async calls with setTimeout delays
      (client as any).requestCount = 200;

      await expect(client.get('/me')).rejects.toThrow(MetaRateLimitError);
    });

    it('should reset the counter after the 1-hour window elapses', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { ok: true } });

      // Simulate exhausted window
      (client as any).requestCount = 200;
      // Set window start to over 1 hour ago
      (client as any).windowStart = Date.now() - 3_600_001;

      // Should succeed because window has elapsed
      const result = await client.get('/me');
      expect(result).toEqual({ ok: true });
    });

    it('should include retryAfter in the MetaRateLimitError when client-side limit is hit', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { ok: true } });

      (client as any).requestCount = 200;

      try {
        await client.get('/me');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(MetaRateLimitError);
        expect((err as MetaRateLimitError).retryAfter).toBeGreaterThan(0);
        expect((err as MetaRateLimitError).retryAfter).toBeLessThanOrEqual(3600);
      }
    });
  });

  /* ── Media upload (container + polling) ───────────────────────── */

  describe('uploadMedia (container + polling pattern)', () => {
    it('should create a media container and return its ID', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'container-789' } });

      const containerId = await client.createMediaContainer('ig-001', {
        image_url: 'https://example.com/photo.jpg',
        caption: 'Test caption',
      });

      expect(containerId).toBe('container-789');
      expect(mockInstance.post).toHaveBeenCalledWith(
        '/ig-001/media',
        null,
        { params: { image_url: 'https://example.com/photo.jpg', caption: 'Test caption' } },
      );
    });

    it('should poll until media status is FINISHED', async () => {
      const client = createClient();
      mockInstance.get
        .mockResolvedValueOnce({ data: { id: 'c-1', status: 'IN_PROGRESS' } })
        .mockResolvedValueOnce({ data: { id: 'c-1', status: 'IN_PROGRESS' } })
        .mockResolvedValueOnce({ data: { id: 'c-1', status: 'FINISHED' } });

      const container = await client.waitForMediaReady('c-1', 30_000);

      expect(container.status).toBe('FINISHED');
      expect(container.id).toBe('c-1');
    }, 30_000);

    it('should throw when media container enters ERROR state', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({
        data: { id: 'c-1', status: 'ERROR', status_code: 'INVALID_FORMAT' },
      });

      await expect(client.waitForMediaReady('c-1')).rejects.toThrow('failed: ERROR');
    });

    it('should throw when media container enters EXPIRED state', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({
        data: { id: 'c-1', status: 'EXPIRED' },
      });

      await expect(client.waitForMediaReady('c-1')).rejects.toThrow('failed: EXPIRED');
    });

    it('should publish a media container', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'post-456' } });

      const result = await client.publishMediaContainer('ig-001', 'container-789');

      expect(result).toEqual({ id: 'post-456' });
      expect(mockInstance.post).toHaveBeenCalledWith(
        '/ig-001/media_publish',
        null,
        { params: { creation_id: 'container-789' } },
      );
    });
  });

  /* ── Facebook page posts ──────────────────────────────────────── */

  describe('postToPage()', () => {
    it('should post a text message to the page feed', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'post-001' } });

      const result = await client.postToPage('page-001', { message: 'Hello Facebook!' });

      expect(result).toEqual({ id: 'post-001' });
      expect(mockInstance.post).toHaveBeenCalledWith(
        '/page-001/feed',
        null,
        { params: expect.objectContaining({ message: 'Hello Facebook!', published: true }) },
      );
    });

    it('should post a photo to the photos endpoint', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'photo-001' } });

      await client.postToPage('page-001', {
        message: 'Photo caption',
        photoUrl: 'https://example.com/pic.jpg',
      });

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/page-001/photos',
        null,
        { params: expect.objectContaining({ url: 'https://example.com/pic.jpg' }) },
      );
    });

    it('should post a video to the videos endpoint', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'video-001' } });

      await client.postToPage('page-001', {
        message: 'Video description',
        videoUrl: 'https://example.com/clip.mp4',
      });

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/page-001/videos',
        null,
        { params: expect.objectContaining({ file_url: 'https://example.com/clip.mp4' }) },
      );
    });

    it('should support scheduled publishing', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'sched-001' } });

      await client.postToPage('page-001', {
        message: 'Scheduled post',
        published: false,
        scheduled_publish_time: 1750000000,
      });

      expect(mockInstance.post).toHaveBeenCalledWith(
        '/page-001/feed',
        null,
        { params: expect.objectContaining({ published: false, scheduled_publish_time: 1750000000 }) },
      );
    });
  });

  /* ── Pages listing ────────────────────────────────────────────── */

  describe('getPages()', () => {
    it('should return a list of pages with id, name, and accessToken', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({
        data: {
          data: [
            { id: 'p1', name: 'Page One', access_token: 'tok1' },
            { id: 'p2', name: 'Page Two', access_token: 'tok2' },
          ],
        },
      });

      const pages = await client.getPages();

      expect(pages).toHaveLength(2);
      expect(pages[0]).toEqual({ id: 'p1', name: 'Page One', accessToken: 'tok1' });
      expect(pages[1]).toEqual({ id: 'p2', name: 'Page Two', accessToken: 'tok2' });
    });

    it('should return empty array when no pages exist', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { data: [] } });

      const pages = await client.getPages();
      expect(pages).toEqual([]);
    });

    it('should handle missing data field gracefully', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: {} });

      const pages = await client.getPages();
      expect(pages).toEqual([]);
    });
  });

  /* ── Comments ─────────────────────────────────────────────────── */

  describe('postComment()', () => {
    it('should post a comment on a post', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { id: 'comment-001' } });

      const result = await client.postComment('post-123', 'Great post!');

      expect(result).toEqual({ id: 'comment-001' });
      expect(mockInstance.post).toHaveBeenCalledWith(
        '/post-123/comments',
        null,
        { params: { message: 'Great post!' } },
      );
    });
  });

  /* ── Likes ────────────────────────────────────────────────────── */

  describe('likePost() / unlikePost()', () => {
    it('should like a post', async () => {
      const client = createClient();
      mockInstance.post.mockResolvedValue({ data: { success: true } });

      await client.likePost('post-123');

      expect(mockInstance.post).toHaveBeenCalledWith('/post-123/likes', undefined, { params: undefined });
    });

    it('should unlike a post via DELETE', async () => {
      const client = createClient();
      mockInstance.delete.mockResolvedValue({ data: { success: true } });

      await client.unlikePost('post-123');

      expect(mockInstance.delete).toHaveBeenCalledWith('/post-123/likes');
    });
  });

  /* ── Insights ─────────────────────────────────────────────────── */

  describe('getPostInsights()', () => {
    it('should fetch and flatten post insights', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({
        data: {
          data: [
            { name: 'impressions', values: [{ value: 5000 }] },
            { name: 'reach', values: [{ value: 3000 }] },
            { name: 'engagement', values: [{ value: 150 }] },
          ],
        },
      });

      const insights = await client.getPostInsights('post-123', ['impressions', 'reach', 'engagement']);

      expect(insights.impressions).toBe(5000);
      expect(insights.reach).toBe(3000);
      expect(insights.engagement).toBe(150);
    });

    it('should default to 0 when values are missing', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({
        data: {
          data: [
            { name: 'impressions', values: [] },
            { name: 'reach' },
          ],
        },
      });

      const insights = await client.getPostInsights('post-123', ['impressions', 'reach']);

      expect(insights.impressions).toBe(0);
      expect(insights.reach).toBe(0);
    });

    it('should handle empty data array', async () => {
      const client = createClient();
      mockInstance.get.mockResolvedValue({ data: { data: [] } });

      const insights = await client.getPostInsights('post-123', ['impressions']);
      expect(insights).toEqual({});
    });
  });

  /* ── Error class properties ───────────────────────────────────── */

  describe('custom error classes', () => {
    it('MetaTokenExpiredError should have correct name and default message', () => {
      const err = new MetaTokenExpiredError();
      expect(err.name).toBe('MetaTokenExpiredError');
      expect(err.message).toBe('Meta access token expired or invalid');
    });

    it('MetaTokenExpiredError should accept a custom message', () => {
      const err = new MetaTokenExpiredError('Custom token error');
      expect(err.message).toBe('Custom token error');
    });

    it('MetaRateLimitError should have correct name, retryAfter, and message', () => {
      const err = new MetaRateLimitError(120);
      expect(err.name).toBe('MetaRateLimitError');
      expect(err.retryAfter).toBe(120);
      expect(err.message).toBe('Meta API rate limit reached');
    });

    it('MetaRateLimitError should accept a custom message', () => {
      const err = new MetaRateLimitError(60, 'Custom rate limit message');
      expect(err.message).toBe('Custom rate limit message');
    });
  });
});
