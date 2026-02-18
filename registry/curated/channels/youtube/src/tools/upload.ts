/**
 * @fileoverview ITool for uploading videos to YouTube.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';
import { Readable } from 'stream';
import https from 'https';
import http from 'http';

export class YouTubeUploadTool implements ITool {
  public readonly id = 'youtubeUpload';
  public readonly name = 'youtubeUpload';
  public readonly displayName = 'Upload Video';
  public readonly description = 'Upload a video to YouTube with title, description, tags, and privacy settings.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['videoUrl', 'title', 'description'] as const,
    properties: {
      videoUrl: { type: 'string', description: 'URL of the video file to upload' },
      title: { type: 'string', description: 'Video title (max 100 chars)' },
      description: { type: 'string', description: 'Video description (max 5000 chars)' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Video tags for discoverability',
      },
      categoryId: { type: 'string', description: 'YouTube category ID (default: "22" People & Blogs)' },
      privacyStatus: {
        type: 'string',
        enum: ['public', 'private', 'unlisted'],
        description: 'Privacy status (default: public)',
      },
      mimeType: { type: 'string', description: 'Video MIME type (default: video/mp4)' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: {
      videoUrl: string;
      title: string;
      description: string;
      tags?: string[];
      categoryId?: string;
      privacyStatus?: 'public' | 'private' | 'unlisted';
      mimeType?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const videoStream = await this.fetchStream(args.videoUrl);

      const result = await this.service.uploadVideo({
        title: args.title,
        description: args.description,
        tags: args.tags,
        categoryId: args.categoryId,
        privacyStatus: args.privacyStatus,
        videoStream,
        mimeType: args.mimeType,
      });

      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private fetchStream(url: string): Promise<Readable> {
    const fetcher = url.startsWith('https') ? https : http;
    return new Promise((resolve, reject) => {
      fetcher.get(url, (res) => resolve(res)).on('error', reject);
    });
  }
}
