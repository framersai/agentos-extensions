// @ts-nocheck
/**
 * @fileoverview IChannelAdapter implementation for Threads.
 */

import type { ThreadsService } from './ThreadsService.js';

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

export class ThreadsChannelAdapter {
  readonly platform: ChannelPlatform = 'threads';
  readonly displayName = 'Threads';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'video', 'carousels', 'reactions',
    'threads', 'quotes', 'engagement_metrics',
  ];

  private service: ThreadsService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: ThreadsService) {
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
      platformInfo: { platform: 'threads' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    const imageBlock = content.blocks.find((b) => b.type === 'image');
    const videoBlock = content.blocks.find((b) => b.type === 'video');
    const carouselItems = content.blocks
      .filter((b) => b.type === 'carousel_item')
      .map((b) => ({ type: b.mediaType as 'IMAGE' | 'VIDEO', url: b.url as string }));

    let result;

    if (content.replyToMessageId) {
      // Reply to an existing post
      const mediaUrl = imageBlock?.url ?? videoBlock?.url;
      result = await this.service.replyToPost(content.replyToMessageId, text, mediaUrl);
    } else if (carouselItems.length > 0) {
      result = await this.service.createCarouselPost(text, carouselItems);
    } else if (videoBlock?.url) {
      result = await this.service.createVideoPost(text, videoBlock.url);
    } else if (imageBlock?.url) {
      result = await this.service.createImagePost(text, imageBlock.url);
    } else {
      result = await this.service.createTextPost(text);
    }

    return { messageId: result.id, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Threads doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.likePost(messageId);
  }
}
