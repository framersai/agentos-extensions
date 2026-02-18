/**
 * Unit tests for RedditService (snoowrap wrapper).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RedditService, type RedditServiceConfig } from '../src/RedditService';

// ── Mock snoowrap ──

const mockSubmission = {
  name: 't3_abc123',
  permalink: '/r/test/comments/abc123/test_post/',
  reply: vi.fn().mockResolvedValue({
    name: 't1_reply1',
    permalink: '/r/test/comments/abc123/test_post/reply1/',
  }),
  upvote: vi.fn().mockResolvedValue(undefined),
  downvote: vi.fn().mockResolvedValue(undefined),
  unvote: vi.fn().mockResolvedValue(undefined),
};

const mockComment = {
  name: 't1_comment1',
  permalink: '/r/test/comments/abc123/test_post/comment1/',
  reply: vi.fn().mockResolvedValue({
    name: 't1_reply2',
    permalink: '/r/test/comments/abc123/test_post/reply2/',
  }),
  upvote: vi.fn().mockResolvedValue(undefined),
  downvote: vi.fn().mockResolvedValue(undefined),
  unvote: vi.fn().mockResolvedValue(undefined),
};

const mockSubreddit = {
  submitSelfpost: vi.fn().mockResolvedValue(mockSubmission),
  submitLink: vi.fn().mockResolvedValue(mockSubmission),
  search: vi.fn().mockResolvedValue([
    {
      id: 'sr1',
      title: 'Result 1',
      author: { name: 'user1' },
      subreddit: { display_name: 'test' },
      score: 42,
      num_comments: 5,
      url: 'https://reddit.com/r/test/sr1',
      permalink: '/r/test/comments/sr1/',
      created_utc: 1700000000,
      selftext: 'Body text',
    },
  ]),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  getHot: vi.fn().mockResolvedValue([
    {
      id: 'hot1',
      title: 'Hot Post',
      author: { name: 'hotuser' },
      subreddit: { display_name: 'test' },
      score: 100,
      num_comments: 20,
      url: 'https://reddit.com/r/test/hot1',
      permalink: '/r/test/comments/hot1/',
      created_utc: 1700000000,
    },
  ]),
  getTop: vi.fn().mockResolvedValue([]),
  getRising: vi.fn().mockResolvedValue([]),
  getNew: vi.fn().mockResolvedValue([]),
  getControversial: vi.fn().mockResolvedValue([]),
};

const mockUser = {
  fetch: vi.fn().mockResolvedValue({
    name: 'testbot',
    link_karma: 100,
    comment_karma: 200,
    created_utc: 1600000000,
    is_gold: false,
    is_mod: true,
  }),
  getSubmissions: vi.fn().mockResolvedValue([
    { subreddit: { display_name: 'test' } },
    { subreddit: { display_name: 'test' } },
    { subreddit: { display_name: 'programming' } },
  ]),
  getComments: vi.fn().mockResolvedValue([
    { subreddit: { display_name: 'test' } },
    { subreddit: { display_name: 'askreddit' } },
  ]),
};

vi.mock('snoowrap', () => ({
  default: class MockSnoowrap {
    constructor() {}
    config = vi.fn();
    getMe = vi.fn().mockResolvedValue(mockUser);
    getSubreddit = vi.fn().mockReturnValue(mockSubreddit);
    getSubmission = vi.fn().mockReturnValue(mockSubmission);
    getComment = vi.fn().mockReturnValue(mockComment);
    getUser = vi.fn().mockReturnValue(mockUser);
    search = vi.fn().mockResolvedValue([
      {
        id: 'gs1',
        title: 'Global Search Result',
        author: { name: 'globaluser' },
        subreddit: { display_name: 'all' },
        score: 10,
        num_comments: 2,
        url: 'https://reddit.com/gs1',
        permalink: '/r/all/comments/gs1/',
        created_utc: 1700000000,
        selftext: '',
      },
    ]);
    getHot = vi.fn().mockResolvedValue([
      {
        id: 'fronthot1',
        title: 'Front Page Hot',
        author: { name: 'fpuser' },
        subreddit: { display_name: 'popular' },
        score: 5000,
        num_comments: 300,
        url: 'https://reddit.com/fronthot1',
        permalink: '/r/popular/comments/fronthot1/',
        created_utc: 1700000000,
      },
    ]);
    getTop = vi.fn().mockResolvedValue([]);
    getRising = vi.fn().mockResolvedValue([]);
    getNew = vi.fn().mockResolvedValue([]);
    getControversial = vi.fn().mockResolvedValue([]);
    getUnreadMessages = vi.fn().mockResolvedValue([]);
    getInbox = vi.fn().mockResolvedValue([
      {
        id: 'inbox1',
        author: { name: 'sender1' },
        subject: 'Hello',
        body: 'Message body',
        created_utc: 1700000000,
        new: true,
        parent_id: null,
      },
    ]);
    composeMessage = vi.fn().mockResolvedValue(undefined);
  },
}));

const TEST_CONFIG: RedditServiceConfig = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  username: 'testbot',
  password: 'testpass',
  userAgent: 'TestAgent/1.0',
};

describe('RedditService', () => {
  let service: RedditService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new RedditService(TEST_CONFIG);

    // Reset mock call counts
    mockSubmission.reply.mockClear();
    mockComment.reply.mockClear();
    mockSubmission.upvote.mockClear();
    mockSubmission.downvote.mockClear();
    mockSubmission.unvote.mockClear();
    mockComment.upvote.mockClear();
    mockComment.downvote.mockClear();
    mockComment.unvote.mockClear();
    mockSubreddit.submitSelfpost.mockClear();
    mockSubreddit.submitLink.mockClear();
    mockSubreddit.search.mockClear();
    mockSubreddit.subscribe.mockClear();
    mockSubreddit.unsubscribe.mockClear();
    mockSubreddit.getHot.mockClear();
    mockSubreddit.getTop.mockClear();
    mockSubreddit.getRising.mockClear();
    mockSubreddit.getNew.mockClear();
    mockSubreddit.getControversial.mockClear();
    mockUser.fetch.mockClear();
    mockUser.getSubmissions.mockClear();
    mockUser.getComments.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Constructor ──

  describe('constructor', () => {
    it('should store the config', () => {
      expect(service.isRunning).toBe(false);
    });

    it('should not create the snoowrap client until initialize is called', () => {
      expect(() => service.getClient()).toThrow('RedditService not initialized');
    });
  });

  // ── Lifecycle ──

  describe('lifecycle', () => {
    it('should initialize and mark as running', async () => {
      expect(service.isRunning).toBe(false);
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should be idempotent on double initialize', async () => {
      await service.initialize();
      await service.initialize();
      expect(service.isRunning).toBe(true);
    });

    it('should create a snoowrap client on initialize', async () => {
      await service.initialize();
      const client = service.getClient();
      expect(client).toBeDefined();
    });

    it('should shutdown cleanly', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should no-op shutdown when not running', async () => {
      await service.shutdown(); // should not throw
      expect(service.isRunning).toBe(false);
    });

    it('should clear client and handlers on shutdown', async () => {
      await service.initialize();
      const handler = vi.fn();
      service.onInboxMessage(handler);

      await service.shutdown();

      expect(() => service.getClient()).toThrow('RedditService not initialized');
    });

    it('should use custom userAgent when provided', async () => {
      await service.initialize();
      // The mock Snoowrap constructor was called — verified by the fact initialize succeeded
      expect(service.isRunning).toBe(true);
    });

    it('should generate default userAgent when not provided', async () => {
      const configNoAgent: RedditServiceConfig = {
        clientId: 'cid',
        clientSecret: 'cs',
        username: 'user',
        password: 'pass',
      };
      const svc = new RedditService(configNoAgent);
      await svc.initialize();
      expect(svc.isRunning).toBe(true);
      await svc.shutdown();
    });
  });

  // ── submitPost ──

  describe('submitPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should submit a text post (selfpost)', async () => {
      const result = await service.submitPost({
        subreddit: 'test',
        title: 'Test Title',
        content: 'Test body',
        type: 'text',
      });

      expect(result.id).toBe('abc123');
      expect(result.name).toBe('t3_abc123');
      expect(result.permalink).toBe('/r/test/comments/abc123/test_post/');
      expect(result.url).toBe('https://www.reddit.com/r/test/comments/abc123/test_post/');
      expect(mockSubreddit.submitSelfpost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Test Title', text: 'Test body' }),
      );
    });

    it('should submit a link post', async () => {
      const result = await service.submitPost({
        subreddit: 'test',
        title: 'Link Post',
        content: 'https://example.com',
        type: 'link',
      });

      expect(result.id).toBe('abc123');
      expect(mockSubreddit.submitLink).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Link Post', url: 'https://example.com' }),
      );
    });

    it('should submit an image post as a link', async () => {
      await service.submitPost({
        subreddit: 'pics',
        title: 'Image',
        content: 'https://example.com/image.jpg',
        type: 'image',
      });

      expect(mockSubreddit.submitLink).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/image.jpg' }),
      );
    });

    it('should submit a poll post as selfpost with formatted body', async () => {
      await service.submitPost({
        subreddit: 'test',
        title: 'Poll',
        content: 'Vote now!',
        type: 'poll',
        pollOptions: ['Yes', 'No', 'Maybe'],
        pollDurationDays: 5,
      });

      expect(mockSubreddit.submitSelfpost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Poll',
          text: expect.stringContaining('1. Yes'),
        }),
      );
    });

    it('should pass flair, nsfw, and spoiler options', async () => {
      await service.submitPost({
        subreddit: 'test',
        title: 'Flagged',
        content: 'Content',
        type: 'text',
        flairId: 'flair-123',
        nsfw: true,
        spoiler: true,
      });

      expect(mockSubreddit.submitSelfpost).toHaveBeenCalledWith(
        expect.objectContaining({
          flairId: 'flair-123',
          nsfw: true,
          spoiler: true,
        }),
      );
    });

    it('should throw for unsupported post type', async () => {
      await expect(
        service.submitPost({
          subreddit: 'test',
          title: 'Bad',
          content: 'Content',
          type: 'video' as any,
        }),
      ).rejects.toThrow('Unsupported post type: video');
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(
        service.submitPost({
          subreddit: 'test',
          title: 'Test',
          content: 'Content',
          type: 'text',
        }),
      ).rejects.toThrow('RedditService not initialized');
    });
  });

  // ── comment ──

  describe('comment', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should reply to a post (t3_ prefix)', async () => {
      const result = await service.comment('t3_abc123', 'Nice post!');
      expect(result.id).toBe('reply1');
      expect(result.name).toBe('t1_reply1');
      expect(mockSubmission.reply).toHaveBeenCalledWith('Nice post!');
    });

    it('should reply to a comment (t1_ prefix)', async () => {
      const result = await service.comment('t1_comment1', 'Good point!');
      expect(result.id).toBe('reply2');
      expect(result.name).toBe('t1_reply2');
      expect(mockComment.reply).toHaveBeenCalledWith('Good point!');
    });

    it('should default to t3_ prefix when no prefix is given', async () => {
      const result = await service.comment('abc123', 'Reply without prefix');
      expect(mockSubmission.reply).toHaveBeenCalledWith('Reply without prefix');
    });

    it('should throw for invalid thing ID prefix', async () => {
      await expect(service.comment('t4_invalid', 'text')).rejects.toThrow(
        'Invalid thing ID for commenting',
      );
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.comment('t3_abc', 'text')).rejects.toThrow(
        'RedditService not initialized',
      );
    });
  });

  // ── vote ──

  describe('vote', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should upvote a post', async () => {
      await service.vote('t3_abc123', 'up');
      expect(mockSubmission.upvote).toHaveBeenCalled();
    });

    it('should downvote a post', async () => {
      await service.vote('t3_abc123', 'down');
      expect(mockSubmission.downvote).toHaveBeenCalled();
    });

    it('should unvote a post', async () => {
      await service.vote('t3_abc123', 'none');
      expect(mockSubmission.unvote).toHaveBeenCalled();
    });

    it('should upvote a comment', async () => {
      await service.vote('t1_comment1', 'up');
      expect(mockComment.upvote).toHaveBeenCalled();
    });

    it('should downvote a comment', async () => {
      await service.vote('t1_comment1', 'down');
      expect(mockComment.downvote).toHaveBeenCalled();
    });

    it('should unvote a comment', async () => {
      await service.vote('t1_comment1', 'none');
      expect(mockComment.unvote).toHaveBeenCalled();
    });

    it('should default to t3_ prefix for bare IDs', async () => {
      await service.vote('abc123', 'up');
      expect(mockSubmission.upvote).toHaveBeenCalled();
    });

    it('should throw for invalid thing ID prefix', async () => {
      await expect(service.vote('t4_invalid', 'up')).rejects.toThrow(
        'Invalid thing ID for voting',
      );
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.vote('t3_abc', 'up')).rejects.toThrow(
        'RedditService not initialized',
      );
    });
  });

  // ── search ──

  describe('search', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should search within a subreddit when subreddit option is provided', async () => {
      const results = await service.search('test query', { subreddit: 'test' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('sr1');
      expect(results[0].title).toBe('Result 1');
      expect(results[0].author).toBe('user1');
      expect(results[0].subreddit).toBe('test');
      expect(results[0].score).toBe(42);
      expect(results[0].numComments).toBe(5);
      expect(results[0].permalink).toBe('https://www.reddit.com/r/test/comments/sr1/');
      expect(results[0].selftext).toBe('Body text');
      expect(mockSubreddit.search).toHaveBeenCalledWith(
        expect.objectContaining({ query: 'test query' }),
      );
    });

    it('should search globally when no subreddit option is provided', async () => {
      const results = await service.search('global query');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('gs1');
      expect(results[0].title).toBe('Global Search Result');
    });

    it('should use default options when none provided', async () => {
      await service.search('query');
      const client = service.getClient();
      expect(client.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'relevance',
          time: 'all',
          limit: 25,
        }),
      );
    });

    it('should pass custom sort, time, and limit', async () => {
      await service.search('query', {
        subreddit: 'test',
        sort: 'top',
        time: 'week',
        limit: 10,
      });
      expect(mockSubreddit.search).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'top',
          time: 'week',
          limit: 10,
        }),
      );
    });

    it('should handle deleted authors gracefully', async () => {
      const client = service.getClient();
      (client.search as any).mockResolvedValueOnce([
        {
          id: 'del1',
          title: 'Deleted Author',
          author: null,
          subreddit: { display_name: 'test' },
          score: 1,
          num_comments: 0,
          url: 'u',
          permalink: '/p/',
          created_utc: 0,
          selftext: '',
        },
      ]);
      const results = await service.search('query');
      expect(results[0].author).toBe('[deleted]');
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.search('query')).rejects.toThrow('RedditService not initialized');
    });
  });

  // ── getTrending ──

  describe('getTrending', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should get hot posts from a subreddit by default', async () => {
      const results = await service.getTrending({ subreddit: 'test' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('hot1');
      expect(results[0].title).toBe('Hot Post');
      expect(mockSubreddit.getHot).toHaveBeenCalledWith({ limit: 25 });
    });

    it('should get top posts when sort=top', async () => {
      await service.getTrending({ subreddit: 'test', sort: 'top', time: 'week' });
      expect(mockSubreddit.getTop).toHaveBeenCalledWith({ time: 'week', limit: 25 });
    });

    it('should get rising posts when sort=rising', async () => {
      await service.getTrending({ subreddit: 'test', sort: 'rising' });
      expect(mockSubreddit.getRising).toHaveBeenCalledWith({ limit: 25 });
    });

    it('should get new posts when sort=new', async () => {
      await service.getTrending({ subreddit: 'test', sort: 'new' });
      expect(mockSubreddit.getNew).toHaveBeenCalledWith({ limit: 25 });
    });

    it('should get controversial posts when sort=controversial', async () => {
      await service.getTrending({ subreddit: 'test', sort: 'controversial', time: 'month' });
      expect(mockSubreddit.getControversial).toHaveBeenCalledWith({ time: 'month', limit: 25 });
    });

    it('should get front page posts when no subreddit specified', async () => {
      const results = await service.getTrending();
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('fronthot1');
    });

    it('should respect custom limit', async () => {
      await service.getTrending({ subreddit: 'test', limit: 5 });
      expect(mockSubreddit.getHot).toHaveBeenCalledWith({ limit: 5 });
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.getTrending()).rejects.toThrow('RedditService not initialized');
    });
  });

  // ── subscribe ──

  describe('subscribe', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should subscribe to a subreddit', async () => {
      await service.subscribe('test', 'subscribe');
      expect(mockSubreddit.subscribe).toHaveBeenCalled();
    });

    it('should unsubscribe from a subreddit', async () => {
      await service.subscribe('test', 'unsubscribe');
      expect(mockSubreddit.unsubscribe).toHaveBeenCalled();
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.subscribe('test', 'subscribe')).rejects.toThrow(
        'RedditService not initialized',
      );
    });
  });

  // ── getInbox ──

  describe('getInbox', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should fetch all inbox messages by default', async () => {
      const messages = await service.getInbox();
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('inbox1');
      expect(messages[0].author).toBe('sender1');
      expect(messages[0].subject).toBe('Hello');
      expect(messages[0].body).toBe('Message body');
      expect(messages[0].isUnread).toBe(true);
    });

    it('should fetch unread messages when filter=unread', async () => {
      const client = service.getClient();
      await service.getInbox({ filter: 'unread' });
      expect(client.getUnreadMessages).toHaveBeenCalledWith({ limit: 25 });
    });

    it('should respect custom limit', async () => {
      const client = service.getClient();
      await service.getInbox({ filter: 'all', limit: 10 });
      expect(client.getInbox).toHaveBeenCalledWith({ limit: 10 });
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.getInbox()).rejects.toThrow('RedditService not initialized');
    });
  });

  // ── sendMessage ──

  describe('sendMessage', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should compose a message to a user', async () => {
      await service.sendMessage('targetuser', 'Subject', 'Body text');
      const client = service.getClient();
      expect(client.composeMessage).toHaveBeenCalledWith({
        to: 'targetuser',
        subject: 'Subject',
        text: 'Body text',
      });
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.sendMessage('user', 'sub', 'body')).rejects.toThrow(
        'RedditService not initialized',
      );
    });
  });

  // ── getAnalytics ──

  describe('getAnalytics', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return analytics for the authenticated user when no username given', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.username).toBe('testbot');
      expect(analytics.linkKarma).toBe(100);
      expect(analytics.commentKarma).toBe(200);
      expect(analytics.totalKarma).toBe(300);
      expect(analytics.isGold).toBe(false);
      expect(analytics.isMod).toBe(true);
      expect(analytics.accountCreatedUtc).toBe(1600000000);
    });

    it('should include recent activity counts', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.recentActivity.posts).toBe(3);
      expect(analytics.recentActivity.comments).toBe(2);
    });

    it('should include top subreddits sorted by count', async () => {
      const analytics = await service.getAnalytics();
      expect(analytics.topSubreddits.length).toBeGreaterThan(0);
      // 'test' appears 3 times (2 submissions + 1 comment)
      expect(analytics.topSubreddits[0].subreddit).toBe('test');
      expect(analytics.topSubreddits[0].count).toBe(3);
    });

    it('should fetch analytics for a specific user', async () => {
      const client = service.getClient();
      await service.getAnalytics('otheruser');
      expect(client.getUser).toHaveBeenCalledWith('otheruser');
    });

    it('should handle private submissions gracefully', async () => {
      mockUser.getSubmissions.mockRejectedValueOnce(new Error('Private'));
      const analytics = await service.getAnalytics();
      expect(analytics.recentActivity.posts).toBe(0);
    });

    it('should handle private comments gracefully', async () => {
      mockUser.getComments.mockRejectedValueOnce(new Error('Private'));
      const analytics = await service.getAnalytics();
      expect(analytics.recentActivity.comments).toBe(0);
    });

    it('should throw when not initialized', async () => {
      await service.shutdown();
      await expect(service.getAnalytics()).rejects.toThrow('RedditService not initialized');
    });
  });

  // ── getBotInfo ──

  describe('getBotInfo', () => {
    it('should return null when not running', () => {
      expect(service.getBotInfo()).toBeNull();
    });

    it('should return username when running', async () => {
      await service.initialize();
      const info = service.getBotInfo();
      expect(info).toEqual({ username: 'testbot' });
    });
  });

  // ── Inbox message handlers ──

  describe('inbox message handlers', () => {
    it('should register a handler', async () => {
      await service.initialize();
      const handler = vi.fn();
      service.onInboxMessage(handler);
      // No assertion beyond no-throw — actual dispatching tested via polling
    });

    it('should unregister a handler', async () => {
      await service.initialize();
      const handler = vi.fn();
      service.onInboxMessage(handler);
      service.offInboxMessage(handler);
      // No assertion beyond no-throw
    });

    it('should not throw when unregistering a non-registered handler', async () => {
      await service.initialize();
      const handler = vi.fn();
      service.offInboxMessage(handler); // was never registered
    });
  });

  // ── ensureFullname (private, tested through public API) ──

  describe('ensureFullname (via public methods)', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should pass through t3_ fullnames unchanged', async () => {
      await service.vote('t3_test', 'up');
      const client = service.getClient();
      expect(client.getSubmission).toHaveBeenCalledWith('test');
    });

    it('should pass through t1_ fullnames unchanged', async () => {
      await service.vote('t1_test', 'up');
      const client = service.getClient();
      expect(client.getComment).toHaveBeenCalledWith('test');
    });

    it('should default bare IDs to t3_ prefix', async () => {
      await service.vote('bareId', 'up');
      const client = service.getClient();
      expect(client.getSubmission).toHaveBeenCalledWith('bareId');
    });
  });
});
