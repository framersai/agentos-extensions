import type { EmailService } from '../EmailService.js';

export class EmailReplyTool {
  readonly id = 'emailReply';
  readonly name = 'emailReply';
  readonly displayName = 'Reply to Email';
  readonly description = 'Reply to an email thread, maintaining conversation context with proper In-Reply-To and References headers.';
  readonly category = 'communication';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      messageId: { type: 'string', description: 'Message ID of the email to reply to' },
      body: { type: 'string', description: 'Plain text reply body' },
      html: { type: 'string', description: 'Optional HTML reply body' },
    },
    required: ['messageId', 'body'],
  };

  constructor(private service: EmailService) {}

  async execute(args: {
    messageId: string;
    body: string;
    html?: string;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.replyToEmail(args.messageId, args.body, args.html);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
