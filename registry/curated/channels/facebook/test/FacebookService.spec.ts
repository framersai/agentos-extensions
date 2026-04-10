// @ts-nocheck
/**
 * @fileoverview Unit tests for FacebookService — Meta Graph API v19 service layer.
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
import { FacebookService } from '../src/FacebookService.js';
import type { FacebookConfig, PostOptions } from '../src/FacebookService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createService(overrides: Partial<FacebookConfig> = {}): FacebookService {
  return new FacebookService({
    accessToken: 'test-token-123',
    pageId: 'page-42',
    pageAccessToken: 'page-token-456',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FacebookService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  describe('initialize / shutdown lifecycle', () => {
    it('should create an axios client with the correct base URL and Bearer header', async () => {
      const svc = createService();
      await svc.initialize();

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://graph.facebook.com/v19.0',
        headers: { Authorization: 'Bearer test-token-123' },
      });
      expect(svc.isRunning).toBe(true);
    });

    it('should throw if no access token is provided', async () => {
      const svc = createService({ accessToken: undefined });

      await expect(svc.initialize()).rejects.toThrow(
        /no access token provided/,
      );
      expect(svc.isRunning).toBe(false);
    });

    it('should tear down the client on shutdown', async () => {
      const svc = createService();
      await svc.initialize();
      expect(svc.isRunning).toBe(true);

      await svc.shutdown();
      expect(svc.isRunning).toBe(false);
    });

    it('should allow calling shutdown before initialize without error', async () => {
      const svc = createService();
      await expect(svc.shutdown()).resolves.toBeUndefined();
      expect(svc.isRunning).toBe(false);
    });

    it('should allow re-initialization after shutdown', async () => {
      const svc = createService();
      await svc.initialize();
      await svc.shutdown();
      expect(svc.isRunning).toBe(false);

      await svc.initialize();
      expect(svc.isRunning).toBe(true);
      expect(mockAxios.create).toHaveBeenCalledTimes(2);
    });
  });

  // ── Profile ──────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should call GET /me and return id + name', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({
        data: { id: 'user-1', name: 'Alice' },
      });

      const profile = await svc.getProfile();
      expect(mockAxios.get).toHaveBeenCalledWith('/me', {
        params: { fields: 'id,name' },
      });
      expect(profile).toEqual({ id: 'user-1', name: 'Alice' });
    });

    it('should throw when service is not initialized', async () => {
      const svc = createService();
      await expect(svc.getProfile()).rejects.toThrow(
        /not initialized/,
      );
    });
  });

  // ── Pages ────────────────────────────────────────────────────────────────

  describe('getPages', () => {
    it('should return an array of PageInfo objects', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { id: 'p1', name: 'My Page', access_token: 'tok-p1', category: 'Tech' },
            { id: 'p2', name: 'Other Page', access_token: 'tok-p2', category: 'Art' },
          ],
        },
      });

      const pages = await svc.getPages();
      expect(mockAxios.get).toHaveBeenCalledWith('/me/accounts', {
        params: { fields: 'id,name,access_token,category' },
      });
      expect(pages).toEqual([
        { id: 'p1', name: 'My Page', accessToken: 'tok-p1', category: 'Tech' },
        { id: 'p2', name: 'Other Page', accessToken: 'tok-p2', category: 'Art' },
      ]);
    });

    it('should return an empty array when the API returns no data', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({ data: {} });
      const pages = await svc.getPages();
      expect(pages).toEqual([]);
    });
  });

  // ── postToPage ───────────────────────────────────────────────────────────

  describe('postToPage', () => {
    let svc: FacebookService;

    beforeEach(async () => {
      svc = createService();
      await svc.initialize();
    });

    it('should post text-only to /{pageId}/feed', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'post-1' } });

      const result = await svc.postToPage('page-42', { message: 'Hello world' });

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/feed', null, {
        params: {
          message: 'Hello world',
          access_token: 'page-token-456',
        },
      });
      expect(result).toEqual({ id: 'post-1', message: 'Hello world' });
    });

    it('should post with a link attached', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'post-link' } });

      const result = await svc.postToPage('page-42', {
        message: 'Check this out',
        link: 'https://example.com',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/feed', null, {
        params: expect.objectContaining({
          message: 'Check this out',
          link: 'https://example.com',
          access_token: 'page-token-456',
        }),
      });
      expect(result.id).toBe('post-link');
    });

    it('should upload a photo via /{pageId}/photos when photoUrl is present', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'photo-1' } });

      const result = await svc.postToPage('page-42', {
        message: 'Nice pic',
        photoUrl: 'https://cdn.example.com/img.jpg',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/photos', null, {
        params: {
          url: 'https://cdn.example.com/img.jpg',
          caption: 'Nice pic',
          access_token: 'page-token-456',
        },
      });
      expect(result).toEqual({ id: 'photo-1', message: 'Nice pic' });
    });

    it('should upload a video via /{pageId}/videos when videoUrl is present', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'video-1' } });

      const result = await svc.postToPage('page-42', {
        message: 'Watch this',
        videoUrl: 'https://cdn.example.com/clip.mp4',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/videos', null, {
        params: {
          file_url: 'https://cdn.example.com/clip.mp4',
          description: 'Watch this',
          access_token: 'page-token-456',
        },
      });
      expect(result).toEqual({ id: 'video-1', message: 'Watch this' });
    });

    it('should prefer photoUrl over videoUrl when both are provided', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'photo-wins' } });

      await svc.postToPage('page-42', {
        message: 'Both media',
        photoUrl: 'https://cdn.example.com/img.jpg',
        videoUrl: 'https://cdn.example.com/clip.mp4',
      });

      // Photos endpoint is checked first in the source
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/page-42/photos',
        null,
        expect.objectContaining({
          params: expect.objectContaining({ url: 'https://cdn.example.com/img.jpg' }),
        }),
      );
    });

    it('should pass scheduling params when published=false and scheduledTime is set', async () => {
      mockAxios.post.mockResolvedValueOnce({ data: { id: 'sched-1' } });
      const futureTime = Math.floor(Date.now() / 1000) + 3600;

      await svc.postToPage('page-42', {
        message: 'Scheduled post',
        published: false,
        scheduledTime: futureTime,
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/feed', null, {
        params: expect.objectContaining({
          published: false,
          scheduled_publish_time: futureTime,
        }),
      });
    });

    it('should fall back to user access token when pageAccessToken is not set', async () => {
      const svcNoPage = new FacebookService({
        accessToken: 'user-tok',
        pageId: 'p1',
      });
      await svcNoPage.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'fallback-1' } });

      await svcNoPage.postToPage('p1', { message: 'Fallback token test' });

      expect(mockAxios.post).toHaveBeenCalledWith('/p1/feed', null, {
        params: expect.objectContaining({ access_token: 'user-tok' }),
      });
    });
  });

  // ── postToProfile ────────────────────────────────────────────────────────

  describe('postToProfile', () => {
    it('should POST to /me/feed with message and optional link', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'profile-post-1' } });

      const result = await svc.postToProfile({
        message: 'Personal post',
        link: 'https://example.com',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/me/feed', null, {
        params: { message: 'Personal post', link: 'https://example.com' },
      });
      expect(result).toEqual({ id: 'profile-post-1', message: 'Personal post' });
    });

    it('should omit link param when not provided', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'pp-2' } });

      await svc.postToProfile({ message: 'No link' });

      expect(mockAxios.post).toHaveBeenCalledWith('/me/feed', null, {
        params: { message: 'No link' },
      });
    });
  });

  // ── Engagement ───────────────────────────────────────────────────────────

  describe('commentOnPost', () => {
    it('should POST /{postId}/comments with the message', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'comment-1' } });

      const result = await svc.commentOnPost('post-99', 'Great post!');

      expect(mockAxios.post).toHaveBeenCalledWith('/post-99/comments', null, {
        params: { message: 'Great post!' },
      });
      expect(result).toEqual({ id: 'comment-1' });
    });
  });

  describe('likePost', () => {
    it('should POST /{postId}/likes', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { success: true } });

      await svc.likePost('post-88');

      expect(mockAxios.post).toHaveBeenCalledWith('/post-88/likes');
    });
  });

  describe('unlikePost', () => {
    it('should DELETE /{postId}/likes', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

      await svc.unlikePost('post-88');

      expect(mockAxios.delete).toHaveBeenCalledWith('/post-88/likes');
    });
  });

  describe('sharePost', () => {
    it('should create a new feed post with the original post link', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'share-1' } });

      const result = await svc.sharePost('post-77', 'Must read!');

      expect(mockAxios.post).toHaveBeenCalledWith('/me/feed', null, {
        params: {
          link: 'https://www.facebook.com/post-77',
          message: 'Must read!',
        },
      });
      expect(result).toEqual({
        id: 'share-1',
        message: 'Must read!',
        permalink: 'https://www.facebook.com/post-77',
      });
    });

    it('should omit message param when sharing without comment', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'share-2' } });

      const result = await svc.sharePost('post-66');

      expect(mockAxios.post).toHaveBeenCalledWith('/me/feed', null, {
        params: { link: 'https://www.facebook.com/post-66' },
      });
      expect(result.message).toBeUndefined();
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────

  describe('searchPosts', () => {
    it('should GET /search with query, type, and limit', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({
        data: { data: [{ id: 'r1' }, { id: 'r2' }] },
      });

      const results = await svc.searchPosts('ai agents', 'page', 5);

      expect(mockAxios.get).toHaveBeenCalledWith('/search', {
        params: { q: 'ai agents', type: 'page', limit: 5 },
      });
      expect(results).toHaveLength(2);
    });

    it('should use default type=post and limit=10', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });

      await svc.searchPosts('hello');

      expect(mockAxios.get).toHaveBeenCalledWith('/search', {
        params: { q: 'hello', type: 'post', limit: 10 },
      });
    });

    it('should return empty array when API returns no data property', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const results = await svc.searchPosts('nothing');
      expect(results).toEqual([]);
    });
  });

  // ── Analytics ────────────────────────────────────────────────────────────

  describe('getPostAnalytics', () => {
    it('should parse insights metrics into AnalyticsResult', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            { name: 'post_impressions', values: [{ value: 1200 }] },
            { name: 'post_engaged_users', values: [{ value: 85 }] },
            { name: 'post_clicks', values: [{ value: 42 }] },
            { name: 'post_reactions_by_type_total', values: [{ value: 200 }] },
          ],
        },
      });

      const analytics = await svc.getPostAnalytics('post-55');

      expect(mockAxios.get).toHaveBeenCalledWith('/post-55/insights', {
        params: {
          metric: 'post_impressions,post_engaged_users,post_clicks,post_reactions_by_type_total',
          access_token: 'page-token-456',
        },
      });
      expect(analytics).toEqual({
        postId: 'post-55',
        impressions: 1200,
        engagedUsers: 85,
        clicks: 42,
        reactions: 200,
      });
    });

    it('should return undefined metrics when insight data is missing', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });

      const analytics = await svc.getPostAnalytics('post-empty');

      expect(analytics).toEqual({
        postId: 'post-empty',
        impressions: undefined,
        engagedUsers: undefined,
        clicks: undefined,
        reactions: undefined,
      });
    });

    it('should fall back to user access token when pageAccessToken is absent', async () => {
      const svc = new FacebookService({ accessToken: 'usr-tok' });
      await svc.initialize();

      mockAxios.get.mockResolvedValueOnce({ data: { data: [] } });

      await svc.getPostAnalytics('post-x');

      expect(mockAxios.get).toHaveBeenCalledWith('/post-x/insights', {
        params: expect.objectContaining({ access_token: 'usr-tok' }),
      });
    });
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('should DELETE /{postId}', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.delete.mockResolvedValueOnce({ data: { success: true } });

      await svc.deletePost('post-to-delete');

      expect(mockAxios.delete).toHaveBeenCalledWith('/post-to-delete');
    });
  });

  // ── Media Upload ─────────────────────────────────────────────────────────

  describe('uploadPhoto', () => {
    it('should POST /{pageId}/photos with url and caption', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'photo-up-1' } });

      const result = await svc.uploadPhoto('page-42', 'https://img.com/a.jpg', 'My caption');

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/photos', null, {
        params: {
          url: 'https://img.com/a.jpg',
          access_token: 'page-token-456',
          caption: 'My caption',
        },
      });
      expect(result).toEqual({ id: 'photo-up-1' });
    });

    it('should omit caption when not provided', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'photo-up-2' } });

      await svc.uploadPhoto('page-42', 'https://img.com/b.jpg');

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/photos', null, {
        params: {
          url: 'https://img.com/b.jpg',
          access_token: 'page-token-456',
        },
      });
    });
  });

  describe('uploadVideo', () => {
    it('should POST /{pageId}/videos with file_url and description', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'vid-up-1' } });

      const result = await svc.uploadVideo('page-42', 'https://vid.com/a.mp4', 'Video desc');

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/videos', null, {
        params: {
          file_url: 'https://vid.com/a.mp4',
          access_token: 'page-token-456',
          description: 'Video desc',
        },
      });
      expect(result).toEqual({ id: 'vid-up-1' });
    });

    it('should omit description when not provided', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.post.mockResolvedValueOnce({ data: { id: 'vid-up-2' } });

      await svc.uploadVideo('page-42', 'https://vid.com/b.mp4');

      expect(mockAxios.post).toHaveBeenCalledWith('/page-42/videos', null, {
        params: {
          file_url: 'https://vid.com/b.mp4',
          access_token: 'page-token-456',
        },
      });
    });
  });

  // ── Error propagation ────────────────────────────────────────────────────

  describe('error propagation', () => {
    it('should propagate API errors from axios', async () => {
      const svc = createService();
      await svc.initialize();

      mockAxios.get.mockRejectedValueOnce(new Error('Network Error'));

      await expect(svc.getProfile()).rejects.toThrow('Network Error');
    });

    it('should throw when calling any method before initialize', async () => {
      const svc = createService();

      await expect(svc.commentOnPost('x', 'y')).rejects.toThrow(/not initialized/);
      await expect(svc.likePost('x')).rejects.toThrow(/not initialized/);
      await expect(svc.searchPosts('q')).rejects.toThrow(/not initialized/);
      await expect(svc.deletePost('x')).rejects.toThrow(/not initialized/);
    });
  });
});
