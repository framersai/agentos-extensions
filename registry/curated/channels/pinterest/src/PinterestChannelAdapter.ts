/**
 * @fileoverview IChannelAdapter implementation for Pinterest.
 *
 * Pinterest is primarily a content publishing platform, not a real-time
 * messaging platform. The adapter focuses on outbound pin creation and
 * content management. Inbound events are limited to webhook-based
 * notifications if configured.
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
import { PinterestService } from './PinterestService';

export class PinterestChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'pinterest';
  readonly displayName = 'Pinterest';
  readonly capabilities: readonly ChannelCapability[] = [
    'images',
    'video',
    'carousel',
    'hashtags',
    'engagement_metrics',
    'content_discovery',
    'scheduling',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();
  private defaultBoardId: string | null = null;

  constructor(private readonly service: PinterestService) {}

  async initialize(auth: ChannelAuthConfig): Promise<void> {
    // Store default board ID if provided via params
    this.defaultBoardId = auth.params?.['boardId'] ?? null;
  }

  async shutdown(): Promise<void> {
    this.handlers.clear();
    this.defaultBoardId = null;
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return {
      status: this.service.isRunning ? 'connected' : 'disconnected',
    };
  }

  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    // conversationId maps to a board ID on Pinterest
    const boardId = conversationId || this.defaultBoardId;
    if (!boardId) {
      throw new Error('Board ID is required — pass as conversationId or set default via auth params');
    }

    const textBlock = content.blocks.find((b) => b.type === 'text');
    const imageBlock = content.blocks.find((b) => b.type === 'image');
    const videoBlock = content.blocks.find((b) => b.type === 'video');
    const carouselBlock = content.blocks.find((b) => b.type === 'carousel');

    let mediaSource: any;
    if (carouselBlock && carouselBlock.type === 'carousel') {
      mediaSource = {
        sourceType: 'multiple_image_urls' as const,
        urls: carouselBlock.items.map((item) => item.url),
      };
    } else if (imageBlock && imageBlock.type === 'image') {
      mediaSource = {
        sourceType: 'image_url' as const,
        url: imageBlock.url,
      };
    } else if (videoBlock && videoBlock.type === 'video') {
      mediaSource = {
        sourceType: 'video_id' as const,
        videoId: videoBlock.url,
        coverImageUrl: videoBlock.caption,
      };
    } else {
      // Default to a text-only pin which requires at least an image on Pinterest
      throw new Error('Pinterest requires an image, video, or carousel media source');
    }

    const description = textBlock?.type === 'text' ? textBlock.text : undefined;

    const result = await this.service.createPin({
      boardId,
      description,
      mediaSource,
      link: content.platformOptions?.['link'] as string | undefined,
      hashtags: content.platformOptions?.['hashtags'] as string[] | undefined,
    });

    return {
      messageId: result.id,
      timestamp: result.createdAt ?? new Date().toISOString(),
    };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Pinterest does not support typing indicators — no-op
  }

  on(handler: ChannelEventHandler, eventTypes?: ChannelEventType[]): () => void {
    this.handlers.set(handler, eventTypes);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async getConversationInfo(conversationId: string): Promise<{
    name?: string;
    memberCount?: number;
    isGroup: boolean;
    metadata?: Record<string, unknown>;
  }> {
    // conversationId is a board ID on Pinterest
    try {
      const boards = await this.service.getBoards();
      const board = boards.find((b) => b.id === conversationId);
      if (board) {
        return {
          name: board.name,
          memberCount: board.followerCount,
          isGroup: false,
          metadata: {
            pinCount: board.pinCount,
            privacy: board.privacy,
          },
        };
      }
    } catch {
      // Fall through
    }
    return { isGroup: false };
  }
}
