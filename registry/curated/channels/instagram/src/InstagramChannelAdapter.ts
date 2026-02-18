/**
 * @fileoverview IChannelAdapter implementation for Instagram.
 */

import type { InstagramService } from './InstagramService.js';

export class InstagramChannelAdapter {
  readonly platform = 'instagram';
  readonly displayName = 'Instagram';
  readonly capabilities = [
    'text', 'images', 'video', 'stories', 'reels', 'carousel',
    'reactions', 'hashtags', 'dm_automation', 'engagement_metrics', 'content_discovery',
  ] as const;

  private service: InstagramService;
  private connectedAt: string | null = null;
  private handlers: Set<(event: any) => void | Promise<void>> = new Set();
  private errorMessage: string | null = null;

  constructor(service: InstagramService) {
    this.service = service;
  }

  async initialize(_auth: { platform: string; credential: string; params?: Record<string, string> }): Promise<void> {
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

  getConnectionInfo() {
    if (this.errorMessage) return { status: 'error' as const, errorMessage: this.errorMessage };
    if (!this.service.isRunning) return { status: 'disconnected' as const };
    return { status: 'connected' as const, connectedSince: this.connectedAt ?? undefined, platformInfo: { platform: 'instagram' } };
  }

  async sendMessage(_conversationId: string, content: { blocks: any[]; replyToMessageId?: string }) {
    // Instagram posting — map content blocks to appropriate post type
    const imageBlocks = content.blocks.filter((b) => b.type === 'image');
    const videoBlocks = content.blocks.filter((b) => b.type === 'video');
    const reelBlock = content.blocks.find((b) => b.type === 'reel');
    const storyBlock = content.blocks.find((b) => b.type === 'story');
    const textBlock = content.blocks.find((b) => b.type === 'text');
    const carouselBlock = content.blocks.find((b) => b.type === 'carousel');
    const caption = textBlock?.text ?? '';

    if (reelBlock) {
      const result = await this.service.postReel(reelBlock.videoUrl, reelBlock.caption ?? caption);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (storyBlock) {
      const result = await this.service.postStory(storyBlock.mediaUrl);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (carouselBlock) {
      const items = carouselBlock.items.map((i: any) => ({ imageUrl: i.url, caption: i.caption }));
      const result = await this.service.postCarousel(items, caption);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (imageBlocks.length > 1) {
      const items = imageBlocks.map((b: any) => ({ imageUrl: b.url, caption: b.caption }));
      const result = await this.service.postCarousel(items, caption);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (imageBlocks.length === 1) {
      const result = await this.service.postPhoto(imageBlocks[0].url, caption);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    if (videoBlocks.length >= 1) {
      const result = await this.service.postReel(videoBlocks[0].url, caption);
      return { messageId: result.id, timestamp: new Date().toISOString() };
    }

    throw new Error('Instagram requires at least one image, video, reel, or story block');
  }

  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // Not supported
  }

  on(handler: (event: any) => void | Promise<void>, _eventTypes?: string[]): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async addReaction(_conversationId: string, messageId: string, _emoji: string): Promise<void> {
    await this.service.likeMedia(messageId);
  }
}
