import type { TwitterService } from '../TwitterService.js';

export class TwitterRetweetTool {
  readonly id = 'twitterRetweet';
  readonly name = 'twitterRetweet';
  readonly displayName = 'Retweet';
  readonly description = 'Retweet or undo a retweet.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweetId: { type: 'string', description: 'ID of the tweet to retweet' },
      undo: { type: 'boolean', description: 'Set to true to unretweet', default: false },
    },
    required: ['tweetId'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweetId: string; undo?: boolean }): Promise<{ success: boolean; error?: string }> {
    try {
      if (args.undo) {
        await this.service.unretweet(args.tweetId);
      } else {
        await this.service.retweet(args.tweetId);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
