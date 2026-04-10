// @ts-nocheck
import type { FacebookService } from '../FacebookService.js';

export class FacebookSearchTool {
  readonly id = 'facebookSearch';
  readonly name = 'facebookSearch';
  readonly displayName = 'Search Facebook';
  readonly description = 'Search Facebook for posts, pages, or groups. Note: Meta has restricted search API access for certain content types.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: { type: 'string', enum: ['post', 'page', 'group'], description: 'Type of content to search for (default: post)' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: { query: string; type?: 'post' | 'page' | 'group'; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.searchPosts(args.query, args.type ?? 'post', args.limit ?? 10);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
