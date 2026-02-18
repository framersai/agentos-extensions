/**
 * @fileoverview ITool for uploading videos to TikTok.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokUploadTool implements ITool {
  public readonly id = 'tiktokUpload';
  public readonly name = 'tiktokUpload';
  public readonly displayName = 'Upload Video';
  public readonly description = 'Upload a video to TikTok with caption, hashtags, and privacy settings.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['videoUrl', 'caption'] as const,
    properties: {
      videoUrl: { type: 'string', description: 'URL of the video to upload' },
      caption: { type: 'string', description: 'Video caption' },
      hashtags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hashtags to append to caption',
      },
      privacyLevel: {
        type: 'string',
        enum: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'],
        description: 'Privacy level (default: PUBLIC_TO_EVERYONE)',
      },
      disableComment: { type: 'boolean', description: 'Disable comments on this video' },
      disableDuet: { type: 'boolean', description: 'Disable duets for this video' },
      disableStitch: { type: 'boolean', description: 'Disable stitches for this video' },
      coverTimestampMs: { type: 'number', description: 'Timestamp in ms for cover image' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: {
      videoUrl: string;
      caption: string;
      hashtags?: string[];
      privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'FOLLOWER_OF_CREATOR' | 'SELF_ONLY';
      disableComment?: boolean;
      disableDuet?: boolean;
      disableStitch?: boolean;
      coverTimestampMs?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const result = await this.service.uploadVideo({
        videoUrl: args.videoUrl,
        caption: args.caption,
        hashtags: args.hashtags,
        privacyLevel: args.privacyLevel,
        disableComment: args.disableComment,
        disableDuet: args.disableDuet,
        disableStitch: args.disableStitch,
        coverTimestampMs: args.coverTimestampMs,
      });

      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
