// @ts-nocheck
/**
 * @fileoverview IChannelAdapter implementation for Google Business Profile.
 */

import type { GoogleBusinessService } from './GoogleBusinessService.js';

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

export class GoogleBusinessChannelAdapter {
  readonly platform: ChannelPlatform = 'google-business';
  readonly displayName = 'Google Business Profile';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'images', 'reviews', 'analytics',
    'business_info', 'local_posts',
  ];

  private service: GoogleBusinessService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;
  private locationName: string | null = null;

  constructor(service: GoogleBusinessService) {
    this.service = service;
  }

  async initialize(auth: ChannelAuthConfig): Promise<void> {
    try {
      await this.service.initialize();
      this.locationName = auth.params?.locationName ?? null;
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
      platformInfo: { platform: 'google-business', locationName: this.locationName },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';
    const location = content.platformOptions?.locationName as string ?? this.locationName ?? conversationId;

    if (content.replyToMessageId) {
      // Treat as a review reply
      await this.service.replyToReview(content.replyToMessageId, text);
      return { messageId: content.replyToMessageId, timestamp: new Date().toISOString() };
    }

    // Create a local post
    const mediaBlock = content.blocks.find((b) => b.type === 'image');
    const media = mediaBlock ? { mediaFormat: 'PHOTO', sourceUrl: mediaBlock.url } : undefined;

    const result = await this.service.createLocalPost(location, {
      summary: text,
      media,
    });

    return { messageId: result.name, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Google Business doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, _messageId: string, _emoji: string): Promise<void> {
    // Google Business doesn't support reactions
  }
}
