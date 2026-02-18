/**
 * @fileoverview IChannelAdapter implementation for TikTok.
 *
 * TikTok is a video-first content platform. The adapter focuses on
 * outbound video publishing and content discovery. Inbound events
 * are limited as TikTok's API does not provide real-time messaging.
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
} from '@framers/agentos';
import { TikTokService } from './TikTokService';

export class TikTokChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'tiktok';
  readonly displayName = 'TikTok';
  readonly capabilities: readonly ChannelCapability[] = [
    'video',
    'reels',
    'reactions',
    'hashtags',
    'engagement_metrics',
    'content_discovery',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: TikTokService) {}

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    // TikTok does not support real-time inbound messaging via API.
    // Adapter is primarily for outbound content publishing.
  }

  async shutdown(): Promise<void> {
    this.handlers.clear();
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return {
      status: this.service.isRunning ? 'connected' : 'disconnected',
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    // On TikTok, "sending a message" means publishing a video.
    // conversationId is unused but kept for interface compliance.

    const videoBlock = content.blocks.find((b) => b.type === 'video');
    const reelBlock = content.blocks.find((b) => b.type === 'reel');
    const textBlock = content.blocks.find((b) => b.type === 'text');

    let videoUrl: string;
    let caption: string;
    let hashtags: string[] | undefined;

    if (reelBlock && reelBlock.type === 'reel') {
      videoUrl = reelBlock.videoUrl;
      caption = reelBlock.caption ?? '';
      hashtags = reelBlock.hashtags;
    } else if (videoBlock && videoBlock.type === 'video') {
      videoUrl = videoBlock.url;
      caption = videoBlock.caption ?? '';
    } else {
      throw new Error('TikTok requires a video or reel content block for publishing');
    }

    // Override caption with text block if present
    if (textBlock && textBlock.type === 'text' && !caption) {
      caption = textBlock.text;
    }

    // Merge hashtags from platform options
    if (content.platformOptions?.['hashtags']) {
      const extraTags = content.platformOptions['hashtags'] as string[];
      hashtags = [...(hashtags ?? []), ...extraTags];
    }

    const privacyLevel = content.platformOptions?.['privacyLevel'] as
      | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY'
      | undefined;

    const result = await this.service.uploadVideo({
      videoUrl,
      caption,
      hashtags,
      privacyLevel,
    });

    return {
      messageId: result.id,
      timestamp: result.createTime
        ? new Date(result.createTime * 1000).toISOString()
        : new Date().toISOString(),
    };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // TikTok does not support typing indicators — no-op
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async getConversationInfo(_conversationId: string): Promise<{
    name?: string;
    memberCount?: number;
    isGroup: boolean;
    metadata?: Record<string, unknown>;
  }> {
    try {
      const me = await this.service.getMe();
      return {
        name: me.displayName ?? me.username,
        memberCount: me.followerCount,
        isGroup: false,
        metadata: {
          username: me.username,
          videoCount: me.videoCount,
          likeCount: me.likeCount,
        },
      };
    } catch {
      return { isGroup: false };
    }
  }
}
