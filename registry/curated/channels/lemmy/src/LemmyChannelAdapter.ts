// @ts-nocheck
/**
 * @fileoverview IChannelAdapter implementation for Lemmy.
 */

import type { LemmyService } from './LemmyService.js';

export type ChannelPlatform = string;
export type ChannelCapability = string;
export type ChannelConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
export type ChannelEventType = string;

export interface ChannelAuthConfig {
  platform: ChannelPlatform;
  credential: string;
  params?: Record<string, string>;
}

export interface ChannelConnectionInfo {
  status: ChannelConnectionStatus;
  connectedSince?: string;
  errorMessage?: string;
  platformInfo?: Record<string, unknown>;
}

export interface MessageContent {
  blocks: Array<{ type: string; [key: string]: any }>;
  replyToMessageId?: string;
  platformOptions?: Record<string, unknown>;
}

export interface ChannelSendResult {
  messageId: string;
  timestamp?: string;
}

export type ChannelEventHandler = (event: any) => void | Promise<void>;

export class LemmyChannelAdapter {
  readonly platform: ChannelPlatform = 'lemmy';
  readonly displayName = 'Lemmy';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'links', 'threads', 'reactions', 'communities',
    'content_discovery', 'voting',
  ];

  private service: LemmyService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: LemmyService) {
    this.service = service;
  }

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    try {
      await this.service.initialize();
      this.connectedAt = new Date().toISOString();
      this.errorMessage = null;
    } catch (err: any) {
      this.errorMessage = err.message;
      throw err;
    }
  }

  async shutdown(): Promise<void> {
    await this.service.shutdown();
    this.connectedAt = null;
  }

  getConnectionInfo(): ChannelConnectionInfo {
    if (this.errorMessage) {
      return { status: 'error', errorMessage: this.errorMessage };
    }
    if (!this.service.isRunning) {
      return { status: 'disconnected' };
    }
    return {
      status: 'connected',
      connectedSince: this.connectedAt ?? undefined,
      platformInfo: { platform: 'lemmy' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';
    const titleBlock = content.blocks.find((b) => b.type === 'title');
    const title = titleBlock?.text ?? text.slice(0, 100);

    const linkBlock = content.blocks.find((b) => b.type === 'link');
    const url = linkBlock?.url;

    const communityId = content.platformOptions?.communityId as number | undefined;

    if (content.replyToMessageId) {
      // Treat as a comment on a post
      const postId = parseInt(content.replyToMessageId, 10);
      const result = await this.service.createComment(postId, text);
      return { messageId: String(result.id), timestamp: new Date().toISOString() };
    }

    // Create a new post
    const result = await this.service.createPost(
      communityId ?? 0,
      title,
      text,
      url,
    );
    return { messageId: String(result.id), timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Lemmy doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    // Map reaction to an upvote
    const id = parseInt(messageId, 10);
    await this.service.vote('post', id, 1);
  }
}
