/**
 * @fileoverview IChannelAdapter implementation for YouTube.
 *
 * YouTube supports both content publishing (videos, Shorts) and
 * comment-based interaction. The adapter maps conversations to
 * video comment threads and supports outbound video publishing.
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
import { YouTubeService } from './YouTubeService';

export class YouTubeChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'youtube';
  readonly displayName = 'YouTube';
  readonly capabilities: readonly ChannelCapability[] = [
    'video',
    'reels',
    'text',
    'reactions',
    'threads',
    'engagement_metrics',
    'content_discovery',
    'scheduling',
  ] as const;

  private handlers = new Map<ChannelEventHandler, ChannelEventType[] | undefined>();

  constructor(private readonly service: YouTubeService) {}

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    // YouTube does not have real-time inbound webhooks in the standard
    // Data API v3. Inbound event support would require polling or
    // PubSubHubbub integration.
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
    // On YouTube, a "conversation" maps to a video ID.
    // Sending a message means posting a comment on that video.

    const textBlock = content.blocks.find((b) => b.type === 'text');
    const videoBlock = content.blocks.find((b) => b.type === 'video');

    // If a video block is present, this is a video upload rather than a comment
    if (videoBlock && videoBlock.type === 'video') {
      const { Readable } = await import('stream');
      const { default: https } = await import('https');

      // Fetch the video stream from the URL
      const videoStream = await new Promise<Readable>((resolve, reject) => {
        https.get(videoBlock.url, (res) => resolve(res)).on('error', reject);
      });

      const result = await this.service.uploadVideo({
        title: (content.platformOptions?.['title'] as string) ?? videoBlock.caption ?? 'Untitled',
        description: textBlock?.type === 'text' ? textBlock.text : (videoBlock.caption ?? ''),
        tags: content.platformOptions?.['tags'] as string[] | undefined,
        categoryId: content.platformOptions?.['categoryId'] as string | undefined,
        privacyStatus: content.platformOptions?.['privacyStatus'] as 'public' | 'private' | 'unlisted' | undefined,
        videoStream,
        mimeType: videoBlock.mimeType,
      });

      return {
        messageId: result.id,
        timestamp: result.publishedAt ?? new Date().toISOString(),
      };
    }

    // Otherwise, post a comment on the video
    if (!conversationId) {
      throw new Error('Video ID (conversationId) is required for posting comments');
    }

    const text = textBlock?.type === 'text' ? textBlock.text : '';
    if (!text) {
      throw new Error('Text content is required for posting a comment');
    }

    const parentCommentId = content.replyToMessageId;
    const result = await this.service.postComment(conversationId, text, parentCommentId);

    return {
      messageId: result.id,
      timestamp: result.publishedAt ?? new Date().toISOString(),
    };
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // YouTube does not support typing indicators — no-op
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
    // conversationId is a video ID on YouTube
    try {
      const video = await this.service.getVideoStatistics(conversationId);
      return {
        name: video.title,
        isGroup: true, // YouTube videos are public conversations
        metadata: {
          channelTitle: video.channelTitle,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          duration: video.duration,
        },
      };
    } catch {
      return { isGroup: true };
    }
  }
}
