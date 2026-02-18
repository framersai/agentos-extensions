/**
 * @fileoverview ITool for engaging with TikTok content (like, comment, share).
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokEngageTool implements ITool {
  public readonly id = 'tiktokEngage';
  public readonly name = 'tiktokEngage';
  public readonly displayName = 'Engage';
  public readonly description = 'Like or comment on a TikTok video.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['action', 'videoId'] as const,
    properties: {
      action: {
        type: 'string',
        enum: ['like', 'comment'],
        description: 'Engagement action to perform',
      },
      videoId: { type: 'string', description: 'Video ID to engage with' },
      text: { type: 'string', description: 'Comment text (required for comment action)' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: { action: 'like' | 'comment'; videoId: string; text?: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      switch (args.action) {
        case 'like': {
          await this.service.likeVideo(args.videoId);
          return { success: true, data: { action: 'like', videoId: args.videoId } };
        }
        case 'comment': {
          if (!args.text) throw new Error('text is required for comment action');
          const result = await this.service.commentOnVideo(args.videoId, args.text);
          return { success: true, data: { action: 'comment', videoId: args.videoId, commentId: result.commentId } };
        }
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
