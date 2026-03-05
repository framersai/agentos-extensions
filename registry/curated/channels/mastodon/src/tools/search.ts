import type { MastodonService } from '../MastodonService.js';

export class MastodonSearchTool {
  readonly id = 'mastodonSearch';
  readonly name = 'mastodonSearch';
  readonly displayName = 'Search Mastodon';
  readonly description = 'Search Mastodon for accounts, hashtags, or statuses matching a query.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: {
        type: 'string',
        enum: ['accounts', 'hashtags', 'statuses'],
        description: 'Filter results by type',
      },
      limit: { type: 'number', description: 'Max results to return (default 20, max 40)' },
    },
    required: ['query'],
  };

  constructor(private service: MastodonService) {}

  async execute(args: {
    query: string;
    type?: 'accounts' | 'hashtags' | 'statuses';
    limit?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.searchAll(args.query, {
        type: args.type,
        limit: args.limit,
      });
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
