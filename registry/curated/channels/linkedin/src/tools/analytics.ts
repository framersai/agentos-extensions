import type { LinkedInService } from '../LinkedInService.js';

export class LinkedInAnalyticsTool {
  readonly id = 'linkedinAnalytics';
  readonly name = 'linkedinAnalytics';
  readonly displayName = 'Engagement Analytics';
  readonly description = 'Get engagement metrics (likes, comments, shares, impressions, clicks) for a specific LinkedIn post.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      postId: { type: 'string', description: 'ID or URN of the LinkedIn post to analyze' },
    },
    required: ['postId'],
  };

  constructor(private service: LinkedInService) {}

  async execute(args: { postId: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const metrics = await this.service.getPostAnalytics(args.postId);
      return { success: true, data: metrics };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
