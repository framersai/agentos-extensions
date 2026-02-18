import type { TwitterService } from '../TwitterService.js';

export class TwitterLikeTool {
  readonly id = 'twitterLike';
  readonly name = 'twitterLike';
  readonly displayName = 'Like Tweet';
  readonly description = 'Like or unlike a tweet.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweetId: { type: 'string', description: 'ID of the tweet' },
      unlike: { type: 'boolean', description: 'Set to true to unlike', default: false },
    },
    required: ['tweetId'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweetId: string; unlike?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (args.unlike) {
        await this.service.unlike(args.tweetId);
      } else {
        await this.service.like(args.tweetId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
