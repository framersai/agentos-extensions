import type { TwitterService } from '../TwitterService.js';

export class TwitterTrendingTool {
  readonly id = 'twitterTrending';
  readonly name = 'twitterTrending';
  readonly displayName = 'Get Trending Topics';
  readonly description = 'Get trending topics on Twitter for a specific location (WOEID). Default is worldwide (1).';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      woeid: { type: 'number', description: 'Yahoo WOEID for location (1 = worldwide, 23424977 = US)', default: 1 },
    },
  };

  constructor(private service: TwitterService) {}

  async execute(args: { woeid?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const trends = await this.service.getTrending(args.woeid);
      return { success: true, data: trends };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
