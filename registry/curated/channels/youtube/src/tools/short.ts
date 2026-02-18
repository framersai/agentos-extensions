/**
 * @fileoverview ITool for uploading YouTube Shorts.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';
import { Readable } from 'stream';
import https from 'https';
import http from 'http';

export class YouTubeShortTool implements ITool {
  public readonly id = 'youtubeShort';
  public readonly name = 'youtubeShort';
  public readonly displayName = 'Upload Short';
  public readonly description = 'Upload a YouTube Short (vertical video under 60 seconds) with #Shorts tag.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['videoUrl', 'title'] as const,
    properties: {
      videoUrl: { type: 'string', description: 'URL of the short-form video file' },
      title: { type: 'string', description: 'Short title (max 100 chars)' },
      description: { type: 'string', description: 'Short description' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Additional tags (besides #Shorts)',
      },
      privacyStatus: {
        type: 'string',
        enum: ['public', 'private', 'unlisted'],
        description: 'Privacy status (default: public)',
      },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: {
      videoUrl: string;
      title: string;
      description?: string;
      tags?: string[];
      privacyStatus?: 'public' | 'private' | 'unlisted';
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const videoStream = await this.fetchStream(args.videoUrl);

      const result = await this.service.uploadVideo({
        title: args.title,
        description: args.description ?? '',
        tags: [...(args.tags ?? []), 'Shorts'],
        privacyStatus: args.privacyStatus,
        videoStream,
        isShort: true,
      });

      return { success: true, data: { ...result, isShort: true } };
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
