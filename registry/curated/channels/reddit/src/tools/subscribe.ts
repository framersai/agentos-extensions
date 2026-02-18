/**
 * @fileoverview ITool for subscribing to or unsubscribing from subreddits via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditSubscribeTool implements ITool {
  public readonly id = 'redditSubscribe';
  public readonly name = 'reddit.subscribe';
  public readonly displayName = 'Reddit Subscribe';
  public readonly description =
    'Subscribe to (join) or unsubscribe from (leave) a subreddit.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['subreddit', 'action'] as const,
    properties: {
      subreddit: {
        type: 'string',
        description: 'Subreddit name to subscribe/unsubscribe (without r/ prefix)',
      },
      action: {
        type: 'string',
        enum: ['subscribe', 'unsubscribe'],
        description: 'Action to perform: subscribe (join) or unsubscribe (leave)',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean', description: 'Whether the action was successful' },
      subreddit: { type: 'string', description: 'The subreddit acted upon' },
      action: { type: 'string', description: 'The action performed' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: { subreddit: string; action: 'subscribe' | 'unsubscribe' },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      await this.service.subscribe(args.subreddit, args.action);

      return {
        success: true,
        output: {
          success: true,
          subreddit: args.subreddit,
          action: args.action,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.subreddit) errors.push('subreddit is required');
    else if (typeof args.subreddit !== 'string') errors.push('subreddit must be a string');
    if (!args.action) errors.push('action is required');
    else if (!['subscribe', 'unsubscribe'].includes(args.action)) {
      errors.push('action must be one of: subscribe, unsubscribe');
    }
    return { isValid: errors.length === 0, errors };
  }
}
