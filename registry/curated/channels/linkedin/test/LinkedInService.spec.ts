/**
 * Unit tests for LinkedInService (LinkedIn REST API v2 wrapper via axios).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.hoisted so the mock variable is available when vi.mock factory runs
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

vi.mock('axios', () => {
  return { default: mockAxios };
});

import { LinkedInService, type LinkedInConfig } from '../src/LinkedInService';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FULL_CONFIG: LinkedInConfig = {
  accessToken: 'test-access-token',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  organizationId: 'org-123',
};

const MINIMAL_CONFIG: LinkedInConfig = {
  accessToken: 'test-access-token',
};

const NO_TOKEN_CONFIG: LinkedInConfig = {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LinkedInService', () => {
  let service: LinkedInService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LinkedInService(FULL_CONFIG);
  });

  // ── constructor ──

  describe('constructor', () => {
    it('should store config and not be running initially', () => {
      expect(service.isRunning).toBe(false);
    });
  });

  // ── initialize ──

  describe('initialize', () => {
    it('should create an axios client and set running = true', async () => {
      await service.initialize();

      expect(mockAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.linkedin.com',
        headers: {
          'Authorization': 'Bearer test-access-token',
          'X-Restli-Protocol-Version': '2.0.0',
          'LinkedIn-Version': '202401',
          'Content-Type': 'application/json',
        },
      });
      expect(service.isRunning).toBe(true);
    });

    it('should throw without access token', async () => {
      const noTokenService = new LinkedInService(NO_TOKEN_CONFIG);

      await expect(noTokenService.initialize()).rejects.toThrow(
        'LinkedIn: no access token provided',
      );
      expect(noTokenService.isRunning).toBe(false);
    });

    it('should include LINKEDIN_ACCESS_TOKEN error guidance in the thrown message', async () => {
      const noTokenService = new LinkedInService(NO_TOKEN_CONFIG);

      await expect(noTokenService.initialize()).rejects.toThrow(
        /LINKEDIN_ACCESS_TOKEN/,
      );
    });
  });

  // ── shutdown ──

  describe('shutdown', () => {
    it('should clear client and set running = false', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should no-op when not running', async () => {
      await service.shutdown(); // should not throw
      expect(service.isRunning).toBe(false);
    });

    it('should cause subsequent API calls to throw', async () => {
      await service.initialize();
      await service.shutdown();

      await expect(service.getProfile()).rejects.toThrow(
        'LinkedIn service not initialized',
      );
    });
  });

  // ── getProfile ──

  describe('getProfile', () => {
    it('should call /v2/userinfo and return personId and name', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          sub: 'person-abc',
          given_name: 'John',
          family_name: 'Doe',
          email: 'john@example.com',
        },
      });

      const profile = await service.getProfile();

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/userinfo');
      expect(profile.personId).toBe('person-abc');
      expect(profile.name).toBe('John Doe');
      expect(profile.email).toBe('john@example.com');
    });

    it('should handle missing name fields gracefully', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-xyz' },
      });

      const profile = await service.getProfile();

      expect(profile.personId).toBe('person-xyz');
      expect(profile.name).toBe('');
    });

    it('should cache the personId for subsequent calls', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-cached', given_name: 'Jane', family_name: 'Smith' },
      });

      // First call fetches the profile
      await service.getProfile();

      // Reset mocks to verify no additional /v2/userinfo call for resolvePersonId
      mockAxios.get.mockClear();
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'post-1' },
        data: {},
      });

      // postToFeed uses resolvePersonId internally — should NOT call /v2/userinfo again
      await service.postToFeed({ text: 'test' });

      const userinfoCall = mockAxios.get.mock.calls.find(
        (call: any[]) => call[0] === '/v2/userinfo',
      );
      expect(userinfoCall).toBeUndefined();
    });
  });

  // ── getMe ──

  describe('getMe', () => {
    it('should return id and name from getProfile', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-me', given_name: 'Agent', family_name: 'Smith' },
      });

      const me = await service.getMe();

      expect(me.id).toBe('person-me');
      expect(me.name).toBe('Agent Smith');
    });
  });

  // ── postToFeed ──

  describe('postToFeed', () => {
    beforeEach(async () => {
      await service.initialize();
      // Pre-populate personId so we don't need to mock /v2/userinfo every time
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-1', given_name: 'Test', family_name: 'User' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
      mockAxios.post.mockClear();
    });

    it('should call /v2/posts with correct text-only payload', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'post-abc' },
        data: {},
      });

      const result = await service.postToFeed({ text: 'Hello LinkedIn!' });

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        author: 'urn:li:person:person-1',
        commentary: 'Hello LinkedIn!',
        visibility: 'PUBLIC',
        distribution: expect.objectContaining({ feedDistribution: 'MAIN_FEED' }),
        lifecycleState: 'PUBLISHED',
      }));
      expect(result.id).toBe('post-abc');
      expect(result.url).toBe('https://www.linkedin.com/feed/update/post-abc');
    });

    it('should use organization author when organizationId is provided', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'org-post-1' },
        data: {},
      });

      await service.postToFeed({ text: 'Org post', organizationId: 'org-456' });

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        author: 'urn:li:organization:org-456',
      }));
    });

    it('should set visibility to CONNECTIONS when specified', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'conn-post' },
        data: {},
      });

      await service.postToFeed({ text: 'Connections only', visibility: 'CONNECTIONS' });

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        visibility: 'CONNECTIONS',
      }));
    });

    it('should handle article attachments', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'article-post' },
        data: {},
      });

      await service.postToFeed({
        text: 'Check out this article',
        articleUrl: 'https://example.com/article',
        articleTitle: 'Great Article',
        articleDescription: 'A description',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        content: {
          article: {
            source: 'https://example.com/article',
            title: 'Great Article',
            description: 'A description',
          },
        },
      }));
    });

    it('should use articleUrl as default title when articleTitle is not provided', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'article-post-2' },
        data: {},
      });

      await service.postToFeed({
        text: 'Article without title',
        articleUrl: 'https://example.com/no-title',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        content: {
          article: {
            source: 'https://example.com/no-title',
            title: 'https://example.com/no-title',
            description: '',
          },
        },
      }));
    });

    it('should handle single media upload', async () => {
      // registerImageUpload
      mockAxios.post.mockResolvedValueOnce({
        data: { value: { uploadUrl: 'https://upload.linkedin.com/upload/1', image: 'urn:li:image:asset1' } },
      });
      // uploadImage: GET to download the source image
      mockAxios.get.mockResolvedValueOnce({ data: Buffer.from('fake-image') });
      // uploadImage: PUT to upload to presigned URL
      mockAxios.put.mockResolvedValueOnce({});
      // postToFeed: POST /v2/posts
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'media-post-1' },
        data: {},
      });

      const result = await service.postToFeed({
        text: 'With image',
        mediaUrls: ['https://example.com/photo.jpg'],
      });

      // registerImageUpload call
      expect(mockAxios.post).toHaveBeenCalledWith(
        '/v2/images?action=initializeUpload',
        expect.objectContaining({
          initializeUploadRequest: { owner: 'urn:li:person:person-1' },
        }),
      );

      // Final post call should include single media content
      const lastPostCall = mockAxios.post.mock.calls[mockAxios.post.mock.calls.length - 1];
      expect(lastPostCall[0]).toBe('/v2/posts');
      expect(lastPostCall[1].content).toEqual({
        media: { id: 'urn:li:image:asset1' },
      });

      expect(result.id).toBe('media-post-1');
    });

    it('should handle multiple media uploads as multiImage', async () => {
      // First image: registerImageUpload
      mockAxios.post.mockResolvedValueOnce({
        data: { value: { uploadUrl: 'https://upload.linkedin.com/1', image: 'urn:li:image:img1' } },
      });
      mockAxios.get.mockResolvedValueOnce({ data: Buffer.from('img1') });
      mockAxios.put.mockResolvedValueOnce({});

      // Second image: registerImageUpload
      mockAxios.post.mockResolvedValueOnce({
        data: { value: { uploadUrl: 'https://upload.linkedin.com/2', image: 'urn:li:image:img2' } },
      });
      mockAxios.get.mockResolvedValueOnce({ data: Buffer.from('img2') });
      mockAxios.put.mockResolvedValueOnce({});

      // postToFeed: POST /v2/posts
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'multi-media-post' },
        data: {},
      });

      const result = await service.postToFeed({
        text: 'Multiple images',
        mediaUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      });

      const lastPostCall = mockAxios.post.mock.calls[mockAxios.post.mock.calls.length - 1];
      expect(lastPostCall[0]).toBe('/v2/posts');
      expect(lastPostCall[1].content).toEqual({
        multiImage: {
          images: [{ id: 'urn:li:image:img1' }, { id: 'urn:li:image:img2' }],
        },
      });

      expect(result.id).toBe('multi-media-post');
    });

    it('should prioritize articleUrl over mediaUrls', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'article-priority' },
        data: {},
      });

      await service.postToFeed({
        text: 'Both article and media',
        articleUrl: 'https://example.com/article',
        mediaUrls: ['https://example.com/photo.jpg'],
      });

      // Should have article content, NOT media
      const postCall = mockAxios.post.mock.calls[0];
      expect(postCall[1].content.article).toBeDefined();
      expect(postCall[1].content.media).toBeUndefined();
      expect(postCall[1].content.multiImage).toBeUndefined();
    });

    it('should fall back to res.data.id when x-restli-id header is missing', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: {},
        data: { id: 'data-id-fallback' },
      });

      const result = await service.postToFeed({ text: 'Fallback' });

      expect(result.id).toBe('data-id-fallback');
    });

    it('should return empty string id when neither header nor data id is present', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: {},
        data: {},
      });

      const result = await service.postToFeed({ text: 'No ID' });

      expect(result.id).toBe('');
    });

    it('should throw a friendly message on 401 errors', async () => {
      mockAxios.post.mockRejectedValueOnce({
        response: { status: 401 },
      });

      await expect(service.postToFeed({ text: 'Expired' })).rejects.toThrow(
        'LinkedIn: access token expired or invalid',
      );
    });

    it('should re-throw non-401 errors as-is', async () => {
      const error = new Error('Network error');
      mockAxios.post.mockRejectedValueOnce(error);

      await expect(service.postToFeed({ text: 'Fail' })).rejects.toThrow('Network error');
    });
  });

  // ── registerImageUpload ──

  describe('registerImageUpload', () => {
    it('should call /v2/images?action=initializeUpload with owner', async () => {
      await service.initialize();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          value: {
            uploadUrl: 'https://upload.linkedin.com/presigned',
            image: 'urn:li:image:upload-asset',
          },
        },
      });

      const result = await service.registerImageUpload('urn:li:person:person-1');

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/images?action=initializeUpload', {
        initializeUploadRequest: { owner: 'urn:li:person:person-1' },
      });
      expect(result.uploadUrl).toBe('https://upload.linkedin.com/presigned');
      expect(result.asset).toBe('urn:li:image:upload-asset');
    });

    it('should return empty strings when value is missing', async () => {
      await service.initialize();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      const result = await service.registerImageUpload('urn:li:person:p1');

      expect(result.uploadUrl).toBe('');
      expect(result.asset).toBe('');
    });
  });

  // ── uploadImage ──

  describe('uploadImage', () => {
    beforeEach(async () => {
      const svc = new LinkedInService(MINIMAL_CONFIG);
      await svc.initialize();
      service = svc;
    });

    it('should download from URL source then upload to presigned URL', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: Buffer.from('image-bytes') });
      mockAxios.put.mockResolvedValueOnce({});

      await service.uploadImage('https://upload.linkedin.com/dest', 'https://example.com/photo.png');

      expect(mockAxios.get).toHaveBeenCalledWith('https://example.com/photo.png', {
        responseType: 'arraybuffer',
      });
      expect(mockAxios.put).toHaveBeenCalledWith(
        'https://upload.linkedin.com/dest',
        expect.any(Buffer),
        {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Authorization': 'Bearer test-access-token',
          },
        },
      );
    });
  });

  // ── commentOnPost ──

  describe('commentOnPost', () => {
    beforeEach(async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-commenter', given_name: 'Comm', family_name: 'Enter' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
      mockAxios.post.mockClear();
    });

    it('should POST to /v2/socialActions/{postId}/comments with actor and message', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: { id: 'comment-99' },
        headers: {},
      });

      const result = await service.commentOnPost('urn:li:share:12345', 'Great post!');

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/v2/socialActions/' + encodeURIComponent('urn:li:share:12345') + '/comments',
        {
          actor: 'urn:li:person:person-commenter',
          message: { text: 'Great post!' },
        },
      );
      expect(result.id).toBe('comment-99');
    });

    it('should fallback to x-restli-id header when data.id is missing', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {},
        headers: { 'x-restli-id': 'header-comment-id' },
      });

      const result = await service.commentOnPost('post-1', 'Nice!');

      expect(result.id).toBe('header-comment-id');
    });

    it('should return empty string when no id is available', async () => {
      mockAxios.post.mockResolvedValueOnce({
        data: {},
        headers: {},
      });

      const result = await service.commentOnPost('post-1', 'Hello');

      expect(result.id).toBe('');
    });
  });

  // ── likePost ──

  describe('likePost', () => {
    beforeEach(async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-liker', given_name: 'Like', family_name: 'Giver' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
      mockAxios.post.mockClear();
    });

    it('should POST to /v2/socialActions/{postId}/likes with actor', async () => {
      mockAxios.post.mockResolvedValueOnce({});

      await service.likePost('urn:li:share:post-to-like');

      expect(mockAxios.post).toHaveBeenCalledWith(
        '/v2/socialActions/' + encodeURIComponent('urn:li:share:post-to-like') + '/likes',
        { actor: 'urn:li:person:person-liker' },
      );
    });
  });

  // ── unlikePost ──

  describe('unlikePost', () => {
    beforeEach(async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-unliker', given_name: 'Un', family_name: 'Liker' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
      mockAxios.delete.mockClear();
    });

    it('should DELETE the like resource for the current user', async () => {
      mockAxios.delete.mockResolvedValueOnce({});

      await service.unlikePost('urn:li:share:post-to-unlike');

      const expectedUrl =
        '/v2/socialActions/' +
        encodeURIComponent('urn:li:share:post-to-unlike') +
        '/likes/' +
        encodeURIComponent('urn:li:person:person-unliker');

      expect(mockAxios.delete).toHaveBeenCalledWith(expectedUrl);
    });
  });

  // ── sharePost ──

  describe('sharePost', () => {
    beforeEach(async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-sharer', given_name: 'Share', family_name: 'Bot' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
      mockAxios.post.mockClear();
    });

    it('should POST to /v2/posts with reshare content', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'share-post-1' },
        data: {},
      });

      const result = await service.sharePost('urn:li:share:original', 'My thoughts');

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        author: 'urn:li:person:person-sharer',
        commentary: 'My thoughts',
        visibility: 'PUBLIC',
        lifecycleState: 'PUBLISHED',
        content: {
          reshare: { resharedPost: 'urn:li:share:original' },
        },
      }));
      expect(result.id).toBe('share-post-1');
      expect(result.url).toBe('https://www.linkedin.com/feed/update/share-post-1');
    });

    it('should use empty string commentary when not provided', async () => {
      mockAxios.post.mockResolvedValueOnce({
        headers: { 'x-restli-id': 'share-no-comment' },
        data: {},
      });

      await service.sharePost('post-id');

      expect(mockAxios.post).toHaveBeenCalledWith('/v2/posts', expect.objectContaining({
        commentary: '',
      }));
    });
  });

  // ── searchPosts ──

  describe('searchPosts', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should search for posts by default', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { elements: [{ id: 'search-result-1' }] },
      });

      const results = await service.searchPosts({ query: 'AI agents' });

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/search', {
        params: {
          q: 'keywords',
          keywords: 'AI agents',
          type: 'FEED_UPDATE',
          count: 10,
        },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('search-result-1');
    });

    it('should search for people when type is people', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { elements: [{ id: 'person-result-1', name: 'Jane' }] },
      });

      const results = await service.searchPosts({ query: 'engineer', type: 'people' });

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/search', {
        params: {
          q: 'keywords',
          keywords: 'engineer',
          type: 'PEOPLE',
          count: 10,
        },
      });
      expect(results).toHaveLength(1);
    });

    it('should search for companies when type is companies', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: { elements: [{ id: 'company-1', name: 'Acme' }] },
      });

      const results = await service.searchPosts({ query: 'startup', type: 'companies' });

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/search', {
        params: {
          q: 'keywords',
          keywords: 'startup',
          type: 'COMPANY',
          count: 10,
        },
      });
      expect(results).toHaveLength(1);
    });

    it('should cap limit at 50', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { elements: [] } });

      await service.searchPosts({ query: 'test', limit: 100 });

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/search', expect.objectContaining({
        params: expect.objectContaining({ count: 50 }),
      }));
    });

    it('should use custom limit when within range', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { elements: [] } });

      await service.searchPosts({ query: 'test', limit: 25 });

      expect(mockAxios.get).toHaveBeenCalledWith('/v2/search', expect.objectContaining({
        params: expect.objectContaining({ count: 25 }),
      }));
    });

    it('should return empty array when elements is missing', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const results = await service.searchPosts({ query: 'nothing' });

      expect(results).toEqual([]);
    });

    it('should throw friendly message on 401 error', async () => {
      mockAxios.get.mockRejectedValueOnce({ response: { status: 401 } });

      await expect(service.searchPosts({ query: 'test' })).rejects.toThrow(
        'LinkedIn: access token expired or invalid',
      );
    });

    it('should re-throw non-401 errors', async () => {
      const error = new Error('Server error');
      mockAxios.get.mockRejectedValueOnce(error);

      await expect(service.searchPosts({ query: 'fail' })).rejects.toThrow('Server error');
    });
  });

  // ── getPostAnalytics ──

  describe('getPostAnalytics', () => {
    it('should return structured analytics from socialActions', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          likesSummary: { totalLikes: 42 },
          commentsSummary: { totalFirstLevelComments: 10 },
          sharesSummary: { totalShares: 5 },
        },
      });

      const analytics = await service.getPostAnalytics('urn:li:share:analytics-post');

      expect(mockAxios.get).toHaveBeenCalledWith(
        '/v2/socialActions/' + encodeURIComponent('urn:li:share:analytics-post'),
      );
      expect(analytics.likes).toBe(42);
      expect(analytics.comments).toBe(10);
      expect(analytics.shares).toBe(5);
      expect(analytics.impressions).toBe(0);
      expect(analytics.clicks).toBe(0);
      expect(analytics.engagement).toBe(0);
    });

    it('should fetch org share statistics when organizationId is configured', async () => {
      const orgService = new LinkedInService(FULL_CONFIG);
      await orgService.initialize();

      // socialActions call
      mockAxios.get.mockResolvedValueOnce({
        data: {
          likesSummary: { totalLikes: 20 },
          commentsSummary: { totalFirstLevelComments: 5 },
          sharesSummary: { totalShares: 3 },
        },
      });
      // organizationalEntityShareStatistics call
      mockAxios.get.mockResolvedValueOnce({
        data: {
          elements: [{
            totalShareStatistics: {
              impressionCount: 1000,
              clickCount: 50,
            },
          }],
        },
      });

      const analytics = await orgService.getPostAnalytics('org-post-1');

      expect(analytics.likes).toBe(20);
      expect(analytics.comments).toBe(5);
      expect(analytics.shares).toBe(3);
      expect(analytics.impressions).toBe(1000);
      expect(analytics.clicks).toBe(50);
      // engagement = (20 + 5 + 3) / 1000 = 0.028
      expect(analytics.engagement).toBeCloseTo(0.028, 3);
    });

    it('should gracefully handle missing org statistics', async () => {
      const orgService = new LinkedInService(FULL_CONFIG);
      await orgService.initialize();

      mockAxios.get.mockResolvedValueOnce({
        data: {
          likesSummary: { totalLikes: 10 },
          commentsSummary: { totalFirstLevelComments: 2 },
          sharesSummary: { totalShares: 1 },
        },
      });
      // Stats call fails
      mockAxios.get.mockRejectedValueOnce(new Error('Stats unavailable'));

      const analytics = await orgService.getPostAnalytics('org-post-2');

      expect(analytics.likes).toBe(10);
      expect(analytics.impressions).toBe(0);
      expect(analytics.clicks).toBe(0);
    });

    it('should return zeros when action summaries are empty', async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const analytics = await service.getPostAnalytics('empty-post');

      expect(analytics.likes).toBe(0);
      expect(analytics.comments).toBe(0);
      expect(analytics.shares).toBe(0);
      expect(analytics.engagement).toBe(0);
    });

    it('should throw friendly message on 401 error', async () => {
      await service.initialize();
      mockAxios.get.mockRejectedValueOnce({ response: { status: 401 } });

      await expect(service.getPostAnalytics('post')).rejects.toThrow(
        'LinkedIn: access token expired or invalid',
      );
    });
  });

  // ── deletePost ──

  describe('deletePost', () => {
    it('should DELETE /v2/posts/{postId}', async () => {
      await service.initialize();
      mockAxios.delete.mockResolvedValueOnce({});

      await service.deletePost('urn:li:share:delete-me');

      expect(mockAxios.delete).toHaveBeenCalledWith(
        '/v2/posts/' + encodeURIComponent('urn:li:share:delete-me'),
      );
    });
  });

  // ── getOrganizations ──

  describe('getOrganizations', () => {
    beforeEach(async () => {
      await service.initialize();
      mockAxios.get.mockResolvedValueOnce({
        data: { sub: 'person-org', given_name: 'Org', family_name: 'Admin' },
      });
      await service.getProfile();
      mockAxios.get.mockClear();
    });

    it('should fetch organization ACLs and resolve organization names', async () => {
      // organizationAcls response
      mockAxios.get.mockResolvedValueOnce({
        data: {
          elements: [
            { organizationalTarget: 'urn:li:organization:111' },
            { organizationalTarget: 'urn:li:organization:222' },
          ],
        },
      });
      // Organization name lookups
      mockAxios.get.mockResolvedValueOnce({
        data: { localizedName: 'Acme Corp' },
      });
      mockAxios.get.mockResolvedValueOnce({
        data: { localizedName: 'Beta Inc' },
      });

      const orgs = await service.getOrganizations();

      expect(orgs).toEqual([
        { id: '111', name: 'Acme Corp' },
        { id: '222', name: 'Beta Inc' },
      ]);
    });

    it('should fallback to orgId as name when org lookup fails', async () => {
      mockAxios.get.mockResolvedValueOnce({
        data: {
          elements: [{ organizationalTarget: 'urn:li:organization:333' }],
        },
      });
      mockAxios.get.mockRejectedValueOnce(new Error('Not found'));

      const orgs = await service.getOrganizations();

      expect(orgs).toEqual([{ id: '333', name: '333' }]);
    });

    it('should return empty array when no org ACLs exist', async () => {
      mockAxios.get.mockResolvedValueOnce({ data: { elements: [] } });

      const orgs = await service.getOrganizations();

      expect(orgs).toEqual([]);
    });

    it('should throw friendly message on 401 error', async () => {
      mockAxios.get.mockRejectedValueOnce({ response: { status: 401 } });

      await expect(service.getOrganizations()).rejects.toThrow(
        'LinkedIn: access token expired or invalid',
      );
    });
  });

  // ── requireClient ──

  describe('requireClient', () => {
    it('should throw when service is not initialized', async () => {
      await expect(service.getProfile()).rejects.toThrow(
        'LinkedIn service not initialized',
      );
    });
  });
});
