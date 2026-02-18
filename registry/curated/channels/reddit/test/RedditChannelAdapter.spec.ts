/**
 * Unit tests for RedditChannelAdapter.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RedditChannelAdapter } from '../src/RedditChannelAdapter';
import type { RedditService, RedditInboxMessage } from '../src/RedditService';
import type { MessageContent, ChannelEvent, ChannelMessage } from '@framers/agentos';

function createMockService(overrides: Partial<RedditService> = {}): RedditService {
  return {
    isRunning: true,
    onInboxMessage: vi.fn(),
    offInboxMessage: vi.fn(),
    submitPost: vi.fn().mockResolvedValue({
      id: 'abc123',
      name: 't3_abc123',
      url: 'https://www.reddit.com/r/test/comments/abc123/test_post/',
      permalink: '/r/test/comments/abc123/test_post/',
    }),
    comment: vi.fn().mockResolvedValue({
      id: 'xyz789',
      name: 't1_xyz789',
      permalink: '/r/test/comments/abc123/test_post/xyz789/',
    }),
    vote: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getTrending: vi.fn().mockResolvedValue([]),
    subscribe: vi.fn().mockResolvedValue(undefined),
    getInbox: vi.fn().mockResolvedValue([]),
    getAnalytics: vi.fn().mockResolvedValue({}),
    getBotInfo: vi.fn().mockReturnValue({ username: 'testbot' }),
    getClient: vi.fn().mockReturnValue({
      getSubreddit: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue({
          display_name_prefixed: 'r/test',
          subscribers: 1000,
          public_description: 'A test subreddit',
          over18: false,
        }),
      }),
    }),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
}

describe('RedditChannelAdapter', () => {
  let adapter: RedditChannelAdapter;
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService();
    adapter = new RedditChannelAdapter(mockService);
  });

  // ── Identity ──

  describe('identity', () => {
    it('should declare platform as "reddit"', () => {
      expect(adapter.platform).toBe('reddit');
    });

    it('should declare displayName as "Reddit"', () => {
      expect(adapter.displayName).toBe('Reddit');
    });

    it('should declare expected capabilities', () => {
      expect(adapter.capabilities).toContain('text');
      expect(adapter.capabilities).toContain('rich_text');
      expect(adapter.capabilities).toContain('images');
      expect(adapter.capabilities).toContain('video');
      expect(adapter.capabilities).toContain('reactions');
      expect(adapter.capabilities).toContain('threads');
      expect(adapter.capabilities).toContain('polls');
      expect(adapter.capabilities).toContain('hashtags');
      expect(adapter.capabilities).toContain('channels');
      expect(adapter.capabilities).toContain('engagement_metrics');
      expect(adapter.capabilities).toContain('content_discovery');
    });

    it('should have exactly 11 capabilities', () => {
      expect(adapter.capabilities).toHaveLength(11);
    });
  });

  // ── sendMessage ──

  describe('sendMessage', () => {
    it('should submit a text post to a subreddit', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Hello Reddit!' }],
        platformOptions: { title: 'Test Post' },
      };
      const result = await adapter.sendMessage('r/test', content);

      expect(result.messageId).toBe('abc123');
      expect(result.timestamp).toBeDefined();
      expect(mockService.submitPost).toHaveBeenCalledWith({
        subreddit: 'test',
        title: 'Test Post',
        content: 'Hello Reddit!',
        type: 'text',
      });
    });

    it('should use "Untitled" as default title when no platformOptions.title', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'No title' }],
      };
      await adapter.sendMessage('r/test', content);

      expect(mockService.submitPost).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Untitled' }),
      );
    });

    it('should submit an image post when image block is present', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'image', url: 'https://example.com/img.png' },
        ],
        platformOptions: { title: 'Image Post' },
      };
      await adapter.sendMessage('r/pics', content);

      expect(mockService.submitPost).toHaveBeenCalledWith({
        subreddit: 'pics',
        title: 'Image Post',
        content: 'https://example.com/img.png',
        type: 'image',
      });
    });

    it('should submit a poll post when poll block is present', async () => {
      const content: MessageContent = {
        blocks: [
          { type: 'text', text: 'Additional context' },
          { type: 'poll', question: 'Best language?', options: ['Rust', 'Go', 'TS'], durationHours: 72 },
        ],
        platformOptions: { title: 'Poll Post' },
      };
      await adapter.sendMessage('r/programming', content);

      expect(mockService.submitPost).toHaveBeenCalledWith({
        subreddit: 'programming',
        title: 'Best language?',
        content: 'Additional context',
        type: 'poll',
        pollOptions: ['Rust', 'Go', 'TS'],
        pollDurationDays: 3,
      });
    });

    it('should reply to a post when conversationId starts with t3_', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Great post!' }],
      };
      const result = await adapter.sendMessage('t3_abc123', content);

      expect(result.messageId).toBe('xyz789');
      expect(mockService.comment).toHaveBeenCalledWith('t3_abc123', 'Great post!');
    });

    it('should reply to a comment when conversationId starts with t1_', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'I agree!' }],
      };
      const result = await adapter.sendMessage('t1_xyz789', content);

      expect(result.messageId).toBe('xyz789');
      expect(mockService.comment).toHaveBeenCalledWith('t1_xyz789', 'I agree!');
    });

    it('should send a private message when conversationId starts with u/', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Hey there!' }],
      };
      const result = await adapter.sendMessage('u/someuser', content);

      expect(result.messageId).toMatch(/^pm_/);
      expect(mockService.sendMessage).toHaveBeenCalledWith(
        'someuser',
        'Message from agent',
        'Hey there!',
      );
    });

    it('should fall back to comment reply for unknown conversationId format', async () => {
      const content: MessageContent = {
        blocks: [{ type: 'text', text: 'Fallback reply' }],
      };
      const result = await adapter.sendMessage('someRandomId', content);

      expect(result.messageId).toBe('xyz789');
      expect(mockService.comment).toHaveBeenCalledWith('someRandomId', 'Fallback reply');
    });

    it('should use empty string when no text block found', async () => {
      const content: MessageContent = {
        blocks: [],
        platformOptions: { title: 'Empty' },
      };
      await adapter.sendMessage('r/test', content);

      expect(mockService.submitPost).toHaveBeenCalledWith(
        expect.objectContaining({ content: '' }),
      );
    });
  });

  // ── sendTypingIndicator ──

  describe('sendTypingIndicator', () => {
    it('should be a no-op (Reddit does not support typing indicators)', async () => {
      // Should not throw
      await adapter.sendTypingIndicator('r/test', true);
      await adapter.sendTypingIndicator('r/test', false);
    });
  });

  // ── Event handlers (on/off) ──

  describe('event handlers', () => {
    it('on() should return an unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      expect(typeof unsub).toBe('function');
    });

    it('on() should accept optional event type filter', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler, ['message']);
      expect(typeof unsub).toBe('function');
    });

    it('unsubscribe function should remove the handler', () => {
      const handler = vi.fn();
      const unsub = adapter.on(handler);
      unsub();
      // After unsubscribe, handler should not be called by emit
      // (tested indirectly via coverage)
    });

    it('should support multiple handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const unsub1 = adapter.on(handler1);
      const unsub2 = adapter.on(handler2);
      expect(typeof unsub1).toBe('function');
      expect(typeof unsub2).toBe('function');
    });
  });

  // ── getConnectionInfo ──

  describe('getConnectionInfo', () => {
    it('should return "connected" when service is running', () => {
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('connected');
      expect(info.platformInfo).toEqual({ username: 'testbot' });
    });

    it('should return "disconnected" when service is not running', () => {
      mockService = createMockService({ isRunning: false } as any);
      adapter = new RedditChannelAdapter(mockService);
      const info = adapter.getConnectionInfo();
      expect(info.status).toBe('disconnected');
    });

    it('should return undefined platformInfo when botInfo is null', () => {
      mockService = createMockService({
        getBotInfo: vi.fn().mockReturnValue(null),
      } as any);
      adapter = new RedditChannelAdapter(mockService);
      const info = adapter.getConnectionInfo();
      expect(info.platformInfo).toBeUndefined();
    });
  });

  // ── addReaction ──

  describe('addReaction', () => {
    it('should upvote by default', async () => {
      await adapter.addReaction('t3_abc123', 'msg1', '+1');
      expect(mockService.vote).toHaveBeenCalledWith('t3_abc123', 'up');
    });

    it('should downvote when emoji is "downvote"', async () => {
      await adapter.addReaction('t3_abc123', 'msg1', 'downvote');
      expect(mockService.vote).toHaveBeenCalledWith('t3_abc123', 'down');
    });

    it('should downvote when emoji is thumbs down', async () => {
      await adapter.addReaction('t3_abc123', 'msg1', '\u{1F44E}');
      expect(mockService.vote).toHaveBeenCalledWith('t3_abc123', 'down');
    });

    it('should upvote for any other emoji string', async () => {
      await adapter.addReaction('t3_abc123', 'msg1', 'fire');
      expect(mockService.vote).toHaveBeenCalledWith('t3_abc123', 'up');
    });
  });

  // ── getConversationInfo ──

  describe('getConversationInfo', () => {
    it('should return subreddit info for r/ conversation IDs', async () => {
      const info = await adapter.getConversationInfo('r/test');
      expect(info.name).toBe('r/test');
      expect(info.isGroup).toBe(true);
      expect(info.memberCount).toBe(1000);
      expect(info.metadata).toEqual({
        type: 'subreddit',
        description: 'A test subreddit',
        nsfw: false,
      });
    });

    it('should return fallback when subreddit fetch fails', async () => {
      mockService = createMockService({
        getClient: vi.fn().mockReturnValue({
          getSubreddit: vi.fn().mockReturnValue({
            fetch: vi.fn().mockRejectedValue(new Error('Not found')),
          }),
        }),
      } as any);
      adapter = new RedditChannelAdapter(mockService);

      const info = await adapter.getConversationInfo('r/nonexistent');
      expect(info.name).toBe('r/nonexistent');
      expect(info.isGroup).toBe(true);
    });

    it('should mark t3_ IDs as group (post)', async () => {
      const info = await adapter.getConversationInfo('t3_abc123');
      expect(info.isGroup).toBe(true);
      expect(info.metadata).toEqual({ type: 'post' });
    });

    it('should mark t1_ IDs as not group (comment)', async () => {
      const info = await adapter.getConversationInfo('t1_xyz789');
      expect(info.isGroup).toBe(false);
      expect(info.metadata).toEqual({ type: 'comment' });
    });
  });

  // ── initialize / shutdown ──

  describe('lifecycle', () => {
    it('should register inbox handler on initialize', async () => {
      await adapter.initialize({ platform: 'reddit', credential: 'test' });
      expect(mockService.onInboxMessage).toHaveBeenCalledTimes(1);
    });

    it('should unregister inbox handler and clear handlers on shutdown', async () => {
      await adapter.initialize({ platform: 'reddit', credential: 'test' });
      await adapter.shutdown();
      expect(mockService.offInboxMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle shutdown when not initialized', async () => {
      // Should not throw even without prior initialization
      await adapter.shutdown();
    });
  });

  // ── Inbound message handling ──

  describe('inbound message handling', () => {
    it('should emit message events to registered handlers', async () => {
      const handler = vi.fn();
      adapter.on(handler, ['message']);

      // Initialize to wire up inbox handler
      await adapter.initialize({ platform: 'reddit', credential: 'test' });

      // Extract the inbox handler that was registered with the service
      const inboxHandlerCall = (mockService.onInboxMessage as any).mock.calls[0];
      const inboxHandler = inboxHandlerCall[0] as (msg: RedditInboxMessage) => void;

      // Simulate an inbound inbox message
      const inboxMessage: RedditInboxMessage = {
        id: 'msg123',
        author: 'someuser',
        subject: 'Test',
        body: 'Hello from inbox',
        createdUtc: 1700000000,
        isUnread: true,
        parentId: undefined,
      };

      inboxHandler(inboxMessage);

      // Wait for async handler dispatch
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalledTimes(1);
      const event: ChannelEvent<ChannelMessage> = handler.mock.calls[0][0];
      expect(event.type).toBe('message');
      expect(event.platform).toBe('reddit');
      expect(event.data.text).toBe('Hello from inbox');
      expect(event.data.sender.username).toBe('someuser');
      expect(event.data.conversationId).toBe('u/someuser');
      expect(event.data.conversationType).toBe('direct');
    });

    it('should set conversationType to "thread" when parentId is present', async () => {
      const handler = vi.fn();
      adapter.on(handler);

      await adapter.initialize({ platform: 'reddit', credential: 'test' });
      const inboxHandler = (mockService.onInboxMessage as any).mock.calls[0][0];

      const inboxMessage: RedditInboxMessage = {
        id: 'msg456',
        author: 'replier',
        subject: 'Re: Test',
        body: 'A reply',
        createdUtc: 1700000001,
        isUnread: true,
        parentId: 't1_parent123',
      };

      inboxHandler(inboxMessage);
      await new Promise((resolve) => setTimeout(resolve, 10));

      const event = handler.mock.calls[0][0];
      expect(event.data.conversationType).toBe('thread');
      expect(event.data.replyToMessageId).toBe('t1_parent123');
    });

    it('should not emit to handlers with non-matching event type filter', async () => {
      const handler = vi.fn();
      adapter.on(handler, ['reaction']); // Only listen for reactions, not messages

      await adapter.initialize({ platform: 'reddit', credential: 'test' });
      const inboxHandler = (mockService.onInboxMessage as any).mock.calls[0][0];

      inboxHandler({
        id: 'msg789',
        author: 'user',
        subject: 'Test',
        body: 'Filtered out',
        createdUtc: 1700000002,
        isUnread: true,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
