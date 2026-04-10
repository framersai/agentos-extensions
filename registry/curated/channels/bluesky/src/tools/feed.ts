// @ts-nocheck
/**
 * @fileoverview BlueskyFeedTool — retrieve timeline or a specific author's feed.
 *
 * Supports two modes:
 * - "timeline" (default): The authenticated user's home timeline.
 * - "author": A specific user's post feed (requires handle).
 */

import type { BlueskyService } from '../BlueskyService.js';

export class BlueskyFeedTool {
  readonly id = 'blueskyFeed';
  readonly name = 'blueskyFeed';
  readonly displayName = 'Get Feed';
  readonly description = 'Get the authenticated user\'s timeline or a specific author\'s feed on Bluesky.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['timeline', 'author'], description: 'Feed type (default: "timeline")' },
      handle: { type: 'string', description: 'Author handle (required when type is "author")' },
      limit: { type: 'number', description: 'Max posts to return (default 50, max 100)' },
    },
  };

  constructor(private service: BlueskyService) {}

  async execute(args: { type?: 'timeline' | 'author'; handle?: string; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const feedType = args.type ?? 'timeline';

      if (feedType === 'author') {
        if (!args.handle) {
          return { success: false, error: 'handle is required when type is "author"' };
        }
        const posts = await this.service.getAuthorFeed(args.handle, args.limit);
        return { success: true, data: posts };
      } else {
        const result = await this.service.getTimeline(args.limit);
        return { success: true, data: result };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
