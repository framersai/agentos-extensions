import type { FacebookService } from '../FacebookService.js';

export class FacebookAnalyticsTool {
  readonly id = 'facebookAnalytics';
  readonly name = 'facebookAnalytics';
  readonly displayName = 'Post Analytics';
  readonly description = 'Get engagement analytics for a Facebook page post — impressions, engaged users, clicks, and reactions.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID of the post to analyze' },
    },
    required: ['postId'],
  };

  constructor(private service: FacebookService) {}

  async execute(args: { postId: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const analytics = await this.service.getPostAnalytics(args.postId);
      return { success: true, data: analytics };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
