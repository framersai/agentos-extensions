// @ts-nocheck
/**
 * Unit tests for GoogleBusinessService (Google My Business API wrapper).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock axios BEFORE importing the service
// ---------------------------------------------------------------------------

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

import { GoogleBusinessService, type GoogleBusinessConfig } from '../src/GoogleBusinessService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createConfig(overrides: Partial<GoogleBusinessConfig> = {}): GoogleBusinessConfig {
  return {
    accessToken: 'test-access-token-123',
    refreshToken: 'test-refresh-token',
    locationId: 'loc-456',
    ...overrides,
  };
}

async function createInitializedService(config?: GoogleBusinessConfig): Promise<GoogleBusinessService> {
  const service = new GoogleBusinessService(config ?? createConfig());
  await service.initialize();
  return service;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoogleBusinessService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAxios.defaults = { headers: { common: {} } };
  });

  // ========================================================================
  // Constructor
  // ========================================================================

  describe('constructor', () => {
    it('should store config and start with isRunning false', () => {
      const service = new GoogleBusinessService(createConfig());
      expect(service.isRunning).toBe(false);
    });

    it('should not create an HTTP client in the constructor', () => {
      new GoogleBusinessService(createConfig());
      expect(mockAxios.create).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // initialize
  // ========================================================================

  describe('initialize', () => {
    it('should create an axios client with Bearer auth and set isRunning', async () => {
      const service = new GoogleBusinessService(createConfig());
      await service.initialize();

      expect(mockAxios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://mybusinessbusinessinformation.googleapis.com/v1',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token-123',
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(service.isRunning).toBe(true);
    });

    it('should throw when no access token is provided', async () => {
      const service = new GoogleBusinessService(createConfig({ accessToken: '' }));
      await expect(service.initialize()).rejects.toThrow('no access token');
    });
  });

  // ========================================================================
  // shutdown
  // ========================================================================

  describe('shutdown', () => {
    it('should set isRunning to false and clear client', async () => {
      const service = await createInitializedService();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should be safe to call when not initialized', async () => {
      const service = new GoogleBusinessService(createConfig());
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should cause subsequent API calls to throw', async () => {
      const service = await createInitializedService();
      await service.shutdown();

      await expect(service.getLocations()).rejects.toThrow('not initialized');
    });
  });

  // ========================================================================
  // Locations
  // ========================================================================

  describe('getLocations', () => {
    it('should GET /{account}/locations and return mapped locations', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          locations: [
            { name: 'locations/123', locationName: 'My Store', title: 'Downtown Location' },
            { name: 'locations/456', locationName: 'Branch', storeCode: 'BR-001' },
          ],
        },
      });

      const results = await service.getLocations('accounts/12345');

      expect(mockAxios.get).toHaveBeenCalledWith('/accounts/12345/locations');
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('locations/123');
      expect(results[0].title).toBe('Downtown Location');
      expect(results[1].title).toBe('BR-001'); // falls back to storeCode
    });

    it('should default to accounts/me when no accountId is provided', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: { locations: [] } });

      await service.getLocations();

      expect(mockAxios.get).toHaveBeenCalledWith('/accounts/me/locations');
    });

    it('should handle empty locations response', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const results = await service.getLocations();
      expect(results).toEqual([]);
    });

    it('should throw when not initialized', async () => {
      const service = new GoogleBusinessService(createConfig());
      await expect(service.getLocations()).rejects.toThrow('not initialized');
    });
  });

  // ========================================================================
  // Local Posts
  // ========================================================================

  describe('createLocalPost', () => {
    it('should POST to /{location}/localPosts and return mapped result', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          name: 'locations/123/localPosts/post-1',
          summary: 'Check out our new offer!',
          topicType: 'OFFER',
          state: 'LIVE',
          createTime: '2024-01-15T10:00:00Z',
        },
      });

      const result = await service.createLocalPost('locations/123', {
        summary: 'Check out our new offer!',
        topicType: 'OFFER',
      });

      expect(mockAxios.post).toHaveBeenCalledWith('/locations/123/localPosts', expect.objectContaining({
        summary: 'Check out our new offer!',
        topicType: 'OFFER',
        languageCode: 'en',
      }));
      expect(result.name).toBe('locations/123/localPosts/post-1');
      expect(result.state).toBe('LIVE');
    });

    it('should default topicType to STANDARD', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: { name: 'post-2', summary: 'Hello' },
      });

      await service.createLocalPost('locations/123', { summary: 'Hello' });

      const payload = mockAxios.post.mock.calls[0][1];
      expect(payload.topicType).toBe('STANDARD');
    });

    it('should include callToAction when provided', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: { name: 'post-3', summary: 'CTA' } });

      await service.createLocalPost('locations/123', {
        summary: 'CTA',
        callToAction: { actionType: 'LEARN_MORE', url: 'https://example.com' },
      });

      const payload = mockAxios.post.mock.calls[0][1];
      expect(payload.callToAction).toEqual({ actionType: 'LEARN_MORE', url: 'https://example.com' });
    });

    it('should include media when provided', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: { name: 'post-4', summary: 'Media' } });

      await service.createLocalPost('locations/123', {
        summary: 'Media',
        media: { mediaFormat: 'PHOTO', sourceUrl: 'https://img.com/pic.jpg' },
      });

      const payload = mockAxios.post.mock.calls[0][1];
      expect(payload.media).toEqual([{ mediaFormat: 'PHOTO', sourceUrl: 'https://img.com/pic.jpg' }]);
    });

    it('should use summary from options as fallback in result', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: { name: 'post-5' }, // no summary in response
      });

      const result = await service.createLocalPost('locations/123', { summary: 'Fallback' });
      expect(result.summary).toBe('Fallback');
    });
  });

  describe('deleteLocalPost', () => {
    it('should DELETE the post by name', async () => {
      const service = await createInitializedService();
      mockAxios.delete.mockResolvedValueOnce({ data: {} });

      await service.deleteLocalPost('locations/123/localPosts/post-1');

      expect(mockAxios.delete).toHaveBeenCalledWith('/locations/123/localPosts/post-1');
    });
  });

  // ========================================================================
  // Reviews
  // ========================================================================

  describe('getReviews', () => {
    it('should GET /{location}/reviews and return mapped results', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({
        data: {
          reviews: [
            {
              name: 'reviews/r-1',
              reviewId: 'r-1',
              reviewer: { displayName: 'Alice', profilePhotoUrl: 'https://photo.com/alice.jpg' },
              starRating: 'FIVE',
              comment: 'Great place!',
              createTime: '2024-01-10T10:00:00Z',
              updateTime: '2024-01-10T10:00:00Z',
              reviewReply: { comment: 'Thank you!', updateTime: '2024-01-11T10:00:00Z' },
            },
            {
              name: 'reviews/r-2',
              reviewId: 'r-2',
              reviewer: {},
              starRating: 'THREE',
            },
          ],
        },
      });

      const results = await service.getReviews('locations/123');

      expect(mockAxios.get).toHaveBeenCalledWith('/locations/123/reviews');
      expect(results).toHaveLength(2);
      expect(results[0].reviewer.displayName).toBe('Alice');
      expect(results[0].reviewReply?.comment).toBe('Thank you!');
      expect(results[1].reviewer.displayName).toBe('Anonymous');
      expect(results[1].reviewReply).toBeUndefined();
    });

    it('should handle empty reviews response', async () => {
      const service = await createInitializedService();
      mockAxios.get.mockResolvedValueOnce({ data: {} });

      const results = await service.getReviews('locations/123');
      expect(results).toEqual([]);
    });
  });

  describe('replyToReview', () => {
    it('should PUT a reply comment to the review', async () => {
      const service = await createInitializedService();
      mockAxios.put.mockResolvedValueOnce({ data: {} });

      await service.replyToReview('reviews/r-1/reply', 'Thanks for the feedback!');

      expect(mockAxios.put).toHaveBeenCalledWith('/reviews/r-1/reply/reply', {
        comment: 'Thanks for the feedback!',
      });
    });
  });

  // ========================================================================
  // Insights
  // ========================================================================

  describe('getInsights', () => {
    it('should POST a reportInsights request and return mapped result', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({
        data: {
          locationMetrics: [
            {
              metricValues: [
                { metric: 'QUERIES_DIRECT', totalValue: { metricOption: 'AGGREGATED_TOTAL', timeDimension: {}, totalValue: 150 } },
                { metric: 'VIEWS_SEARCH', totalValue: { metricOption: 'AGGREGATED_TOTAL', totalValue: 300 } },
              ],
            },
          ],
        },
      });

      const result = await service.getInsights('locations/123', ['QUERIES_DIRECT', 'VIEWS_SEARCH']);

      expect(mockAxios.post).toHaveBeenCalledWith('/locations/123:reportInsights', expect.objectContaining({
        locationNames: ['locations/123'],
        basicRequest: expect.objectContaining({
          metricRequests: [{ metric: 'QUERIES_DIRECT' }, { metric: 'VIEWS_SEARCH' }],
        }),
      }));
      expect(result.locationName).toBe('locations/123');
      expect(result.metrics).toHaveLength(2);
      expect(result.metrics[0].metric).toBe('QUERIES_DIRECT');
    });

    it('should handle empty metrics response', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: {} });

      const result = await service.getInsights('locations/123', ['QUERIES_DIRECT']);
      expect(result.metrics).toEqual([]);
    });

    it('should include a time range covering the last 30 days', async () => {
      const service = await createInitializedService();
      mockAxios.post.mockResolvedValueOnce({ data: { locationMetrics: [{ metricValues: [] }] } });

      await service.getInsights('locations/123', ['VIEWS_SEARCH']);

      const payload = mockAxios.post.mock.calls[0][1];
      const timeRange = payload.basicRequest.timeRange;
      expect(timeRange.startTime).toBeDefined();
      expect(timeRange.endTime).toBeDefined();

      // Verify the range is approximately 30 days
      const start = new Date(timeRange.startTime).getTime();
      const end = new Date(timeRange.endTime).getTime();
      const daysDiff = (end - start) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(29);
      expect(daysDiff).toBeLessThanOrEqual(31);
    });
  });

  // ========================================================================
  // Business Info
  // ========================================================================

  describe('updateBusinessInfo', () => {
    it('should PATCH with description update and correct updateMask', async () => {
      const service = await createInitializedService();
      mockAxios.patch.mockResolvedValueOnce({ data: {} });

      await service.updateBusinessInfo('locations/123', {
        description: 'Updated description',
      });

      expect(mockAxios.patch).toHaveBeenCalledWith(
        '/locations/123',
        { profile: { description: 'Updated description' } },
        { params: { updateMask: 'profile.description' } },
      );
    });

    it('should PATCH with websiteUri update', async () => {
      const service = await createInitializedService();
      mockAxios.patch.mockResolvedValueOnce({ data: {} });

      await service.updateBusinessInfo('locations/123', {
        websiteUri: 'https://newsite.com',
      });

      expect(mockAxios.patch).toHaveBeenCalledWith(
        '/locations/123',
        { websiteUri: 'https://newsite.com' },
        { params: { updateMask: 'websiteUri' } },
      );
    });

    it('should PATCH with phoneNumbers update', async () => {
      const service = await createInitializedService();
      mockAxios.patch.mockResolvedValueOnce({ data: {} });

      const phones = { primaryPhone: '+1234567890' };
      await service.updateBusinessInfo('locations/123', { phoneNumbers: phones });

      expect(mockAxios.patch).toHaveBeenCalledWith(
        '/locations/123',
        { phoneNumbers: phones },
        { params: { updateMask: 'phoneNumbers' } },
      );
    });

    it('should combine multiple update masks', async () => {
      const service = await createInitializedService();
      mockAxios.patch.mockResolvedValueOnce({ data: {} });

      await service.updateBusinessInfo('locations/123', {
        description: 'New desc',
        websiteUri: 'https://site.com',
      });

      const patchCall = mockAxios.patch.mock.calls[0];
      const updateMask = patchCall[2].params.updateMask;
      expect(updateMask).toContain('profile.description');
      expect(updateMask).toContain('websiteUri');
    });

    it('should send empty body when no updates are provided', async () => {
      const service = await createInitializedService();
      mockAxios.patch.mockResolvedValueOnce({ data: {} });

      await service.updateBusinessInfo('locations/123', {});

      expect(mockAxios.patch).toHaveBeenCalledWith(
        '/locations/123',
        {},
        { params: { updateMask: '' } },
      );
    });
  });

  // ========================================================================
  // requireClient guard
  // ========================================================================

  describe('requireClient', () => {
    it('should throw when any method is called before initialize', async () => {
      const service = new GoogleBusinessService(createConfig());

      await expect(service.getLocations()).rejects.toThrow('not initialized');
      await expect(service.createLocalPost('loc', { summary: 'x' })).rejects.toThrow('not initialized');
      await expect(service.getReviews('loc')).rejects.toThrow('not initialized');
      await expect(service.getInsights('loc', ['m'])).rejects.toThrow('not initialized');
      await expect(service.updateBusinessInfo('loc', {})).rejects.toThrow('not initialized');
    });
  });
});
