/**
 * @fileoverview ITool for reading and sending Reddit private messages via the Reddit channel adapter.
 */

import type { ITool, ToolExecutionContext, ToolExecutionResult } from '@framers/agentos';
import type { RedditService } from '../RedditService';

export class RedditInboxTool implements ITool {
  public readonly id = 'redditInbox';
  public readonly name = 'reddit.inbox';
  public readonly displayName = 'Reddit Inbox';
  public readonly description =
    'Read inbox messages or send a private message to a Reddit user. Use action "read" to fetch messages or "send" to compose a new message.';
  public readonly category = 'social';
  public readonly version = '0.1.0';
  public readonly hasSideEffects = true;

  public readonly inputSchema = {
    type: 'object' as const,
    required: ['action'] as const,
    properties: {
      action: {
        type: 'string',
        enum: ['read', 'send'],
        description: 'Action: read (fetch inbox) or send (compose message)',
      },
      filter: {
        type: 'string',
        enum: ['unread', 'all'],
        description: 'Filter for read action: unread or all (default: all)',
      },
      limit: {
        type: 'number',
        description: 'Max messages to fetch for read action (1-100, default: 25)',
        minimum: 1,
        maximum: 100,
      },
      to: {
        type: 'string',
        description: 'Recipient username for send action (without u/ prefix)',
      },
      subject: {
        type: 'string',
        description: 'Message subject for send action',
      },
      body: {
        type: 'string',
        description: 'Message body for send action (supports Reddit Markdown)',
      },
    },
  };

  public readonly outputSchema = {
    type: 'object' as const,
    properties: {
      messages: {
        type: 'array',
        description: 'Inbox messages (for read action)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            author: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
            createdUtc: { type: 'number' },
            isUnread: { type: 'boolean' },
          },
        },
      },
      sent: { type: 'boolean', description: 'Whether message was sent (for send action)' },
      count: { type: 'number', description: 'Number of messages returned' },
    },
  };

  constructor(private readonly service: RedditService) {}

  async execute(
    args: {
      action: 'read' | 'send';
      filter?: 'unread' | 'all';
      limit?: number;
      to?: string;
      subject?: string;
      body?: string;
    },
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    try {
      if (args.action === 'read') {
        const messages = await this.service.getInbox({
          filter: args.filter,
          limit: args.limit,
        });

        return {
          success: true,
          output: {
            messages,
            count: messages.length,
          },
        };
      }

      if (args.action === 'send') {
        if (!args.to) throw new Error('Recipient (to) is required for send action');
        if (!args.subject) throw new Error('Subject is required for send action');
        if (!args.body) throw new Error('Body is required for send action');

        await this.service.sendMessage(args.to, args.subject, args.body);

        return {
          success: true,
          output: { sent: true },
        };
      }

      throw new Error(`Unknown action: ${args.action}`);
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  validateArgs(args: Record<string, any>): { isValid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!args.action) errors.push('action is required');
    else if (!['read', 'send'].includes(args.action)) {
      errors.push('action must be one of: read, send');
    }

    if (args.action === 'send') {
      if (!args.to) errors.push('to is required for send action');
      if (!args.subject) errors.push('subject is required for send action');
      if (!args.body) errors.push('body is required for send action');
    }

    if (args.filter && !['unread', 'all'].includes(args.filter)) {
      errors.push('filter must be one of: unread, all');
    }
    if (args.limit !== undefined) {
      if (typeof args.limit !== 'number') errors.push('limit must be a number');
      else if (args.limit < 1 || args.limit > 100) errors.push('limit must be between 1 and 100');
    }
    return { isValid: errors.length === 0, errors };
  }
}
