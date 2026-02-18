import type { TwitterService } from '../TwitterService.js';

export class TwitterReplyTool {
  readonly id = 'twitterReply';
  readonly name = 'twitterReply';
  readonly displayName = 'Reply to Tweet';
  readonly description = 'Reply to an existing tweet.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweetId: { type: 'string', description: 'ID of the tweet to reply to' },
      text: { type: 'string', description: 'Reply text' },
    },
    required: ['tweetId', 'text'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweetId: string; text: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.postTweet({ text: args.text, replyToId: args.tweetId });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
