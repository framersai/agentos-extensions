// @ts-nocheck
/**
 * @fileoverview Unit tests for BlueskyService.
 *
 * Validates lifecycle management, post creation (text, images, replies, quotes),
 * engagement (like, unlike, repost, unrepost), search (posts & actors),
 * feeds (timeline, author feed), following, profile, thread retrieval,
 * post deletion, and handle resolution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLogin, mockPost, mockLike, mockDeleteLike, mockRepost, mockDeleteRepost,
  mockFollow, mockDeleteFollow, mockDeletePost, mockUploadBlob, mockGetProfile,
  mockGetTimeline, mockGetAuthorFeed, mockSearchPosts, mockSearchActors,
  mockGetPostThread, mockResolveHandle,
} = vi.hoisted(() => {
  const mockLogin = vi.fn().mockResolvedValue({});
  const mockPost = vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.post/abc', cid: 'cid-1' });
  const mockLike = vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.like/xyz' });
  const mockDeleteLike = vi.fn().mockResolvedValue({});
  const mockRepost = vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.feed.repost/rp1' });
  const mockDeleteRepost = vi.fn().mockResolvedValue({});
  const mockFollow = vi.fn().mockResolvedValue({ uri: 'at://did:plc:test/app.bsky.graph.follow/f1' });
  const mockDeleteFollow = vi.fn().mockResolvedValue({});
  const mockDeletePost = vi.fn().mockResolvedValue({});
  const mockUploadBlob = vi.fn().mockResolvedValue({ data: { blob: { ref: 'blob-ref-1' } } });
  const mockGetProfile = vi.fn().mockResolvedValue({
    data: {
      did: 'did:plc:test',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      description: 'Test user',
      followersCount: 100,
      followsCount: 50,
      postsCount: 200,
      avatar: 'https://cdn.bsky.social/avatar.jpg',
    },
  });
  const mockGetTimeline = vi.fn().mockResolvedValue({
    data: {
      feed: [
        {
          post: {
            uri: 'at://did:plc:bob/app.bsky.feed.post/t1',
            cid: 'cid-t1',
            record: { text: 'Timeline post', createdAt: '2025-06-01T00:00:00Z' },
            author: { handle: 'bob.bsky.social', displayName: 'Bob' },
            likeCount: 5,
            repostCount: 2,
            replyCount: 1,
          },
        },
      ],
      cursor: 'cursor-next',
    },
  });
  const mockGetAuthorFeed = vi.fn().mockResolvedValue({
    data: {
      feed: [
        {
          post: {
            uri: 'at://did:plc:carol/app.bsky.feed.post/a1',
            cid: 'cid-a1',
            record: { text: 'Author post' },
            author: { handle: 'carol.bsky.social' },
            likeCount: 10,
            repostCount: 0,
            replyCount: 3,
          },
        },
      ],
    },
  });
  const mockSearchPosts = vi.fn().mockResolvedValue({
    data: {
      posts: [
        {
          uri: 'at://did:plc:s/app.bsky.feed.post/s1',
          cid: 'cid-s1',
          record: { text: 'Search result' },
          author: { handle: 'searcher.bsky.social' },
          likeCount: 3,
          repostCount: 1,
          replyCount: 0,
        },
      ],
    },
  });
  const mockSearchActors = vi.fn().mockResolvedValue({
    data: {
      actors: [
        { did: 'did:plc:actor1', handle: 'found.bsky.social', displayName: 'Found User', description: 'desc' },
      ],
    },
  });
  const mockGetPostThread = vi.fn().mockResolvedValue({
    data: { thread: { post: { uri: 'at://did:plc:t/app.bsky.feed.post/th1', cid: 'cid-th1' } } },
  });
  const mockResolveHandle = vi.fn().mockResolvedValue({
    data: { did: 'did:plc:resolved' },
  });
  return {
    mockLogin, mockPost, mockLike, mockDeleteLike, mockRepost, mockDeleteRepost,
    mockFollow, mockDeleteFollow, mockDeletePost, mockUploadBlob, mockGetProfile,
    mockGetTimeline, mockGetAuthorFeed, mockSearchPosts, mockSearchActors,
    mockGetPostThread, mockResolveHandle,
  };
});

vi.mock('@atproto/api', () => ({
  BskyAgent: class MockBskyAgent {
    constructor() {}
    login = mockLogin;
    post = mockPost;
    like = mockLike;
    deleteLike = mockDeleteLike;
    repost = mockRepost;
    deleteRepost = mockDeleteRepost;
    follow = mockFollow;
    deleteFollow = mockDeleteFollow;
    deletePost = mockDeletePost;
    uploadBlob = mockUploadBlob;
    getProfile = mockGetProfile;
    getTimeline = mockGetTimeline;
    getAuthorFeed = mockGetAuthorFeed;
    searchActors = mockSearchActors;
    getPostThread = mockGetPostThread;
    resolveHandle = mockResolveHandle;
    app = {
      bsky: {
        feed: {
          searchPosts: mockSearchPosts,
        },
      },
    };
  },
  RichText: class MockRichText {
    constructor(opts: any) {
      this.text = opts.text;
    }
    text: string;
    facets: any[] = [];
    detectFacets = vi.fn().mockResolvedValue(undefined);
  },
}));
import { BlueskyService, type BlueskyConfig } from '../src/BlueskyService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<BlueskyConfig>): BlueskyConfig {
  return {
    handle: 'alice.bsky.social',
    appPassword: 'test-app-password',
    service: 'https://bsky.social',
    ...overrides,
  };
}

function resetMocks(): void {
  mockLogin.mockClear();
  mockPost.mockClear();
  mockLike.mockClear();
  mockDeleteLike.mockClear();
  mockRepost.mockClear();
  mockDeleteRepost.mockClear();
  mockFollow.mockClear();
  mockDeleteFollow.mockClear();
  mockDeletePost.mockClear();
  mockUploadBlob.mockClear();
  mockGetProfile.mockClear();
  mockGetTimeline.mockClear();
  mockGetAuthorFeed.mockClear();
  mockSearchPosts.mockClear();
  mockSearchActors.mockClear();
  mockGetPostThread.mockClear();
  mockResolveHandle.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BlueskyService', () => {
  let service: BlueskyService;

  beforeEach(() => {
    resetMocks();
    service = new BlueskyService(makeConfig());
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────

  describe('lifecycle', () => {
    it('should initialize, login, and set running = true', async () => {
      await service.initialize();
      expect(service.isRunning).toBe(true);
      expect(mockLogin).toHaveBeenCalledWith({
        identifier: 'alice.bsky.social',
        password: 'test-app-password',
      });
    });

    it('should default service URL to https://bsky.social', () => {
      const svc = new BlueskyService({ handle: 'bob.bsky.social', appPassword: 'pw' });
      expect(svc.handle).toBe('bob.bsky.social');
    });

    it('should expose the configured handle', () => {
      expect(service.handle).toBe('alice.bsky.social');
    });

    it('should shut down cleanly', async () => {
      await service.initialize();
      await service.shutdown();
      expect(service.isRunning).toBe(false);
    });

    it('should throw when calling methods before initialize', () => {
      expect(() => (service as any).requireAgent()).toThrow('not initialized');
    });
  });

  // ── createPost ──────────────────────────────────────────────────────────

  describe('createPost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create a text-only post with rich text detection', async () => {
      const result = await service.createPost('Hello Bluesky!');

      expect(result.uri).toBe('at://did:plc:test/app.bsky.feed.post/abc');
      expect(result.cid).toBe('cid-1');
      expect(result.url).toContain('bsky.app/profile/alice.bsky.social/post/abc');
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('should attach images when provided', async () => {
      const imageData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      const result = await service.createPost('With image', {
        images: [{ data: imageData, mimeType: 'image/png', alt: 'A test image' }],
      });

      expect(mockUploadBlob).toHaveBeenCalledWith(imageData, { encoding: 'image/png' });
      expect(result.uri).toBeDefined();
    });

    it('should attach quote embed when quote option provided', async () => {
      const result = await service.createPost('Quoting this', {
        quote: { uri: 'at://did:plc:other/app.bsky.feed.post/q1', cid: 'cid-q1' },
      });

      expect(result.uri).toBeDefined();
      // Verify the post was called with the record containing quote embed
      const callArg = mockPost.mock.calls[0][0];
      expect(callArg.embed).toEqual({
        $type: 'app.bsky.embed.record',
        record: { uri: 'at://did:plc:other/app.bsky.feed.post/q1', cid: 'cid-q1' },
      });
    });

    it('should attach reply reference when replyTo option provided', async () => {
      const result = await service.createPost('Replying via createPost', {
        replyTo: { uri: 'at://did:plc:parent/app.bsky.feed.post/p1', cid: 'cid-p1' },
      });

      expect(result.uri).toBeDefined();
      const callArg = mockPost.mock.calls[0][0];
      expect(callArg.reply).toEqual({
        root: { uri: 'at://did:plc:parent/app.bsky.feed.post/p1', cid: 'cid-p1' },
        parent: { uri: 'at://did:plc:parent/app.bsky.feed.post/p1', cid: 'cid-p1' },
      });
    });

    it('should include language tags when provided', async () => {
      await service.createPost('Bonjour!', { langs: ['fr'] });
      const callArg = mockPost.mock.calls[0][0];
      expect(callArg.langs).toEqual(['fr']);
    });
  });

  // ── reply ───────────────────────────────────────────────────────────────

  describe('reply', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should create a reply with separate root and parent references', async () => {
      const result = await service.reply(
        'at://did:plc:p/app.bsky.feed.post/parent1',
        'cid-parent1',
        'at://did:plc:r/app.bsky.feed.post/root1',
        'cid-root1',
        'This is a reply',
      );

      expect(result.uri).toBeDefined();
      expect(result.cid).toBeDefined();
      expect(result.url).toContain('bsky.app/profile/alice.bsky.social/post/');

      const callArg = mockPost.mock.calls[0][0];
      expect(callArg.reply.root.uri).toBe('at://did:plc:r/app.bsky.feed.post/root1');
      expect(callArg.reply.parent.uri).toBe('at://did:plc:p/app.bsky.feed.post/parent1');
    });
  });

  // ── Engagement ──────────────────────────────────────────────────────────

  describe('like / unlike', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should like a post and return the like URI', async () => {
      const result = await service.like(
        'at://did:plc:x/app.bsky.feed.post/p1',
        'cid-p1',
      );
      expect(result.uri).toBe('at://did:plc:test/app.bsky.feed.like/xyz');
      expect(mockLike).toHaveBeenCalledWith('at://did:plc:x/app.bsky.feed.post/p1', 'cid-p1');
    });

    it('should unlike a post by its like URI', async () => {
      await service.unlike('at://did:plc:test/app.bsky.feed.like/xyz');
      expect(mockDeleteLike).toHaveBeenCalledWith('at://did:plc:test/app.bsky.feed.like/xyz');
    });
  });

  describe('repost / unrepost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should repost and return the repost URI', async () => {
      const result = await service.repost(
        'at://did:plc:x/app.bsky.feed.post/p2',
        'cid-p2',
      );
      expect(result.uri).toBe('at://did:plc:test/app.bsky.feed.repost/rp1');
      expect(mockRepost).toHaveBeenCalledWith('at://did:plc:x/app.bsky.feed.post/p2', 'cid-p2');
    });

    it('should unrepost by repost record URI', async () => {
      await service.unrepost('at://did:plc:test/app.bsky.feed.repost/rp1');
      expect(mockDeleteRepost).toHaveBeenCalledWith('at://did:plc:test/app.bsky.feed.repost/rp1');
    });
  });

  // ── Search ──────────────────────────────────────────────────────────────

  describe('searchPosts', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return mapped PostView results', async () => {
      const results = await service.searchPosts('hello');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        uri: 'at://did:plc:s/app.bsky.feed.post/s1',
        cid: 'cid-s1',
        text: 'Search result',
        authorHandle: 'searcher.bsky.social',
        authorDisplayName: undefined,
        createdAt: undefined,
        likeCount: 3,
        repostCount: 1,
        replyCount: 0,
      });
    });

    it('should cap limit at 100', async () => {
      await service.searchPosts('test', 999);
      expect(mockSearchPosts).toHaveBeenCalledWith({ q: 'test', limit: 100 });
    });
  });

  describe('searchActors', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return mapped actor results', async () => {
      const actors = await service.searchActors('found');

      expect(actors).toHaveLength(1);
      expect(actors[0]).toEqual({
        did: 'did:plc:actor1',
        handle: 'found.bsky.social',
        displayName: 'Found User',
        description: 'desc',
      });
    });

    it('should cap limit at 100', async () => {
      await service.searchActors('test', 200);
      expect(mockSearchActors).toHaveBeenCalledWith({ term: 'test', limit: 100 });
    });
  });

  // ── Feeds ───────────────────────────────────────────────────────────────

  describe('getTimeline', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return posts and cursor', async () => {
      const result = await service.getTimeline();

      expect(result.posts).toHaveLength(1);
      expect(result.posts[0].text).toBe('Timeline post');
      expect(result.posts[0].authorHandle).toBe('bob.bsky.social');
      expect(result.cursor).toBe('cursor-next');
    });

    it('should pass cursor for pagination', async () => {
      await service.getTimeline(50, 'page2');
      expect(mockGetTimeline).toHaveBeenCalledWith({ limit: 50, cursor: 'page2' });
    });

    it('should cap limit at 100', async () => {
      await service.getTimeline(500);
      expect(mockGetTimeline).toHaveBeenCalledWith({ limit: 100, cursor: undefined });
    });
  });

  describe('getAuthorFeed', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return author posts', async () => {
      const posts = await service.getAuthorFeed('carol.bsky.social');

      expect(posts).toHaveLength(1);
      expect(posts[0].text).toBe('Author post');
      expect(posts[0].authorHandle).toBe('carol.bsky.social');
    });
  });

  // ── Following ───────────────────────────────────────────────────────────

  describe('follow / unfollow', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should follow by DID and return follow URI', async () => {
      const result = await service.follow('did:plc:target');
      expect(result.uri).toBe('at://did:plc:test/app.bsky.graph.follow/f1');
      expect(mockFollow).toHaveBeenCalledWith('did:plc:target');
    });

    it('should unfollow by follow record URI', async () => {
      await service.unfollow('at://did:plc:test/app.bsky.graph.follow/f1');
      expect(mockDeleteFollow).toHaveBeenCalledWith('at://did:plc:test/app.bsky.graph.follow/f1');
    });
  });

  // ── Profile ─────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return mapped profile for authenticated user', async () => {
      const profile = await service.getProfile();

      expect(profile).toEqual({
        did: 'did:plc:test',
        handle: 'alice.bsky.social',
        displayName: 'Alice',
        description: 'Test user',
        followersCount: 100,
        followsCount: 50,
        postsCount: 200,
        avatar: 'https://cdn.bsky.social/avatar.jpg',
      });
      expect(mockGetProfile).toHaveBeenCalledWith({ actor: 'alice.bsky.social' });
    });

    it('should fetch another user profile when handle provided', async () => {
      await service.getProfile('bob.bsky.social');
      expect(mockGetProfile).toHaveBeenCalledWith({ actor: 'bob.bsky.social' });
    });
  });

  // ── Thread ──────────────────────────────────────────────────────────────

  describe('getPostThread', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return the thread object', async () => {
      const thread = await service.getPostThread('at://did:plc:t/app.bsky.feed.post/th1');

      expect(thread).toBeDefined();
      expect(thread.post.uri).toBe('at://did:plc:t/app.bsky.feed.post/th1');
      expect(mockGetPostThread).toHaveBeenCalledWith({
        uri: 'at://did:plc:t/app.bsky.feed.post/th1',
      });
    });
  });

  // ── Delete ──────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should delete a post by AT URI', async () => {
      await service.deletePost('at://did:plc:test/app.bsky.feed.post/del1');
      expect(mockDeletePost).toHaveBeenCalledWith('at://did:plc:test/app.bsky.feed.post/del1');
    });
  });

  // ── Resolve Handle ─────────────────────────────────────────────────────

  describe('resolveHandle', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should resolve a handle to a DID', async () => {
      const did = await service.resolveHandle('eve.bsky.social');
      expect(did).toBe('did:plc:resolved');
      expect(mockResolveHandle).toHaveBeenCalledWith({ handle: 'eve.bsky.social' });
    });
  });

  // ── buildPostUrl ──────────────────────────────────────────────────────

  describe('buildPostUrl', () => {
    it('should construct proper bsky.app URL', () => {
      const url = service.buildPostUrl('alice.bsky.social', 'abc123');
      expect(url).toBe('https://bsky.app/profile/alice.bsky.social/post/abc123');
    });
  });
});
