/**
 * @fileoverview IChannelAdapter implementation for Farcaster.
 */

import type { FarcasterService } from './FarcasterService.js';

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

export class FarcasterChannelAdapter {
  readonly platform: ChannelPlatform = 'farcaster';
  readonly displayName = 'Farcaster';
  readonly capabilities: readonly ChannelCapability[] = [
    'text', 'embeds', 'reactions', 'threads', 'channels',
    'content_discovery', 'engagement_metrics',
  ];

  private service: FarcasterService;
  private connectedAt: string | null = null;
  private handlers: Set<ChannelEventHandler> = new Set();
  private errorMessage: string | null = null;

  constructor(service: FarcasterService) {
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
      platformInfo: { platform: 'farcaster' },
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const text = textBlock?.text ?? '';

    const embeds: string[] = [];
    for (const block of content.blocks) {
      if (block.type === 'image' || block.type === 'link') {
        embeds.push(block.url);
      }
    }

    const channelId = content.platformOptions?.channelId as string | undefined;

    const result = await this.service.publishCast(text, {
      embeds: embeds.length ? embeds : undefined,
      replyTo: content.replyToMessageId,
      channelId,
    });

    return { messageId: result.hash, timestamp: new Date().toISOString() };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Farcaster doesn't support typing indicators
  }

  on(handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.likeCast(messageId);
  }
}
