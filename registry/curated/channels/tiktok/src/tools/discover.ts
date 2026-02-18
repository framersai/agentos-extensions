/**
 * @fileoverview ITool for browsing TikTok For You page content.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokDiscoverTool implements ITool {
  public readonly id = 'tiktokDiscover';
  public readonly name = 'tiktokDiscover';
  public readonly displayName = 'Discover Content';
  public readonly description = 'Browse recommended videos from the TikTok For You page.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      maxResults: { type: 'number', description: 'Max videos to retrieve (default: 20, max: 20)' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: { maxResults?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const videos = await this.service.getRecommendedVideos(args.maxResults);
      return { success: true, data: { videos, count: videos.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
