/**
 * @fileoverview ITool for TikTok video and creator analytics.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokAnalyticsTool implements ITool {
  public readonly id = 'tiktokAnalytics';
  public readonly name = 'tiktokAnalytics';
  public readonly displayName = 'Video Analytics';
  public readonly description = 'Get performance metrics for a TikTok video or creator account (views, likes, comments, shares).';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['type'] as const,
    properties: {
      type: {
        type: 'string',
        enum: ['video', 'creator'],
        description: 'Whether to get analytics for a specific video or the creator account',
      },
      videoId: { type: 'string', description: 'Video ID (required when type is "video")' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: { type: 'video' | 'creator'; videoId?: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      if (args.type === 'video') {
        if (!args.videoId) throw new Error('videoId is required when type is "video"');
        const analytics = await this.service.getVideoAnalytics(args.videoId);
        return { success: true, data: analytics };
      }

      const creatorStats = await this.service.getCreatorAnalytics();
      return { success: true, data: { type: 'creator', metrics: creatorStats } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
