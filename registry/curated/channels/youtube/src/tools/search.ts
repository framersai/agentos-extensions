/**
 * @fileoverview ITool for searching videos, channels, and playlists on YouTube.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { YouTubeService } from '../YouTubeService';

export class YouTubeSearchTool implements ITool {
  public readonly id = 'youtubeSearch';
  public readonly name = 'youtubeSearch';
  public readonly displayName = 'Search YouTube';
  public readonly description = 'Search for videos, channels, or playlists on YouTube by keyword.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['query'] as const,
    properties: {
      query: { type: 'string', description: 'Search query' },
      type: {
        type: 'string',
        enum: ['video', 'channel', 'playlist'],
        description: 'Search type (default: video)',
      },
      maxResults: { type: 'number', description: 'Max results to return (default: 10, max: 50)' },
      order: {
        type: 'string',
        enum: ['relevance', 'date', 'rating', 'viewCount', 'title'],
        description: 'Sort order (default: relevance)',
      },
      regionCode: { type: 'string', description: 'ISO 3166-1 alpha-2 region code (e.g., "US", "GB")' },
    },
  };

  constructor(private readonly service: YouTubeService) {}

  async execute(
    args: {
      query: string;
      type?: 'video' | 'channel' | 'playlist';
      maxResults?: number;
      order?: string;
      regionCode?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const results = await this.service.search(args.query, {
        type: args.type,
        maxResults: args.maxResults,
        order: args.order,
        regionCode: args.regionCode,
      });

      return { success: true, data: { results, count: results.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
