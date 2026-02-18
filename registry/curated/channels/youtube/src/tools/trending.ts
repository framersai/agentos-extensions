/**
 * @fileoverview ITool for getting trending videos on YouTube.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';

export class YouTubeTrendingTool implements ITool {
  public readonly id = 'youtubeTrending';
  public readonly name = 'youtubeTrending';
  public readonly displayName = 'Get Trending';
  public readonly description = 'Get the most popular (trending) videos on YouTube by region and category.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      regionCode: { type: 'string', description: 'ISO 3166-1 alpha-2 region code (default: "US")' },
      categoryId: {
        type: 'string',
        description: 'YouTube video category ID (e.g., "10" for Music, "17" for Sports, "20" for Gaming)',
      },
      maxResults: { type: 'number', description: 'Max results to return (default: 20, max: 50)' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: { regionCode?: string; categoryId?: string; maxResults?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const videos = await this.service.getTrending(
        args.regionCode,
        args.categoryId,
        args.maxResults,
      );

      return { success: true, data: { videos, count: videos.length, regionCode: args.regionCode ?? 'US' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
