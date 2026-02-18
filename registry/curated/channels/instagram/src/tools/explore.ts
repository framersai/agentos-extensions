import type { InstagramService } from '../InstagramService.js';

export class InstagramExploreTool {
  readonly id = 'instagramExplore';
  readonly name = 'instagramExplore';
  readonly displayName = 'Explore/Discover';
  readonly description = 'Browse recent media from the authenticated Instagram account. For public explore/discover, use browser automation.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      limit: { type: 'number', description: 'Number of recent posts to fetch', default: 20 },
    },
  };

  constructor(private service: InstagramService) {}

  async execute(args: { limit?: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const media = await this.service.getRecentMedia(args.limit);
      return { success: true, data: media };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
