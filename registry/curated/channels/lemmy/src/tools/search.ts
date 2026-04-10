// @ts-nocheck
import type { LemmyService } from '../LemmyService.js';

export class LemmySearchTool {
  readonly id = 'lemmySearch';
  readonly name = 'lemmySearch';
  readonly displayName = 'Search';
  readonly description = 'Search Lemmy for posts, comments, and communities matching a query.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: { type: 'string', enum: ['All', 'Posts', 'Comments', 'Communities'], description: 'Type of content to search (default "All")' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: LemmyService) {}

  async execute(args: { query: string; type?: 'All' | 'Posts' | 'Comments' | 'Communities'; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.search(args.query, args.type, args.limit);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
