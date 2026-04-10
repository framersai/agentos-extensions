// @ts-nocheck
import type { MastodonService } from '../MastodonService.js';

export class MastodonTrendingTool {
  readonly id = 'mastodonTrending';
  readonly name = 'mastodonTrending';
  readonly displayName = 'Get Trending';
  readonly description = 'Get trending tags, statuses, or links on the Mastodon instance.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      type: {
        type: 'string',
        enum: ['tags', 'statuses', 'links'],
        description: 'Type of trending content (default: tags)',
      },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
  };

  constructor(private service: MastodonService) {}

  async execute(args: {
    type?: 'tags' | 'statuses' | 'links';
    limit?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const trending = await this.service.getTrending(args.type, args.limit);
      return { success: true, data: trending };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
