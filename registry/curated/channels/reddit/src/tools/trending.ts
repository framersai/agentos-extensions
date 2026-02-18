/**
 * @fileoverview ITool for fetching trending posts and subreddits via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditTrendingTool implements ITool {
  public readonly id = 'redditTrending';
  public readonly name = 'reddit.trending';
  public readonly displayName = 'Reddit Trending';
  public readonly description =
    'Get trending posts from Reddit front page or a specific subreddit. Supports hot, top, rising, new, and controversial sorting.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      subreddit: {
        type: 'string',
        description: 'Optional subreddit to fetch trending from (without r/ prefix). Omit for front page.',
      },
      sort: {
        type: 'string',
        enum: ['hot', 'top', 'rising', 'new', 'controversial'],
        description: 'Sort order (default: hot)',
      },
      time: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
        description: 'Time filter (applies to top and controversial, default: day)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      posts: {
        type: 'array',
        description: 'Trending posts',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            author: { type: 'string' },
            subreddit: { type: 'string' },
            score: { type: 'number' },
            numComments: { type: 'number' },
            url: { type: 'string' },
            permalink: { type: 'string' },
            createdUtc: { type: 'number' },
          },
        },
      },
      count: { type: 'number', description: 'Number of posts returned' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: {
      subreddit?: string;
      sort?: 'hot' | 'top' | 'rising' | 'new' | 'controversial';
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      limit?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const posts = await this.service.getTrending({
        subreddit: args.subreddit,
        sort: args.sort,
        time: args.time,
        limit: args.limit,
      });

      return {
        success: true,
        output: {
          posts,
          count: posts.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (args.sort && !['hot', 'top', 'rising', 'new', 'controversial'].includes(args.sort)) {
      errors.push('sort must be one of: hot, top, rising, new, controversial');
    }
    if (args.time && !['hour', 'day', 'week', 'month', 'year', 'all'].includes(args.time)) {
      errors.push('time must be one of: hour, day, week, month, year, all');
    }
    if (args.limit !== undefined) {
      if (typeof args.limit !== 'number') errors.push('limit must be a number');
      else if (args.limit < 1 || args.limit > 100) errors.push('limit must be between 1 and 100');
    }
    return { isValid: errors.length === 0, errors };
  }
}
