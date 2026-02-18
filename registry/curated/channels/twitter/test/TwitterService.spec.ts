/**
 * Unit tests for TwitterService (twitter-api-v2 wrapper).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockV2 = {
  me: vi.fn().mockResolvedValue({ data: { id: '1', name: 'Test', username: 'test' } }),
  tweet: vi.fn().mockResolvedValue({ data: { id: 'tw-1', text: 'hello world' } }),
  like: vi.fn().mockResolvedValue(undefined),
  unlike: vi.fn().mockResolvedValue(undefined),
  retweet: vi.fn().mockResolvedValue(undefined),
  unretweet: vi.fn().mockResolvedValue(undefined),
  search: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'sr-1',
          text: 'found tweet',
          author_id: 'author-1',
          created_at: '2024-01-01T00:00:00Z',
          public_metrics: {
            like_count: 10,
            retweet_count: 5,
            reply_count: 2,
            impression_count: 1000,
          },
        },
      ],
    },
  }),
  homeTimeline: vi.fn().mockResolvedValue({
    data: {
      data: [
        {
          id: 'tl-1',
          text: 'timeline tweet',
          author_id: 'author-2',
          created_at: '2024-01-02T00:00:00Z',
          public_metrics: {
            like_count: 20,
            retweet_count: 10,
            reply_count: 3,
            impression_count: 2000,
          },
        },
      ],
    },
  }),
  sendDmInConversation: vi.fn().mockResolvedValue({ dm_event_id: 'dm-evt-1' }),
  listDmEvents: vi.fn().mockResolvedValue({ data: { data: [] } }),
  singleTweet: vi.fn().mockResolvedValue({
    data: {
      id: 'tw-99',
      text: 'metrics tweet',
      author_id: 'author-3',
      created_at: '2024-01-03T00:00:00Z',
      public_metrics: {
        like_count: 100,
        retweet_count: 50,
        reply_count: 25,
        impression_count: 5000,
      },
    },
  }),
};

const mockV1 = {
  trendsByPlace: vi.fn().mockResolvedValue([
    {
      trends: [
        { name: '#Trending1', tweet_volume: 50000, url: 'https://twitter.com/trends/1' },
        { name: '#Trending2', tweet_volume: null, url: 'https://twitter.com/trends/2' },
      ],
    },
  ]),
  uploadMedia: vi.fn().mockResolvedValue('media-id-123'),
};

vi.mock('twitter-api-v2', () => ({
  TwitterApi: class MockTwitterApi {
    constructor(_opts?: any) {}
    v2 = mockV2;
    v1 = mockV1;
  },
}));

import { TwitterService, type TwitterConfig } from '../src/TwitterService';

const FULL_CONFIG: TwitterConfig = {
  bearerToken: 'test-bearer-token',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  accessToken: 'test-access-token',
  accessSecret: 'test-access-secret',
};

const READONLY_CONFIG: TwitterConfig = {
  bearerToken: 'test-bearer-token',
};

describe('TwitterService', () => {
  let service: TwitterService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TwitterService(FULL_CONFIG);
  });

  describe('constructor', () => {
    it('should store the config and not be running initially', () => {
      expect(service.isRunning).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should create read/write clients and set isRunning to true', async () => {
      expect(service.isRunning).toBe(false);
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should only create read client when OAuth credentials are missing', async () => {
      const readOnlyService = new TwitterService(READONLY_CONFIG);
      await readOnlyService.initialize();
      expect(readOnlyService.isRunning).toBe(true);

      // Should fail on write operations since no write client
      await expect(readOnlyService.postTweet({ text: 'test' })).rejects.toThrow(
        /OAuth 1\.0a credentials/,
      );
    });
  });

  describe('shutdown', () => {
    it('should clear clients and set isRunning to false', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);

      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should no-op when not running', async () => {
      await service.shutdown(); // should not throw
      expect(service.isRunning).toBe(false);
    });
  });

  describe('postTweet', () => {
    it('should call client.v2.tweet with text', async () => {
      await service.initialize();
      const result = await service.postTweet({ text: 'Hello world!' });

      expect(mockV2.tweet).toHaveBeenCalledWith({ text: 'Hello world!' });
      expect(result.id).toBe('tw-1');
      expect(result.text).toBe('hello world');
    });

    it('should include media_ids when mediaIds provided', async () => {
      await service.initialize();
      await service.postTweet({ text: 'With media', mediaIds: ['m-1', 'm-2'] });

      expect(mockV2.tweet).toHaveBeenCalledWith({
        text: 'With media',
        media: { media_ids: ['m-1', 'm-2'] },
      });
    });

    it('should include poll options when pollOptions provided', async () => {
      await service.initialize();
      await service.postTweet({
        text: 'Poll time',
        pollOptions: ['Yes', 'No'],
        pollDurationMinutes: 60,
      });

      expect(mockV2.tweet).toHaveBeenCalledWith({
        text: 'Poll time',
        poll: { options: ['Yes', 'No'], duration_minutes: 60 },
      });
    });

    it('should use default poll duration of 1440 minutes', async () => {
      await service.initialize();
      await service.postTweet({
        text: 'Poll default',
        pollOptions: ['A', 'B'],
      });

      expect(mockV2.tweet).toHaveBeenCalledWith(
        expect.objectContaining({
          poll: { options: ['A', 'B'], duration_minutes: 1440 },
        }),
      );
    });

    it('should include reply params when replyToId provided', async () => {
      await service.initialize();
      await service.postTweet({ text: 'Reply', replyToId: 'orig-1' });

      expect(mockV2.tweet).toHaveBeenCalledWith({
        text: 'Reply',
        reply: { in_reply_to_tweet_id: 'orig-1' },
      });
    });

    it('should include quote_tweet_id when quoteTweetId provided', async () => {
      await service.initialize();
      await service.postTweet({ text: 'Quote', quoteTweetId: 'qt-1' });

      expect(mockV2.tweet).toHaveBeenCalledWith({
        text: 'Quote',
        quote_tweet_id: 'qt-1',
      });
    });
  });

  describe('postThread', () => {
    it('should chain postTweet calls with reply IDs', async () => {
      await service.initialize();
      const results = await service.postThread(['First', 'Second', 'Third']);

      expect(results).toHaveLength(3);
      // First call: no replyToId
      expect(mockV2.tweet).toHaveBeenNthCalledWith(1, { text: 'First' });
      // Subsequent calls: replyToId from previous tweet
      expect(mockV2.tweet).toHaveBeenNthCalledWith(2, {
        text: 'Second',
        reply: { in_reply_to_tweet_id: 'tw-1' },
      });
      expect(mockV2.tweet).toHaveBeenNthCalledWith(3, {
        text: 'Third',
        reply: { in_reply_to_tweet_id: 'tw-1' },
      });
    });
  });

  describe('like / unlike', () => {
    it('should call v2.like with user ID and tweet ID', async () => {
      await service.initialize();
      await service.like('tweet-42');

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.like).toHaveBeenCalledWith('1', 'tweet-42');
    });

    it('should call v2.unlike with user ID and tweet ID', async () => {
      await service.initialize();
      await service.unlike('tweet-42');

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.unlike).toHaveBeenCalledWith('1', 'tweet-42');
    });
  });

  describe('retweet / unretweet', () => {
    it('should call v2.retweet with user ID and tweet ID', async () => {
      await service.initialize();
      await service.retweet('tweet-55');

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.retweet).toHaveBeenCalledWith('1', 'tweet-55');
    });

    it('should call v2.unretweet with user ID and tweet ID', async () => {
      await service.initialize();
      await service.unretweet('tweet-55');

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.unretweet).toHaveBeenCalledWith('1', 'tweet-55');
    });
  });

  describe('search', () => {
    it('should call v2.search with query and options', async () => {
      await service.initialize();
      const results = await service.search({ query: 'AI agents', maxResults: 5 });

      expect(mockV2.search).toHaveBeenCalledWith('AI agents', {
        max_results: 5,
        sort_order: 'relevancy',
        'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
        start_time: undefined,
        end_time: undefined,
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('sr-1');
      expect(results[0].text).toBe('found tweet');
      expect(results[0].metrics?.likes).toBe(10);
      expect(results[0].metrics?.retweets).toBe(5);
      expect(results[0].metrics?.replies).toBe(2);
      expect(results[0].metrics?.impressions).toBe(1000);
    });

    it('should use default maxResults of 10 and sortOrder of relevancy', async () => {
      await service.initialize();
      await service.search({ query: 'test' });

      expect(mockV2.search).toHaveBeenCalledWith('test', expect.objectContaining({
        max_results: 10,
        sort_order: 'relevancy',
      }));
    });

    it('should pass sortOrder, startTime, and endTime when provided', async () => {
      await service.initialize();
      await service.search({
        query: 'news',
        sortOrder: 'recency',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-02T00:00:00Z',
      });

      expect(mockV2.search).toHaveBeenCalledWith('news', expect.objectContaining({
        sort_order: 'recency',
        start_time: '2024-01-01T00:00:00Z',
        end_time: '2024-01-02T00:00:00Z',
      }));
    });
  });

  describe('getTrending', () => {
    it('should call v1.trendsByPlace with default woeid 1', async () => {
      await service.initialize();
      const trends = await service.getTrending();

      expect(mockV1.trendsByPlace).toHaveBeenCalledWith(1);
      expect(trends).toHaveLength(2);
      expect(trends[0].name).toBe('#Trending1');
      expect(trends[0].tweetVolume).toBe(50000);
      expect(trends[1].tweetVolume).toBeNull();
    });

    it('should call v1.trendsByPlace with custom woeid', async () => {
      await service.initialize();
      await service.getTrending(23424977);

      expect(mockV1.trendsByPlace).toHaveBeenCalledWith(23424977);
    });
  });

  describe('getTimeline', () => {
    it('should call v2.homeTimeline with max_results', async () => {
      await service.initialize();
      const timeline = await service.getTimeline(10);

      expect(mockV2.me).toHaveBeenCalled();
      expect(mockV2.homeTimeline).toHaveBeenCalledWith({
        max_results: 10,
        'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      });
      expect(timeline).toHaveLength(1);
      expect(timeline[0].id).toBe('tl-1');
      expect(timeline[0].metrics?.likes).toBe(20);
    });

    it('should cap max_results at 100', async () => {
      await service.initialize();
      await service.getTimeline(200);

      expect(mockV2.homeTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ max_results: 100 }),
      );
    });

    it('should use default maxResults of 20', async () => {
      await service.initialize();
      await service.getTimeline();

      expect(mockV2.homeTimeline).toHaveBeenCalledWith(
        expect.objectContaining({ max_results: 20 }),
      );
    });
  });

  describe('sendDm', () => {
    it('should call v2.sendDmInConversation with recipient and text', async () => {
      await service.initialize();
      const result = await service.sendDm('user-42', 'Hello DM');

      expect(mockV2.sendDmInConversation).toHaveBeenCalledWith('user-42', { text: 'Hello DM' });
      expect(result.eventId).toBe('dm-evt-1');
    });
  });

  describe('getTweetMetrics', () => {
    it('should call v2.singleTweet and return formatted metrics', async () => {
      await service.initialize();
      const result = await service.getTweetMetrics('tw-99');

      expect(mockV2.singleTweet).toHaveBeenCalledWith('tw-99', {
        'tweet.fields': ['created_at', 'author_id', 'public_metrics'],
      });
      expect(result).not.toBeNull();
      expect(result!.id).toBe('tw-99');
      expect(result!.metrics?.likes).toBe(100);
      expect(result!.metrics?.retweets).toBe(50);
      expect(result!.metrics?.replies).toBe(25);
      expect(result!.metrics?.impressions).toBe(5000);
    });

    it('should return null when tweet data is missing', async () => {
      mockV2.singleTweet.mockResolvedValueOnce({ data: null });
      await service.initialize();
      const result = await service.getTweetMetrics('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('uploadMedia', () => {
    it('should call v1.uploadMedia with filePath and mimeType', async () => {
      await service.initialize();
      const mediaId = await service.uploadMedia('/tmp/photo.jpg', 'image/jpeg');

      expect(mockV1.uploadMedia).toHaveBeenCalledWith('/tmp/photo.jpg', { mimeType: 'image/jpeg' });
      expect(mediaId).toBe('media-id-123');
    });
  });

  describe('getMe', () => {
    it('should return the authenticated user info', async () => {
      await service.initialize();
      const me = await service.getMe();

      expect(mockV2.me).toHaveBeenCalled();
      expect(me).toEqual({ id: '1', name: 'Test', username: 'test' });
    });
  });

  describe('requireReadClient', () => {
    it('should throw when service is not initialized', async () => {
      // search requires read client internally
      await expect(service.search({ query: 'test' })).rejects.toThrow(
        'Twitter service not initialized',
      );
    });
  });

  describe('requireWriteClient', () => {
    it('should throw when no OAuth credentials provided', async () => {
      const readOnlyService = new TwitterService(READONLY_CONFIG);
      await readOnlyService.initialize();

      await expect(readOnlyService.postTweet({ text: 'test' })).rejects.toThrow(
        /OAuth 1\.0a credentials/,
      );
    });

    it('should throw when service is not initialized (write client is null)', async () => {
      // postTweet requires write client internally
      await expect(service.postTweet({ text: 'test' })).rejects.toThrow(
        /OAuth 1\.0a credentials/,
      );
    });
  });
});
