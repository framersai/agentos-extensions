/**
 * @fileoverview IChannelAdapter implementation for Facebook.
 */

import type { FacebookService } from './FacebookService.js';

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

export class FacebookChannelAdapter {
  readonly platform: ChannelPlatform = 'facebook';
  readonly displayName = 'Facebook';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'video', 'reactions', 'comments',
    'links', 'scheduling', 'analytics', 'pages',
  ];

  private service: FacebookService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: FacebookService) {
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
      platformInfo: { platform: 'facebook' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    const photoBlock = content.blocks.find((b) => b.type === 'image') as any;
    const videoBlock = content.blocks.find((b) => b.type === 'video') as any;
    const linkBlock = content.blocks.find((b) => b.type === 'link') as any;

    // Determine if posting to a page or profile
    const pageId = (content.platformOptions?.pageId as string) ?? conversationId;

    if (photoBlock?.url) {
      const result = await this.service.postToPage(pageId, {
        message: text,
        photoUrl: photoBlock.url,
      });
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (videoBlock?.url) {
      const result = await this.service.postToPage(pageId, {
        message: text,
        videoUrl: videoBlock.url,
      });
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    const result = await this.service.postToPage(pageId, {
      message: text,
      link: linkBlock?.url,
    });

    return { messageId: result.id, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Facebook pages don't support typing indicators for feed posts
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.likePost(messageId);
  }
}
