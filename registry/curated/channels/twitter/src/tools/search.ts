import type { TwitterService } from '../TwitterService.js';

export class TwitterSearchTool {
  readonly id = 'twitterSearch';
  readonly name = 'twitterSearch';
  readonly displayName = 'Search Tweets';
  readonly description = 'Search Twitter for tweets matching a query. Supports filters and sorting.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query (supports Twitter search operators)' },
      maxResults: { type: 'number', description: 'Max tweets to return (default 10, max 100)' },
      sortOrder: { type: 'string', enum: ['recency', 'relevancy'], description: 'Sort order' },
    },
    required: ['query'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { query: string; maxResults?: number; sortOrder?: 'recency' | 'relevancy' }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.search(args);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
