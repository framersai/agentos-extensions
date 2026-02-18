/**
 * @fileoverview ITool for YouTube channel and video analytics.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';

export class YouTubeAnalyticsTool implements ITool {
  public readonly id = 'youtubeAnalytics';
  public readonly name = 'youtubeAnalytics';
  public readonly displayName = 'Video Analytics';
  public readonly description = 'Get performance metrics for a YouTube video or channel (views, likes, comments, subscribers).';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['type'] as const,
    properties: {
      type: {
        type: 'string',
        enum: ['video', 'channel'],
        description: 'Whether to get analytics for a video or a channel',
      },
      videoId: { type: 'string', description: 'Video ID (required when type is "video")' },
      channelId: { type: 'string', description: 'Channel ID (optional for type "channel" — defaults to own channel if OAuth is set up)' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: { type: 'video' | 'channel'; videoId?: string; channelId?: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      if (args.type === 'video') {
        if (!args.videoId) throw new Error('videoId is required when type is "video"');
        const stats = await this.service.getVideoStatistics(args.videoId);
        return { success: true, data: stats };
      }

      const stats = await this.service.getChannelStatistics(args.channelId);
      return { success: true, data: { type: 'channel', channelId: args.channelId ?? 'self', metrics: stats } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
