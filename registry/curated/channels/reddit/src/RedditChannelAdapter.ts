/**
 * @fileoverview IChannelAdapter implementation for Reddit via snoowrap.
 */

import type {
  IChannelAdapter,
  ChannelPlatform,
  ChannelCapability,
  ChannelAuthConfig,
  ChannelConnectionInfo,
  ChannelSendResult,
  MessageContent,
  ChannelEventHandler,
  ChannelEventType,
  ChannelEvent,
  ChannelMessage,
  RemoteUser,
  ConversationType,
} from '@framers/agentos';
import { RedditService, type RedditInboxMessage } from './RedditService';

export class RedditChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'reddit';
  readonly displayName = 'Reddit';
  readonly capabilities: readonly ChannelCapability[] = [
    'text',
    'rich_text',
    'images',
    'video',
    'reactions',
    'threads',
    'polls',
    'hashtags',
    'channels',
    'engagement_metrics',
    'content_discovery',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  private inboxHandler: ((message: RedditInboxMessage) => void) | null = null;

  constructor(private readonly service: RedditService) {}

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    this.inboxHandler = (message: RedditInboxMessage) => this.handleInboundMessage(message);
    this.service.onInboxMessage(this.inboxHandler);
  }

  async shutdown(): Promise<void> {
    if (this.inboxHandler) {
      this.service.offInboxMessage(this.inboxHandler);
      this.inboxHandler = null;
    }
    this.handlers.clear();
  }

  getConnectionInfo(): ChannelConnectionInfo {
    const botInfo = this.service.getBotInfo();
    return {
      status: this.service.isRunning ? 'connected' : 'disconnected',
      platformInfo: botInfo ? { username: botInfo.username } : undefined,
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const imageBlock = content.blocks.find((b) => b.type === 'image');
    const pollBlock = content.blocks.find((b) => b.type === 'poll');

    // Determine if this is a reply to a post/comment or a new submission
    // conversationId format: "r/{subreddit}" for new posts, "t3_{id}" or "t1_{id}" for replies
    const isReply = conversationId.startsWith('t1_') || conversationId.startsWith('t3_');
    const isSubreddit = conversationId.startsWith('r/');
    const isPrivateMessage = conversationId.startsWith('u/');

    if (isPrivateMessage) {
      // Send as private message
      const username = conversationId.replace('u/', '');
      const text = textBlock?.type === 'text' ? textBlock.text : '';
      await this.service.sendMessage(username, 'Message from agent', text);
      return {
        messageId: `pm_${Date.now()}`,
        timestamp: new Date().toISOString(),
      };
    }

    if (isReply) {
      // Reply to existing post or comment
      const text = textBlock?.type === 'text' ? textBlock.text : '';
      const result = await this.service.comment(conversationId, text);
      return {
        messageId: result.id,
        timestamp: new Date().toISOString(),
      };
    }

    if (isSubreddit) {
      // Submit new post to subreddit
      const subreddit = conversationId.replace('r/', '');
      const title = content.platformOptions?.title as string ?? 'Untitled';
      const text = textBlock?.type === 'text' ? textBlock.text : '';

      if (pollBlock && pollBlock.type === 'poll') {
        const result = await this.service.submitPost({
          subreddit,
          title: pollBlock.question ?? title,
          content: text,
          type: 'poll',
          pollOptions: pollBlock.options,
          pollDurationDays: pollBlock.durationHours ? Math.ceil(pollBlock.durationHours / 24) : 3,
        });
        return { messageId: result.id, timestamp: new Date().toISOString() };
      }

      if (imageBlock && imageBlock.type === 'image') {
        const result = await this.service.submitPost({
          subreddit,
          title,
          content: imageBlock.url,
          type: 'image',
        });
        return { messageId: result.id, timestamp: new Date().toISOString() };
      }

      const result = await this.service.submitPost({
        subreddit,
        title,
        content: text,
        type: 'text',
      });
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    // Fallback: treat as comment reply
    const text = textBlock?.type === 'text' ? textBlock.text : '';
    const result = await this.service.comment(conversationId, text);
    return { messageId: result.id, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Reddit does not support typing indicators — no-op
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async addReaction(conversationId: string, _messageId: string, emoji: string): Promise<void> {
    // Reddit "reactions" map to upvote/downvote
    const direction = emoji === 'downvote' || emoji === '👎' ? 'down' : 'up';
    await this.service.vote(conversationId, direction);
  }

  async getConversationInfo(conversationId: string): Promise<{
    name?: string;
    memberCount?: number;
    isGroup: boolean;
    metadata?: Record<string, unknown>;
  }> {
    // conversationId is typically a subreddit name or post/comment fullname
    const isSubreddit = conversationId.startsWith('r/');

    if (isSubreddit) {
      try {
        const client = this.service.getClient();
        const sub: any = await client.getSubreddit(conversationId.replace('r/', '')).fetch();
        return {
          name: sub.display_name_prefixed ?? conversationId,
          memberCount: sub.subscribers ?? undefined,
          isGroup: true,
          metadata: {
            type: 'subreddit',
            description: sub.public_description ?? '',
            nsfw: sub.over18 ?? false,
          },
        };
      } catch {
        return { name: conversationId, isGroup: true };
      }
    }

    return {
      name: conversationId,
      isGroup: conversationId.startsWith('t3_'),
      metadata: { type: conversationId.startsWith('t1_') ? 'comment' : 'post' },
    };
  }

  // -- Private --

  private handleInboundMessage(message: RedditInboxMessage): void {
    const sender: RemoteUser = {
      id: message.author,
      displayName: message.author,
      username: message.author,
    };

    const conversationType: ConversationType = message.parentId ? 'thread' : 'direct';

    const channelMessage: ChannelMessage = {
      messageId: message.id,
      platform: 'reddit',
      conversationId: `u/${message.author}`,
      conversationType,
      sender,
      content: [{ type: 'text', text: message.body }],
      text: message.body,
      timestamp: new Date(message.createdUtc * 1000).toISOString(),
      replyToMessageId: message.parentId ?? undefined,
      rawEvent: message,
    };

    const event: ChannelEvent<ChannelMessage> = {
      type: 'message',
      platform: 'reddit',
      conversationId: channelMessage.conversationId,
      timestamp: channelMessage.timestamp,
      data: channelMessage,
    };

    this.emit(event);
  }

  private emit(event: ChannelEvent): void {
    for (const [handler, filter] of this.handlers) {
      if (!filter || filter.includes(event.type)) {
        Promise.resolve(handler(event)).catch((err) => {
          console.error('[RedditChannelAdapter] Handler error:', err);
        });
      }
    }
  }
}
