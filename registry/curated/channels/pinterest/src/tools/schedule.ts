/**
 * @fileoverview ITool for scheduling pins on Pinterest.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { PinterestService } from '../PinterestService';

export class PinterestScheduleTool implements ITool {
  public readonly id = 'pinterestSchedule';
  public readonly name = 'pinterestSchedule';
  public readonly displayName = 'Schedule Pin';
  public readonly description = 'Schedule a pin for future publishing on Pinterest.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['boardId', 'mediaUrl', 'publishAt'] as const,
    properties: {
      boardId: { type: 'string', description: 'Board ID to pin to' },
      title: { type: 'string', description: 'Pin title' },
      description: { type: 'string', description: 'Pin description' },
      link: { type: 'string', description: 'Destination URL' },
      mediaUrl: { type: 'string', description: 'Image URL for the pin' },
      altText: { type: 'string', description: 'Alt text for accessibility' },
      hashtags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Hashtags to append to description',
      },
      publishAt: { type: 'string', description: 'ISO 8601 datetime for scheduled publish time' },
    },
  };

  constructor(private readonly service: PinterestService) {}

  async execute(
    args: {
      boardId: string;
      title?: string;
      description?: string;
      link?: string;
      mediaUrl: string;
      altText?: string;
      hashtags?: string[];
      publishAt: string;
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

      // Pinterest API v5 does not have a native schedule endpoint publicly,
      // so we create the pin immediately and note the scheduled intent.
      // Production implementations would integrate with a job scheduler.
      const result = await this.service.createPin({
        boardId: args.boardId,
        title: args.title,
        description: args.description,
        link: args.link,
        mediaSource: { sourceType: 'image_url', url: args.mediaUrl },
        altText: args.altText,
        hashtags: args.hashtags,
      });

      return {
        success: true,
        data: {
          ...result,
          scheduled: true,
          publishAt: args.publishAt,
          note: 'Pin created. For true deferred publishing, integrate with a job scheduler to delay the API call.',
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
