/**
 * @fileoverview ITool for creating pins on Pinterest.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestPinTool implements ITool {
  public readonly id = 'pinterestPin';
  public readonly name = 'pinterestPin';
  public readonly displayName = 'Create Pin';
  public readonly description = 'Create a pin on Pinterest with an image, video, or carousel of images.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['boardId', 'mediaType', 'mediaUrl'] as const,
    properties: {
      boardId: { type: 'string', description: 'Board ID to pin to' },
      title: { type: 'string', description: 'Pin title' },
      description: { type: 'string', description: 'Pin description' },
      link: { type: 'string', description: 'Destination URL' },
      mediaType: {
        type: 'string',
        enum: ['image', 'video', 'carousel'],
        description: 'Type of media: image, video, or carousel',
      },
      mediaUrl: { type: 'string', description: 'Primary media URL (image URL or video ID)' },
      mediaUrls: {
        type: 'array',
        items: { type: 'string' },
        description: 'Multiple image URLs for carousel pins',
      },
      coverImageUrl: { type: 'string', description: 'Cover image URL for video pins' },
      altText: { type: 'string', description: 'Alt text for accessibility' },
      hashtags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hashtags to append to description',
      },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: {
      boardId: string;
      title?: string;
      description?: string;
      link?: string;
      mediaType: 'image' | 'video' | 'carousel';
      mediaUrl: string;
      mediaUrls?: string[];
      coverImageUrl?: string;
      altText?: string;
      hashtags?: string[];
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      let mediaSource: any;

      switch (args.mediaType) {
        case 'image':
          mediaSource = { sourceType: 'image_url', url: args.mediaUrl };
          break;
        case 'video':
          mediaSource = { sourceType: 'video_id', videoId: args.mediaUrl, coverImageUrl: args.coverImageUrl };
          break;
        case 'carousel':
          mediaSource = { sourceType: 'multiple_image_urls', urls: args.mediaUrls ?? [args.mediaUrl] };
          break;
      }

      const result = await this.service.createPin({
        boardId: args.boardId,
        title: args.title,
        description: args.description,
        link: args.link,
        mediaSource,
        altText: args.altText,
        hashtags: args.hashtags,
      });

      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
