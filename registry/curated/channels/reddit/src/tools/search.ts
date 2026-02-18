/**
 * @fileoverview ITool for searching Reddit posts and subreddits via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditSearchTool implements ITool {
  public readonly id = 'redditSearch';
  public readonly name = 'reddit.search';
  public readonly displayName = 'Reddit Search';
  public readonly description =
    'Search for posts across Reddit or within a specific subreddit. Supports sorting, time filtering, and result limits.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['query'] as const,
    properties: {
      query: { type: 'string', description: 'Search query string' },
      subreddit: {
        type: 'string',
        description: 'Optional subreddit to search within (without r/ prefix)',
      },
      sort: {
        type: 'string',
        enum: ['relevance', 'hot', 'top', 'new', 'comments'],
        description: 'Sort order for results (default: relevance)',
      },
      time: {
        type: 'string',
        enum: ['hour', 'day', 'week', 'month', 'year', 'all'],
        description: 'Time filter for results (default: all)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      results: {
        type: 'array',
        description: 'Search results',
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
            selftext: { type: 'string' },
          },
        },
      },
      count: { type: 'number', description: 'Number of results returned' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: {
      query: string;
      subreddit?: string;
      sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments';
      time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
      limit?: number;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const results = await this.service.search(args.query, {
        subreddit: args.subreddit,
        sort: args.sort,
        time: args.time,
        limit: args.limit,
      });

      return {
        success: true,
        output: {
          results,
          count: results.length,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.query) errors.push('query is required');
    else if (typeof args.query !== 'string') errors.push('query must be a string');
    if (args.sort && !['relevance', 'hot', 'top', 'new', 'comments'].includes(args.sort)) {
      errors.push('sort must be one of: relevance, hot, top, new, comments');
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
