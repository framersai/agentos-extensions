import type { FarcasterService } from '../FarcasterService.js';

export class FarcasterFeedTool {
  readonly id = 'farcasterFeed';
  readonly name = 'farcasterFeed';
  readonly displayName = 'Get Feed';
  readonly description = 'Get Farcaster feed — following or trending casts.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      type: { type: 'string', enum: ['following', 'trending'], description: 'Feed type (default "following")' },
      limit: { type: 'number', description: 'Max casts to return (default 20)' },
    },
    required: [],
  };

  constructor(private service: FarcasterService) {}

  async execute(args: { type?: 'following' | 'trending'; limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.getFeed(args.type, args.limit);
      return { success: true, data: results };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
