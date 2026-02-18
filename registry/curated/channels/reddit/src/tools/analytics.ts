/**
 * @fileoverview ITool for fetching Reddit user karma and activity analytics via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditAnalyticsTool implements ITool {
  public readonly id = 'redditAnalytics';
  public readonly name = 'reddit.analytics';
  public readonly displayName = 'Reddit Analytics';
  public readonly description =
    'Get karma analytics and activity summary for a Reddit user. Includes link/comment karma breakdown, top subreddits, and recent activity counts. Omit username to get analytics for the authenticated account.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = false;

  public readonly inputSchema = {
    type: 'object' as const,
    required: [] as const,
    properties: {
      username: {
        type: 'string',
        description: 'Reddit username to analyze (without u/ prefix). Omit for self.',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      username: { type: 'string', description: 'Reddit username' },
      linkKarma: { type: 'number', description: 'Karma from posts' },
      commentKarma: { type: 'number', description: 'Karma from comments' },
      totalKarma: { type: 'number', description: 'Combined karma total' },
      accountCreatedUtc: { type: 'number', description: 'Account creation timestamp (UTC)' },
      isGold: { type: 'boolean', description: 'Whether user has Reddit Gold/Premium' },
      isMod: { type: 'boolean', description: 'Whether user is a moderator' },
      topSubreddits: {
        type: 'array',
        description: 'Most active subreddits',
        items: {
          type: 'object',
          properties: {
            subreddit: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
      recentActivity: {
        type: 'object',
        description: 'Recent activity counts',
        properties: {
          posts: { type: 'number', description: 'Number of recent posts' },
          comments: { type: 'number', description: 'Number of recent comments' },
        },
      },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: { username?: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      const analytics = await this.service.getAnalytics(args.username);

      return {
        success: true,
        output: analytics,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (args.username !== undefined && typeof args.username !== 'string') {
      errors.push('username must be a string');
    }
    return { isValid: errors.length === 0, errors };
  }
}
