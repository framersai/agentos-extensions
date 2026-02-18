/**
 * @fileoverview ITool for getting trending sounds and hashtags on TikTok.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokTrendingTool implements ITool {
  public readonly id = 'tiktokTrending';
  public readonly name = 'tiktokTrending';
  public readonly displayName = 'Get Trending';
  public readonly description = 'Get trending sounds and hashtags on TikTok.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      type: {
        type: 'string',
        enum: ['hashtags', 'sounds', 'both'],
        description: 'Type of trending content to retrieve (default: both)',
      },
      maxResults: { type: 'number', description: 'Max results per category (default: 20, max: 100)' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: { type?: 'hashtags' | 'sounds' | 'both'; maxResults?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const trendType = args.type ?? 'both';
      const maxResults = args.maxResults ?? 20;

      const result: Record<string, any> = {};

      if (trendType === 'hashtags' || trendType === 'both') {
        result.hashtags = await this.service.getTrendingHashtags(maxResults);
      }

      if (trendType === 'sounds' || trendType === 'both') {
        result.sounds = await this.service.getTrendingSounds(maxResults);
      }

      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
