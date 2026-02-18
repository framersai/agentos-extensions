/**
 * @fileoverview ITool for scheduling video publishing on YouTube.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';
import { Readable } from 'stream';
import https from 'https';
import http from 'http';

export class YouTubeScheduleTool implements ITool {
  public readonly id = 'youtubeSchedule';
  public readonly name = 'youtubeSchedule';
  public readonly displayName = 'Schedule Video';
  public readonly description = 'Upload a video and schedule it for future publishing on YouTube. The video is uploaded as private and automatically goes public at the scheduled time.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['videoUrl', 'title', 'description', 'publishAt'] as const,
    properties: {
      videoUrl: { type: 'string', description: 'URL of the video file to upload' },
      title: { type: 'string', description: 'Video title (max 100 chars)' },
      description: { type: 'string', description: 'Video description (max 5000 chars)' },
      publishAt: { type: 'string', description: 'ISO 8601 datetime for scheduled publish time' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Video tags for discoverability',
      },
      categoryId: { type: 'string', description: 'YouTube category ID (default: "22" People & Blogs)' },
      mimeType: { type: 'string', description: 'Video MIME type (default: video/mp4)' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: {
      videoUrl: string;
      title: string;
      description: string;
      publishAt: string;
      tags?: string[];
      categoryId?: string;
      mimeType?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const publishDate = new Date(args.publishAt);
      if (isNaN(publishDate.getTime())) {
        throw new Error('Invalid publishAt date — provide a valid ISO 8601 datetime');
      }
      if (publishDate.getTime() <= Date.now()) {
        throw new Error('publishAt must be in the future');
      }

      const videoStream = await this.fetchStream(args.videoUrl);

      const result = await this.service.uploadVideo({
        title: args.title,
        description: args.description,
        tags: args.tags,
        categoryId: args.categoryId,
        videoStream,
        mimeType: args.mimeType,
        publishAt: args.publishAt,
      });

      return {
        success: true,
        data: {
          ...result,
          scheduled: true,
          publishAt: args.publishAt,
        },
      };
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
