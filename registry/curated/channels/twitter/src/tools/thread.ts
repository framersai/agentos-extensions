import type { TwitterService } from '../TwitterService.js';

export class TwitterThreadTool {
  readonly id = 'twitterThread';
  readonly name = 'twitterThread';
  readonly displayName = 'Post Thread';
  readonly description = 'Post a multi-tweet thread. Each item in the tweets array becomes a sequential reply.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      tweets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of tweet texts (each max 280 characters). Posted as a sequential thread.',
        minItems: 2,
      },
    },
    required: ['tweets'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { tweets: string[] }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const results = await this.service.postThread(args.tweets);
      return { success: true, data: { threadLength: results.length, tweets: results } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
