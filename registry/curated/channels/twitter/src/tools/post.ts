import type { TwitterService } from '../TwitterService.js';

export class TwitterPostTool {
  readonly id = 'twitterPost';
  readonly name = 'twitterPost';
  readonly displayName = 'Post Tweet';
  readonly description = 'Post a tweet with text, optional media, and optional poll.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      text: { type: 'string', description: 'Tweet text (max 280 characters)' },
      mediaPath: { type: 'string', description: 'Path to media file to attach' },
      pollOptions: { type: 'array', items: { type: 'string' }, description: 'Poll options (2-4 choices)' },
      pollDurationMinutes: { type: 'number', description: 'Poll duration in minutes (default 1440 = 24h)' },
    },
    required: ['text'],
  };

  constructor(private service: TwitterService) {}

  async execute(args: { text: string; mediaPath?: string; pollOptions?: string[]; pollDurationMinutes?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const mediaIds: string[] = [];
      if (args.mediaPath) {
        const id = await this.service.uploadMedia(args.mediaPath);
        mediaIds.push(id);
      }
      const result = await this.service.postTweet({
        text: args.text,
        mediaIds: mediaIds.length ? mediaIds : undefined,
        pollOptions: args.pollOptions,
        pollDurationMinutes: args.pollDurationMinutes,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
