/**
 * @fileoverview IChannelAdapter implementation for Mastodon.
 */

import type { MastodonService } from './MastodonService.js';

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

export class MastodonChannelAdapter {
  readonly platform: ChannelPlatform = 'mastodon';
  readonly displayName = 'Mastodon';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'video', 'reactions', 'threads',
    'hashtags', 'engagement_metrics', 'content_warnings',
    'content_discovery', 'multi_instance',
  ];

  private service: MastodonService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: MastodonService) {
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
      platformInfo: { platform: 'mastodon' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    const mediaIds: string[] = [];
    for (const block of content.blocks) {
      if (block.type === 'image' || block.type === 'video') {
        try {
          const id = await this.service.uploadMedia(block.url, block.altText);
          mediaIds.push(id);
        } catch {
          // Skip failed media uploads
        }
      }
    }

    const spoilerBlock = content.blocks.find((b) => b.type === 'spoiler') as any;
    const spoilerText = spoilerBlock?.text;

    const visibility = content.platformOptions?.visibility as
      | 'public' | 'unlisted' | 'private' | 'direct'
      | undefined;

    const result = await this.service.postStatus({
      text,
      mediaIds: mediaIds.length ? mediaIds : undefined,
      inReplyToId: content.replyToMessageId,
      spoilerText,
      visibility,
    });

    return { messageId: result.id, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Mastodon doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.favouriteStatus(messageId);
  }
}
