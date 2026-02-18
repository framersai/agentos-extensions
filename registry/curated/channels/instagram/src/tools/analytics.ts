import type { InstagramService } from '../InstagramService.js';

export class InstagramAnalyticsTool {
  readonly id = 'instagramAnalytics';
  readonly name = 'instagramAnalytics';
  readonly displayName = 'Engagement Analytics';
  readonly description = 'Get engagement analytics for a specific Instagram post or the account overall.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      scope: { type: 'string', enum: ['post', 'account'], description: 'Whether to get post-level or account-level analytics', default: 'account' },
      mediaId: { type: 'string', description: 'Media ID to analyze (required for post scope)' },
    },
  };

  constructor(private service: InstagramService) {}

  async execute(args: { scope?: string; mediaId?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      if (args.scope === 'post' && args.mediaId) {
        const insights = await this.service.getMediaInsights(args.mediaId);
        return { success: true, data: insights };
      }
      const account = await this.service.getAccountInsights();
      return { success: true, data: account };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
