import type { TwitterService } from '../TwitterService.js';

export class TwitterQuoteTool {
  readonly id = 'twitterQuote';
  readonly name = 'twitterQuote';
  readonly displayName = 'Quote Tweet';
  readonly description = 'Quote an existing tweet with your own comment.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweetId: { type: 'string', description: 'ID of the tweet to quote' },
      text: { type: 'string', description: 'Your quote comment' },
    },
    required: ['tweetId', 'text'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweetId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postTweet({ text: args.text, quoteTweetId: args.tweetId });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
