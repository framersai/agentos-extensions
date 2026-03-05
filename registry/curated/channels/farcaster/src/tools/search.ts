import type { FarcasterService } from '../FarcasterService.js';

export class FarcasterSearchTool {
  readonly id = 'farcasterSearch';
  readonly name = 'farcasterSearch';
  readonly displayName = 'Search Casts';
  readonly description = 'Search Farcaster for casts matching a query.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results to return (default 10)' },
    },
    required: ['query'],
  };

  constructor(private service: FarcasterService) {}

  async execute(args: { query: string; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.searchCasts(args.query, args.limit);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
