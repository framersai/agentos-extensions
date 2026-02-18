import type { TwitterService } from '../TwitterService.js';

export class TwitterTimelineTool {
  readonly id = 'twitterTimeline';
  readonly name = 'twitterTimeline';
  readonly displayName = 'Get Timeline';
  readonly description = 'Get the authenticated user\'s home timeline.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      maxResults: { type: 'number', description: 'Max tweets to return (default 20, max 100)' },
    },
  };

  constructor(private service: TwitterService) {}

  async execute(args: { maxResults?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const tweets = await this.service.getTimeline(args.maxResults);
      return { success: true, data: tweets };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
