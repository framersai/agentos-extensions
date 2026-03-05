import type { LemmyService } from '../LemmyService.js';

export class LemmyFeedTool {
  readonly id = 'lemmyFeed';
  readonly name = 'lemmyFeed';
  readonly displayName = 'Get Feed';
  readonly description = 'Get Lemmy feed posts by type and sort order.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['All', 'Local', 'Subscribed'], description: 'Feed type (default "All")' },
      sort: { type: 'string', enum: ['Hot', 'New', 'Top'], description: 'Sort order (default "Hot")' },
      limit: { type: 'number', description: 'Max posts to return (default 20)' },
    },
    required: [],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { type?: 'All' | 'Local' | 'Subscribed'; sort?: 'Hot' | 'New' | 'Top'; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.getFeed(args.type, args.sort, args.limit);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
