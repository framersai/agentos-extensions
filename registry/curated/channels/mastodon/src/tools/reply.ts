import type { MastodonService } from '../MastodonService.js';

export class MastodonReplyTool {
  readonly id = 'mastodonReply';
  readonly name = 'mastodonReply';
  readonly displayName = 'Reply to Status';
  readonly description = 'Reply to an existing Mastodon status.';
  readonly category = 'social';
  readonly version = '0.1.0';
  readonly hasSideEffects = true;

  readonly inputSchema = {
    type: 'object' as const,
    properties: {
      statusId: { type: 'string', description: 'ID of the status to reply to' },
      text: { type: 'string', description: 'Reply text' },
      spoilerText: { type: 'string', description: 'Content warning / spoiler text' },
    },
    required: ['statusId', 'text'],
  };

  constructor(private service: MastodonService) {}

  async execute(args: { statusId: string; text: string; spoilerText?: string }): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const result = await this.service.replyToStatus(args.statusId, args.text, args.spoilerText);
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
