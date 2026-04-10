// @ts-nocheck
/**
 * @fileoverview BlueskyAnalyticsTool — get engagement metrics for a Bluesky post.
 *
 * Fetches the post thread and extracts like, repost, and reply counts.
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyAnalyticsTool {
  readonly id = 'blueskyAnalytics';
  readonly name = 'blueskyAnalytics';
  readonly displayName = 'Post Analytics';
  readonly description = 'Get engagement metrics (likes, reposts, replies) for a specific Bluesky post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      uri: { type: 'string', description: 'AT URI of the post to analyze' },
    },
    required: ['uri'],
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { uri: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const thread = await this.service.getPostThread(args.uri);
      const post = thread?.post;

      if (!post) {
        return { success: false, error: 'Post not found' };
      }

      const metrics = {
        uri: post.uri,
        cid: post.cid,
        text: post.record?.text ?? '',
        authorHandle: post.author?.handle ?? '',
        authorDisplayName: post.author?.displayName,
        createdAt: post.record?.createdAt ?? post.indexedAt,
        likeCount: post.likeCount ?? 0,
        repostCount: post.repostCount ?? 0,
        replyCount: post.replyCount ?? 0,
      };

      return { success: true, data: metrics };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
