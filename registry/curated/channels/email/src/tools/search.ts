import type { EmailService } from '../EmailService.js';

export class EmailSearchTool {
  readonly id = 'emailSearch';
  readonly name = 'emailSearch';
  readonly displayName = 'Search Emails';
  readonly description = 'Search emails by query string across subject, body, and sender fields.';
  readonly category = 'communication';
  readonly version = '0.1.0';
  readonly hasSideEffects = false;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query (matches subject, body, and sender)' },
      folder: { type: 'string', description: 'IMAP folder to search (default: INBOX)' },
      since: { type: 'string', description: 'Only return emails since this date (ISO 8601)' },
    },
    required: ['query'],
  };

  constructor(private service: EmailService) {}

  async execute(args: {
    query: string;
    folder?: string;
    since?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const messages = await this.service.searchEmails({
        query: args.query,
        folder: args.folder,
        since: args.since,
      });
      return { success: true, data: { messages, count: messages.length } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
