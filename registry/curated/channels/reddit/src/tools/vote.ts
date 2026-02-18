/**
 * @fileoverview ITool for voting (upvote/downvote) on Reddit content via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditVoteTool implements ITool {
  public readonly id = 'redditVote';
  public readonly name = 'reddit.vote';
  public readonly displayName = 'Reddit Vote';
  public readonly description =
    'Upvote, downvote, or remove vote on a Reddit post or comment. Provide the fullname (e.g. t3_abc123 or t1_xyz789) and vote direction.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['thingId', 'direction'] as const,
    properties: {
      thingId: {
        type: 'string',
        description: 'Reddit fullname of the post (t3_xxx) or comment (t1_xxx) to vote on',
      },
      direction: {
        type: 'string',
        enum: ['up', 'down', 'none'],
        description: 'Vote direction: up (upvote), down (downvote), or none (remove vote)',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      success: { type: 'boolean', description: 'Whether the vote was applied' },
      thingId: { type: 'string', description: 'The thing that was voted on' },
      direction: { type: 'string', description: 'The vote direction applied' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: { thingId: string; direction: 'up' | 'down' | 'none' },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      await this.service.vote(args.thingId, args.direction);

      return {
        success: true,
        output: {
          success: true,
          thingId: args.thingId,
          direction: args.direction,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.thingId) errors.push('thingId is required');
    else if (typeof args.thingId !== 'string') errors.push('thingId must be a string');
    if (!args.direction) errors.push('direction is required');
    else if (!['up', 'down', 'none'].includes(args.direction)) {
      errors.push('direction must be one of: up, down, none');
    }
    return { isValid: errors.length === 0, errors };
  }
}
