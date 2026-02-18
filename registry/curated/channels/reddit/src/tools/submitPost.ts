/**
 * @fileoverview ITool for submitting posts to a subreddit via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditSubmitPostTool implements ITool {
  public readonly id = 'redditSubmitPost';
  public readonly name = 'reddit.post';
  public readonly displayName = 'Submit Reddit Post';
  public readonly description =
    'Submit a new post to a subreddit. Supports text, link, image, and poll post types.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['subreddit', 'title', 'content', 'type'] as const,
    properties: {
      subreddit: { type: 'string', description: 'Target subreddit name (without r/ prefix)' },
      title: { type: 'string', description: 'Post title (max 300 characters)' },
      content: {
        type: 'string',
        description: 'Post body text (for text/poll), URL (for link/image)',
      },
      type: {
        type: 'string',
        enum: ['text', 'link', 'image', 'poll'],
        description: 'Post type: text, link, image, or poll',
      },
      pollOptions: {
        type: 'array',
        description: 'Poll answer options (required for poll type)',
        items: { type: 'string' },
      },
      pollDurationDays: {
        type: 'number',
        description: 'Poll duration in days (1-7, default 3)',
      },
      flairId: { type: 'string', description: 'Optional flair ID for the post' },
      nsfw: { type: 'boolean', description: 'Mark post as NSFW' },
      spoiler: { type: 'boolean', description: 'Mark post as spoiler' },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'Post ID' },
      name: { type: 'string', description: 'Reddit fullname (e.g. t3_abc123)' },
      url: { type: 'string', description: 'Full URL to the post' },
      permalink: { type: 'string', description: 'Reddit permalink' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: {
      subreddit: string;
      title: string;
      content: string;
      type: 'text' | 'link' | 'image' | 'poll';
      pollOptions?: string[];
      pollDurationDays?: number;
      flairId?: string;
      nsfw?: boolean;
      spoiler?: boolean;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      if (args.title.length > 300) {
        throw new Error('Post title exceeds 300 character limit');
      }

      if (args.type === 'poll' && (!args.pollOptions || args.pollOptions.length < 2)) {
        throw new Error('Poll posts require at least 2 poll options');
      }

      const result = await this.service.submitPost({
        subreddit: args.subreddit,
        title: args.title,
        content: args.content,
        type: args.type,
        pollOptions: args.pollOptions,
        pollDurationDays: args.pollDurationDays,
        flairId: args.flairId,
        nsfw: args.nsfw,
        spoiler: args.spoiler,
      });

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
    if (!args.subreddit) errors.push('subreddit is required');
    if (!args.title) errors.push('title is required');
    else if (typeof args.title !== 'string') errors.push('title must be a string');
    else if (args.title.length > 300) errors.push('title exceeds 300 character limit');
    if (!args.content && args.content !== '') errors.push('content is required');
    if (!args.type) errors.push('type is required');
    else if (!['text', 'link', 'image', 'poll'].includes(args.type)) {
      errors.push('type must be one of: text, link, image, poll');
    }
    if (args.type === 'poll' && (!args.pollOptions || !Array.isArray(args.pollOptions) || args.pollOptions.length < 2)) {
      errors.push('poll type requires at least 2 pollOptions');
    }
    return { isValid: errors.length === 0, errors };
  }
}
