/**
 * @fileoverview IChannelAdapter implementation for LinkedIn.
 */

import type { LinkedInService } from './LinkedInService.js';

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

export class LinkedInChannelAdapter {
  readonly platform: ChannelPlatform = 'linkedin';
  readonly displayName = 'LinkedIn';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'video', 'reactions', 'articles',
    'company_pages', 'engagement_metrics', 'scheduling', 'content_discovery',
  ];

  private service: LinkedInService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: LinkedInService) {
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
      platformInfo: { platform: 'linkedin' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    const mediaUrls: string[] = [];
    for (const block of content.blocks) {
      if (block.type === 'image' || block.type === 'video') {
        if (block.url) {
          mediaUrls.push(block.url);
        }
      }
    }

    const articleBlock = content.blocks.find((b) => b.type === 'article') as any;
    const articleUrl = articleBlock?.url;
    const articleTitle = articleBlock?.title;
    const articleDescription = articleBlock?.description;

    const result = await this.service.postToFeed({
      text,
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      articleUrl,
      articleTitle,
      articleDescription,
      visibility: (content.platformOptions?.visibility as 'PUBLIC' | 'CONNECTIONS') ?? 'PUBLIC',
    });

    return { messageId: result.id, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // LinkedIn doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.likePost(messageId);
  }
}
