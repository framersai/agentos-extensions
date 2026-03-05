/**
 * @fileoverview IChannelAdapter implementation for Bluesky.
 *
 * Provides a standard channel adapter interface for the Bluesky social network,
 * enabling agents to post and interact via the AT Protocol.
 */

import type { BlueskyService } from './BlueskyService.js';

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

export class BlueskyChannelAdapter {
  readonly platform: ChannelPlatform = 'bluesky';
  readonly displayName = 'Bluesky';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'reactions', 'threads',
    'hashtags', 'engagement_metrics', 'content_discovery',
  ];

  private service: BlueskyService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: BlueskyService) {
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
      platformInfo: { platform: 'bluesky' },
    };
  }

  async sendMessage(_conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    // Collect image blocks and convert to the format BlueskyService expects
    const images: Array<{ data: Uint8Array; mimeType: string; alt?: string }> = [];
    for (const block of content.blocks) {
      if (block.type === 'image' && block.data) {
        images.push({
          data: block.data,
          mimeType: block.mimeType ?? 'image/jpeg',
          alt: block.alt,
        });
      }
    }

    const result = await this.service.createPost(text, {
      images: images.length ? images : undefined,
      replyTo: content.replyToMessageId
        ? { uri: content.replyToMessageId, cid: (content.platformOptions?.cid as string) ?? '' }
        : undefined,
    });

    return { messageId: result.uri, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Bluesky doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    // On Bluesky, "reacting" is closest to liking a post.
    // The CID is required for likes — attempt to fetch it from the thread.
    const thread = await this.service.getPostThread(messageId);
    if (thread?.post?.cid) {
      await this.service.like(messageId, thread.post.cid);
    }
  }
}
