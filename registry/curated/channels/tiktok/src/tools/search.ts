/**
 * @fileoverview ITool for searching videos and creators on TikTok.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { TikTokService } from '../TikTokService';

export class TikTokSearchTool implements ITool {
  public readonly id = 'tiktokSearch';
  public readonly name = 'tiktokSearch';
  public readonly displayName = 'Search TikTok';
  public readonly description = 'Search for videos or creators on TikTok by keyword.';
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
        enum: ['video', 'user'],
        description: 'Search type: video or user (default: video)',
      },
      maxResults: { type: 'number', description: 'Max results to return (default: 10, max: 100)' },
      cursor: { type: 'number', description: 'Pagination cursor for next page' },
    },
  };

  constructor(private readonly service: TikTokService) {}

  async execute(
    args: { query: string; type?: 'video' | 'user'; maxResults?: number; cursor?: number },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const searchType = args.type ?? 'video';

      if (searchType === 'user') {
        const users = await this.service.searchUsers(args.query, args.maxResults);
        return { success: true, data: { type: 'user', results: users, count: users.length } };
      }

      const videos = await this.service.searchVideos({
        query: args.query,
        maxResults: args.maxResults,
        cursor: args.cursor,
      });
      return { success: true, data: { type: 'video', results: videos, count: videos.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}
