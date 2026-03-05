/**
 * @fileoverview IChannelAdapter implementation for blog publishing platforms.
 *
 * Unlike bidirectional chat adapters, the blog publisher is primarily
 * outbound — "sending a message" means publishing an article. Inbound
 * events are not supported since blog platforms do not push real-time
 * messages to authors.
 *
 * @module @framers/agentos-ext-channel-blog-publisher/BlogPublisherChannelAdapter
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
import type { BlogPublisherService, BlogPlatform } from './BlogPublisherService';

export class BlogPublisherChannelAdapter implements IChannelAdapter {
  readonly platform: ChannelPlatform = 'devto'; // primary; covers all 4 platforms internally
  readonly displayName = 'Blog Publisher';
  readonly capabilities: readonly ChannelCapability[] = [
    'text',
    'rich_text',
    'hashtags',
    'scheduling',
  ] as const;

  private connected = false;
  private connectedSince?: string;

  constructor(private readonly service: BlogPublisherService) {}

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  async initialize(_auth: ChannelAuthConfig): Promise<void> {
    // Credentials are already resolved in the service via createExtensionPack.
    // Verify that at least one platform is configured.
    const platforms = this.service.getConfiguredPlatforms();
    if (platforms.length === 0) {
      throw new Error(
        'Blog Publisher: No platforms configured. Provide credentials for at least one of: Dev.to, Hashnode, Medium, WordPress.',
      );
    }
    this.connected = true;
    this.connectedSince = new Date().toISOString();
  }

  async shutdown(): Promise<void> {
    this.connected = false;
    this.connectedSince = undefined;
  }

  getConnectionInfo(): ChannelConnectionInfo {
    return {
      status: this.connected ? 'connected' : 'disconnected',
      connectedSince: this.connectedSince,
      platformInfo: {
        configuredPlatforms: this.service.getConfiguredPlatforms(),
      },
    };
  }

  // --------------------------------------------------------------------------
  // Outbound — "send" publishes an article
  // --------------------------------------------------------------------------

  /**
   * Publish an article to configured blog platforms.
   *
   * The `conversationId` parameter is interpreted as the target platform(s):
   * - `"all"` — publish to all configured platforms
   * - `"devto"`, `"hashnode"`, `"medium"`, `"wordpress"` — publish to one
   * - `"devto,hashnode"` — comma-separated list of platforms
   *
   * The first text block becomes the article body. Additional blocks are
   * ignored (blog platforms only accept a single article body). The
   * `platformOptions` field can include `title`, `tags`, `published`,
   * `coverImage`, `canonicalUrl`, and `series`.
   */
  async sendMessage(conversationId: string, content: MessageContent): Promise<ChannelSendResult> {
    const textBlock = content.blocks.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('Blog Publisher requires at least one text content block for the article body.');
    }

    const opts = (content.platformOptions ?? {}) as Record<string, any>;
    const article = {
      title: opts.title ?? 'Untitled',
      body: textBlock.text,
      tags: opts.tags as string[] | undefined,
      published: opts.published as boolean | undefined,
      coverImage: opts.coverImage as string | undefined,
      canonicalUrl: opts.canonicalUrl as string | undefined,
      series: opts.series as string | undefined,
    };

    // Determine target platforms
    let platforms: BlogPlatform[] | undefined;
    if (conversationId && conversationId !== 'all') {
      platforms = conversationId.split(',').map((p) => p.trim()) as BlogPlatform[];
    }

    const results = await this.service.publishToAll(article, platforms);
    const successes = results.filter((r) => 'url' in r);
    const firstSuccess = successes[0] as { platform: string; id: string; url: string } | undefined;

    return {
      messageId: firstSuccess?.id ?? 'none',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Typing indicators do not apply to blog publishing.
   */
  async sendTypingIndicator(_conversationId: string, _isTyping: boolean): Promise<void> {
    // No-op — blog platforms do not have typing indicators.
  }

  // --------------------------------------------------------------------------
  // Inbound — not supported for blog publishing
  // --------------------------------------------------------------------------

  /**
   * Blog platforms do not push real-time events.
   * Returns a no-op unsubscribe function.
   */
  on(_handler: ChannelEventHandler, _eventTypes?: ChannelEventType[]): () => void {
    // Blog platforms are write-only from the adapter perspective.
    return () => {};
  }
}
