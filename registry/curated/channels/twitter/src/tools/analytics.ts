import type { TwitterService } from '../TwitterService.js';

export class TwitterAnalyticsTool {
  readonly id = 'twitterAnalytics';
  readonly name = 'twitterAnalytics';
  readonly displayName = 'Engagement Analytics';
  readonly description = 'Get engagement metrics (likes, retweets, replies, impressions) for a specific tweet.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweetId: { type: 'string', description: 'ID of the tweet to analyze' },
    },
    required: ['tweetId'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweetId: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const metrics = await this.service.getTweetMetrics(args.tweetId);
      return { success: true, data: metrics };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
