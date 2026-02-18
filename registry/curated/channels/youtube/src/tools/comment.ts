/**
 * @fileoverview ITool for commenting on YouTube videos.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';

export class YouTubeCommentTool implements ITool {
  public readonly id = 'youtubeComment';
  public readonly name = 'youtubeComment';
  public readonly displayName = 'Comment on Video';
  public readonly description = 'Post a comment or reply to an existing comment on a YouTube video.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['videoId', 'text'] as const,
    properties: {
      videoId: { type: 'string', description: 'YouTube video ID' },
      text: { type: 'string', description: 'Comment text' },
      parentCommentId: { type: 'string', description: 'Parent comment ID for replying to a comment' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: { videoId: string; text: string; parentCommentId?: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const result = await this.service.postComment(args.videoId, args.text, args.parentCommentId);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
