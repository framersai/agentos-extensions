/**
 * @fileoverview ITool for commenting on posts or replying to comments via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditCommentTool implements ITool {
  public readonly id = 'redditComment';
  public readonly name = 'reddit.comment';
  public readonly displayName = 'Reddit Comment';
  public readonly description =
    'Comment on a Reddit post or reply to an existing comment. Provide the post or comment fullname (e.g. t3_abc123 or t1_xyz789) and the comment text.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['thingId', 'text'] as const,
    properties: {
      thingId: {
        type: 'string',
        description: 'Reddit fullname of the post (t3_xxx) or comment (t1_xxx) to reply to',
      },
      text: {
        type: 'string',
        description: 'Comment text (supports Reddit Markdown, max 10000 characters)',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'Comment ID' },
      name: { type: 'string', description: 'Reddit fullname (e.g. t1_abc123)' },
      permalink: { type: 'string', description: 'Permalink to the comment' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: { thingId: string; text: string },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      if (args.text.length > 10_000) {
        throw new Error('Comment text exceeds 10000 character limit');
      }

      const result = await this.service.comment(args.thingId, args.text);

      return {
        success: true,
        output: result,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.thingId) errors.push('thingId is required');
    else if (typeof args.thingId !== 'string') errors.push('thingId must be a string');
    if (!args.text) errors.push('text is required');
    else if (typeof args.text !== 'string') errors.push('text must be a string');
    else if (args.text.length > 10_000) errors.push('text exceeds 10000 character limit');
    return { isValid: errors.length === 0, errors };
  }
}
