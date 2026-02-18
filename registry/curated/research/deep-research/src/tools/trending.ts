import type { ResearchService } from '../ResearchService.js';

export class ResearchTrendingTool {
  readonly id = 'researchTrending';
  readonly name = 'researchTrending';
  readonly displayName = 'Trend Discovery';
  readonly description = 'Discover trending topics and content across platforms (Twitter, Reddit, YouTube, HackerNews).';
  readonly category = 'research';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      platform: {
        type: 'string',
        enum: ['twitter', 'reddit', 'youtube', 'hackernews'],
        description: 'Platform to discover trends from (default: hackernews)',
      },
      category: { type: 'string', description: 'Category or subreddit to filter trends (optional)' },
    },
  };

  constructor(private service: ResearchService) {}

  async execute(args: {
    platform?: string;
    category?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.discoverTrending(
        args.platform ?? 'hackernews',
        args.category,
      );
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
